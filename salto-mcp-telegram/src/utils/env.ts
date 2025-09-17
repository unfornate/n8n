import { config as loadEnv } from "dotenv";
import { createRequire } from "node:module";
import { z } from "zod";

loadEnv();

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version: string };

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  TELEGRAM_BOT_TOKEN: z
    .string()
    .min(1, "TELEGRAM_BOT_TOKEN is required"),
  ALLOWED_CHAT_IDS: z.string().optional(),
  AUTH_BEARER: z.string().optional(),
  LOG_LEVEL: z.string().optional()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Environment validation error", parsed.error.flatten());
  process.exit(1);
}

const data = parsed.data;

const allowedChatIds = (data.ALLOWED_CHAT_IDS || "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

export interface EnvConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  telegramBotToken: string;
  allowedChatIds: Set<string>;
  authBearer?: string;
  logLevel: string;
  version: string;
  telegram: {
    timeoutMs: number;
    maxRetries: number;
    rateLimitPerSecond: number;
    maxDocumentBytes: number;
  };
}

export const env: EnvConfig = {
  nodeEnv: data.NODE_ENV,
  port: data.PORT,
  telegramBotToken: data.TELEGRAM_BOT_TOKEN,
  allowedChatIds: new Set(allowedChatIds),
  authBearer: data.AUTH_BEARER,
  logLevel: data.LOG_LEVEL || (data.NODE_ENV === "development" ? "debug" : "info"),
  version: pkg.version,
  telegram: {
    timeoutMs: 15_000,
    maxRetries: 2,
    rateLimitPerSecond: 25,
    maxDocumentBytes: 15 * 1024 * 1024
  }
};
