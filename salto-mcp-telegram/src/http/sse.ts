import type { Express, Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { Logger } from "pino";
import { env } from "../utils/env.js";
import { logger } from "../utils/logger.js";
import { AppError, ErrorCodes, toErrorResponse } from "../utils/errors.js";
import { normalizeIncomingMessage } from "./messages.js";
import { getRegisteredTools } from "../mcp/server.js";

interface SessionInfo {
  id: string;
  transport: SSEServerTransport;
  createdAt: number;
  lastSeenAt: number;
  keepAlive: NodeJS.Timeout;
  logger: Logger;
}

const sessions = new Map<string, SessionInfo>();

const getRequestLogger = (res: Response): Logger =>
  (res.locals?.logger as Logger | undefined) ?? logger;

const authenticate = (req: Request, res: Response): boolean => {
  if (!env.authBearer) {
    return true;
  }

  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    const error = new AppError(401, ErrorCodes.UNAUTHORIZED, "Missing or invalid authorization header");
    res.status(error.statusCode).json(error.toResponse());
    return false;
  }

  const token = header.replace("Bearer ", "").trim();
  if (token !== env.authBearer) {
    const error = new AppError(401, ErrorCodes.UNAUTHORIZED, "Unauthorized");
    res.status(error.statusCode).json(error.toResponse());
    return false;
  }

  return true;
};

const registerDiagnostics = (app: Express) => {
  if (env.nodeEnv === "production") {
    return;
  }

  app.get("/sessions", (_req, res) => {
    const payload = Array.from(sessions.values()).map((session) => ({
      sessionId: session.id,
      createdAt: new Date(session.createdAt).toISOString(),
      lastSeenAt: new Date(session.lastSeenAt).toISOString()
    }));
    res.json({ ok: true, sessions: payload });
  });

  app.get("/tools", (_req, res) => {
    res.json({ ok: true, tools: getRegisteredTools() });
  });
};

export const registerSseTransport = (app: Express, server: McpServer) => {
  registerDiagnostics(app);

  app.get("/sse", async (req, res) => {
    if (!authenticate(req, res)) {
      return;
    }

    const requestLogger = getRequestLogger(res);
    const transport = new SSEServerTransport("/messages", res);
    const keepAlive = setInterval(() => {
      try {
        res.write("event: ping\ndata: {}\n\n");
      } catch (error) {
        requestLogger.warn({ err: error }, "Failed to send keepalive ping");
      }
    }, 25_000);

    const session: SessionInfo = {
      id: transport.sessionId,
      transport,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
      keepAlive,
      logger: requestLogger
    };

    sessions.set(transport.sessionId, session);
    requestLogger.info({ sessionId: transport.sessionId }, "MCP SSE session established");

    res.on("close", () => {
      clearInterval(keepAlive);
      sessions.delete(transport.sessionId);
      requestLogger.info({ sessionId: transport.sessionId }, "MCP SSE session closed");
    });

    try {
      await server.connect(transport);
    } catch (error) {
      clearInterval(keepAlive);
      sessions.delete(transport.sessionId);
      requestLogger.error({ err: error }, "Failed to establish MCP SSE session");
      res.end();
    }
  });

  app.post("/messages", async (req, res) => {
    if (!authenticate(req, res)) {
      return;
    }

    const sessionId = (req.query.sessionId as string) ?? req.header("x-session-id");
    if (!sessionId) {
      const error = new AppError(400, ErrorCodes.INVALID_REQUEST, "sessionId query parameter is required");
      res.status(error.statusCode).json(error.toResponse());
      return;
    }

    const session = sessions.get(sessionId);
    if (!session) {
      const error = new AppError(404, ErrorCodes.SESSION_NOT_FOUND, "Session not found");
      res.status(error.statusCode).json(error.toResponse());
      return;
    }

    try {
      const message = normalizeIncomingMessage(req.body);
      session.lastSeenAt = Date.now();
      await session.transport.handleMessage(message, { requestInfo: { headers: req.headers } });
      res.status(202).end("Accepted");
    } catch (error) {
      const normalized = toErrorResponse(error);
      session.logger.error(
        { err: error, sessionId, code: normalized.code },
        "Failed to handle MCP message"
      );
      res.status(normalized.status).json(normalized);
    }
  });
};
