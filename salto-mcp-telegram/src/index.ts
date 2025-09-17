import express from "express";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "./utils/env.js";
import { logger } from "./utils/logger.js";
import { registerHealthEndpoint } from "./http/health.js";
import { registerSseTransport } from "./http/sse.js";
import { mcpServer } from "./mcp/server.js";
import { normalizeError } from "./utils/errors.js";

const app = express();
const startedAt = Date.now();

app.use(express.json({ limit: "2mb" }));

app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = randomUUID();
  (req as Request & { requestId?: string }).requestId = requestId;
  res.locals.requestId = requestId;
  const child = logger.child({ requestId, method: req.method, path: req.path });
  res.locals.logger = child;
  child.debug("Incoming request");
  res.on("finish", () => {
    child.debug({ statusCode: res.statusCode }, "Request completed");
  });
  next();
});

registerHealthEndpoint(app, startedAt);
registerSseTransport(app, mcpServer);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  void _next;
  const normalized = normalizeError(err);
  logger.error({ err, status: normalized.statusCode }, "Unhandled error");
  res.status(normalized.statusCode).json({
    ok: false,
    message: normalized.message
  });
});

const server = app.listen(env.port, () => {
  logger.info({ port: env.port }, "Salto Telegram MCP server started");
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down");
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  logger.info("Received SIGINT, shutting down");
  server.close(() => process.exit(0));
});

export { app };
