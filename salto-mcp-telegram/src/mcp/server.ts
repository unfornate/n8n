import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getChatSchema, getUpdatesSchema, sendDocumentSchema, sendMessageSchema } from "./schemas.js";
import { telegramService } from "../services/telegram.js";
import { createRequestLogger, logger } from "../utils/logger.js";
import { normalizeError } from "../utils/errors.js";
import { env } from "../utils/env.js";

export const mcpServer = new McpServer({
  name: "salto-telegram-mcp",
  version: env.version
});

const toTextContent = (payload: unknown) => ({
  type: "text" as const,
  text: JSON.stringify(payload, null, 2)
});

const successResult = (payload: unknown): CallToolResult => ({
  content: [toTextContent(payload)]
});

const errorResult = (status: number, message: string): CallToolResult => ({
  isError: true,
  content: [toTextContent({ ok: false, status, message })]
});

mcpServer.registerTool(
  "telegram.send_message",
  {
    title: "Send Telegram message",
    description: "Отправить текстовое сообщение пользователю/группе/каналу",
    inputSchema: sendMessageSchema.shape
  },
  async (input) => {
    const parsed = sendMessageSchema.parse(input ?? {});
    const requestId = randomUUID();
    const childLogger = createRequestLogger({ requestId, tool: "telegram.send_message" });

    try {
      const response = await telegramService.sendMessage(parsed, { requestId, logger: childLogger });
      return successResult({
        ok: true,
        message_id: response.message_id,
        date: response.date,
        chat: response.chat
      });
    } catch (error) {
      const normalized = normalizeError(error);
      childLogger.error({ err: error, status: normalized.statusCode }, "send_message failed");
      return errorResult(normalized.statusCode, normalized.message);
    }
  }
);

mcpServer.registerTool(
  "telegram.send_document",
  {
    title: "Send Telegram document",
    description: "Отправить документ в Telegram чат",
    inputSchema: sendDocumentSchema.shape
  },
  async (input) => {
    const parsed = sendDocumentSchema.parse(input ?? {});
    const requestId = randomUUID();
    const childLogger = createRequestLogger({ requestId, tool: "telegram.send_document" });

    try {
      const response = await telegramService.sendDocument(parsed, { requestId, logger: childLogger });
      return successResult({
        ok: true,
        message_id: response.message_id,
        document: response.document
      });
    } catch (error) {
      const normalized = normalizeError(error);
      childLogger.error({ err: error, status: normalized.statusCode }, "send_document failed");
      return errorResult(normalized.statusCode, normalized.message);
    }
  }
);

mcpServer.registerTool(
  "telegram.get_updates",
  {
    title: "Fetch Telegram updates",
    description: "Получить последние апдейты бота через getUpdates",
    inputSchema: getUpdatesSchema.shape
  },
  async (input) => {
    const parsed = getUpdatesSchema.parse(input ?? {});
    const requestId = randomUUID();
    const childLogger = createRequestLogger({ requestId, tool: "telegram.get_updates" });

    try {
      const updates = await telegramService.getUpdates(parsed, { requestId, logger: childLogger });
      return successResult({ ok: true, updates });
    } catch (error) {
      const normalized = normalizeError(error);
      childLogger.error({ err: error, status: normalized.statusCode }, "get_updates failed");
      return errorResult(normalized.statusCode, normalized.message);
    }
  }
);

mcpServer.registerTool(
  "telegram.get_chat",
  {
    title: "Resolve Telegram chat",
    description: "Получить информацию о чате для разрешения username → chat_id",
    inputSchema: getChatSchema.shape
  },
  async (input) => {
    const parsed = getChatSchema.parse(input ?? {});
    const requestId = randomUUID();
    const childLogger = createRequestLogger({ requestId, tool: "telegram.get_chat" });

    try {
      const chat = await telegramService.getChat(parsed.chat_id_or_username, {
        requestId,
        logger: childLogger
      });
      return successResult({ ok: true, chat });
    } catch (error) {
      const normalized = normalizeError(error);
      childLogger.error({ err: error, status: normalized.statusCode }, "get_chat failed");
      return errorResult(normalized.statusCode, normalized.message);
    }
  }
);

mcpServer.registerTool(
  "system.health",
  {
    title: "Health check",
    description: "Проверка живости MCP сервера",
  },
  async () =>
    successResult({
      ok: true,
      uptimeSec: Math.round(process.uptime()),
      version: env.version
    })
);

logger.info("MCP tools registered");

// TODO: Register future CRM and Google Sheets tools once available.
