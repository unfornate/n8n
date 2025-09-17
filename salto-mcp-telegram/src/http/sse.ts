import type { Express, Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { env } from "../utils/env.js";
import { logger } from "../utils/logger.js";

const transports = new Map<string, SSEServerTransport>();

const authenticate = (req: Request, res: Response): boolean => {
  if (!env.authBearer) {
    return true;
  }

  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return false;
  }

  const token = header.replace("Bearer ", "").trim();
  if (token !== env.authBearer) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
};

export const registerSseTransport = (app: Express, server: McpServer) => {
  app.get("/sse", async (req, res) => {
    if (!authenticate(req, res)) {
      return;
    }

    const transport = new SSEServerTransport("/messages", res);
    transports.set(transport.sessionId, transport);

    logger.info({ sessionId: transport.sessionId }, "MCP SSE session established");

    res.on("close", () => {
      transports.delete(transport.sessionId);
      logger.info({ sessionId: transport.sessionId }, "MCP SSE session closed");
    });

    await server.connect(transport);
  });

  app.post("/messages", async (req, res) => {
    if (!authenticate(req, res)) {
      return;
    }

    const sessionId = (req.query.sessionId as string) ?? req.header("x-session-id");
    if (!sessionId) {
      res.status(400).json({ error: "sessionId query parameter is required" });
      return;
    }

    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    await transport.handlePostMessage(req, res, req.body);
  });
};
