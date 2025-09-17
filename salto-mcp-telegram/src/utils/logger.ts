import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  level: env.logLevel,
  base: {
    service: "salto-mcp-telegram",
    version: env.version
  },
  transport:
    env.nodeEnv === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard"
          }
        }
      : undefined
});

export const createRequestLogger = (context: {
  requestId: string;
  tool?: string;
}) => logger.child(context);
