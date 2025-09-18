import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { getChatSchema, getUpdatesSchema, sendDocumentSchema, sendMessageSchema } from "./schemas.js";
import { telegramService } from "../services/telegram.js";
import { createRequestLogger, logger } from "../utils/logger.js";
import { toErrorResponse } from "../utils/errors.js";
import { env } from "../utils/env.js";

export const mcpServer = new McpServer({
  name: "salto-telegram-mcp",
  version: env.version
});

interface RegisteredToolInfo {
  name: string;
  title?: string;
  description?: string;
}

const registeredTools: RegisteredToolInfo[] = [];

const recordTool = (name: string, definition: { title?: string; description?: string }) => {
  registeredTools.push({ name, title: definition.title, description: definition.description });
};

export const getRegisteredTools = () => registeredTools.map((tool) => ({ ...tool }));

const toTextContent = (payload: unknown) => ({
  type: "text" as const,
  text: JSON.stringify(payload, null, 2)
});

const successResult = (payload: unknown): CallToolResult => ({
  content: [toTextContent(payload)]
});

const errorResult = (error: ReturnType<typeof toErrorResponse>): CallToolResult => ({
  isError: true,
  content: [toTextContent(error)]
});

const sendMessageDefinition = {
  title: "Send Telegram message",
  description: "Отправить текстовое сообщение пользователю/группе/каналу",
  inputSchema: sendMessageSchema.shape
};

recordTool("telegram.send_message", sendMessageDefinition);

mcpServer.registerTool(
  "telegram.send_message",
  sendMessageDefinition,
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
      const normalized = toErrorResponse(error);
      childLogger.error({ err: error, status: normalized.status, code: normalized.code }, "send_message failed");
      return errorResult(normalized);
    }
  }
);

const sendDocumentDefinition = {
  title: "Send Telegram document",
  description: "Отправить документ в Telegram чат",
  inputSchema: sendDocumentSchema.shape
};

recordTool("telegram.send_document", sendDocumentDefinition);

mcpServer.registerTool(
  "telegram.send_document",
  sendDocumentDefinition,
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
      const normalized = toErrorResponse(error);
      childLogger.error({ err: error, status: normalized.status, code: normalized.code }, "send_document failed");
      return errorResult(normalized);
    }
  }
);

const getUpdatesDefinition = {
  title: "Fetch Telegram updates",
  description: "Получить последние апдейты бота через getUpdates",
  inputSchema: getUpdatesSchema.shape
};

recordTool("telegram.get_updates", getUpdatesDefinition);

mcpServer.registerTool(
  "telegram.get_updates",
  getUpdatesDefinition,
  async (input) => {
    const parsed = getUpdatesSchema.parse(input ?? {});
    const requestId = randomUUID();
    const childLogger = createRequestLogger({ requestId, tool: "telegram.get_updates" });

    try {
      const updates = await telegramService.getUpdates(parsed, { requestId, logger: childLogger });
      return successResult({ ok: true, updates });
    } catch (error) {
      const normalized = toErrorResponse(error);
      childLogger.error({ err: error, status: normalized.status, code: normalized.code }, "get_updates failed");
      return errorResult(normalized);
    }
  }
);

const getChatDefinition = {
  title: "Resolve Telegram chat",
  description: "Получить информацию о чате для разрешения username → chat_id",
  inputSchema: getChatSchema.shape
};

recordTool("telegram.get_chat", getChatDefinition);

mcpServer.registerTool(
  "telegram.get_chat",
  getChatDefinition,
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
      const normalized = toErrorResponse(error);
      childLogger.error({ err: error, status: normalized.status, code: normalized.code }, "get_chat failed");
      return errorResult(normalized);
    }
  }
);

const systemHealthDefinition = {
  title: "Health check",
  description: "Проверка живости MCP сервера"
};

recordTool("system.health", systemHealthDefinition);

mcpServer.registerTool(
  "system.health",
  systemHealthDefinition,
  async () =>
    successResult({
      ok: true,
      uptimeSec: Math.round(process.uptime()),
      version: env.version
    })
);

const searchSchema = z.object({
  query: z.string().min(1)
});

const searchDefinition = {
  title: "Search",
  description: "Stub search tool for ChatGPT compatibility",
  inputSchema: searchSchema.shape
};

recordTool("search", searchDefinition);

mcpServer.registerTool("search", searchDefinition, async (input) => {
  const parsed = searchSchema.parse(input ?? {});

  return successResult({
    results: [
      {
        id: "stub-search-result",
        title: `Stub result for "${parsed.query}"`,
        url: "https://example.com"
      }
    ]
  });
});

const fetchSchema = z.object({
  id: z.string().min(1)
});

const fetchDefinition = {
  title: "Fetch",
  description: "Stub fetch tool for ChatGPT compatibility",
  inputSchema: fetchSchema.shape
};

recordTool("fetch", fetchDefinition);

mcpServer.registerTool("fetch", fetchDefinition, async (input) => {
  const parsed = fetchSchema.parse(input ?? {});

  return successResult({
    id: parsed.id,
    title: "Stub document",
    text: "This is placeholder text.",
    url: "https://example.com/doc",
    metadata: { source: "stub" }
  });
});

logger.info("MCP tools registered");

// TODO: Register future CRM and Google Sheets tools once available.
