import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from "axios";
import FormData from "form-data";
import sanitizeHtml from "sanitize-html";
import type { Logger } from "pino";
import { env } from "../utils/env.js";
import { AppError } from "../utils/errors.js";
import { RateLimiter } from "../utils/rateLimit.js";
import { logger as baseLogger } from "../utils/logger.js";
import { resolveFileInput } from "./files.js";

export interface TelegramServiceConfig {
  token: string;
  allowedChatIds: Set<string>;
  timeoutMs: number;
  maxRetries: number;
  rateLimitPerSecond: number;
  maxDocumentBytes: number;
}

export interface ServiceContext {
  requestId: string;
  logger?: Logger;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: {
    id: number;
    type: string;
    title?: string;
    username?: string;
  };
  text?: string;
  document?: {
    file_id: string;
    file_name?: string;
    mime_type?: string;
  };
}

export interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export interface SendMessagePayload {
  chat_id: string;
  text: string;
  parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
  disable_web_page_preview?: boolean;
  disable_notification?: boolean;
}

export interface SendDocumentPayload {
  chat_id: string;
  file: string;
  filename?: string;
  caption?: string;
}

export interface GetUpdatesPayload {
  offset?: number;
  timeout?: number;
  limit?: number;
}

const MARKDOWN_V2_SPECIAL_CHARS = [
  "_",
  "*",
  "[",
  "]",
  "(",
  ")",
  "~",
  "`",
  ">",
  "#",
  "+",
  "-",
  "=",
  "|",
  "{",
  "}",
  ".",
  "!"
];

const MARKDOWN_V2_ESCAPE_REGEX = new RegExp(
  `[${MARKDOWN_V2_SPECIAL_CHARS.map((char) => `\\${char}`).join("")}]`,
  "g"
);

const stripControlCharacters = (value: string) =>
  Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join("");

const escapeMarkdownV2 = (value: string) => value.replace(MARKDOWN_V2_ESCAPE_REGEX, "\\$&");

export class TelegramService {
  private readonly axios: AxiosInstance;
  private readonly logger: Logger;
  private readonly rateLimiter: RateLimiter;

  constructor(private readonly config: TelegramServiceConfig, logger: Logger = baseLogger) {
    this.logger = logger;
    this.axios = axios.create({
      baseURL: `https://api.telegram.org/bot${config.token}/`,
      timeout: config.timeoutMs,
      proxy: false
    });
    this.rateLimiter = new RateLimiter(config.rateLimitPerSecond, 1_000);
  }

  async sendMessage(payload: SendMessagePayload, context: ServiceContext): Promise<TelegramMessage> {
    const log = this.loggerFor(context).child({ tool: "telegram.send_message" });
    const chatId = await this.resolveChatId(payload.chat_id, context);
    this.ensureChatAccess(chatId);

    const parseMode = payload.parse_mode ?? "HTML";
    const sanitizedText = this.sanitizeText(payload.text, parseMode);

    const requestPayload = {
      chat_id: chatId,
      text: sanitizedText,
      parse_mode: parseMode,
      disable_web_page_preview: payload.disable_web_page_preview ?? true,
      disable_notification: payload.disable_notification ?? false
    };

    log.debug({ chatId }, "Sending message via Telegram API");

    const response = await this.makeRequest<TelegramMessage>(
      {
        method: "POST",
        url: "sendMessage",
        data: requestPayload
      },
      context,
      log
    );

    log.info({ chatId, messageId: response.message_id }, "Message delivered to Telegram");
    return response;
  }

  async sendDocument(payload: SendDocumentPayload, context: ServiceContext): Promise<TelegramMessage> {
    const log = this.loggerFor(context).child({ tool: "telegram.send_document" });
    const chatId = await this.resolveChatId(payload.chat_id, context);
    this.ensureChatAccess(chatId);

    const resolvedFile = await resolveFileInput(
      payload.file,
      payload.filename || "document.pdf",
      this.config.maxDocumentBytes
    );

    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("document", resolvedFile.buffer, {
      filename: resolvedFile.filename,
      contentType: resolvedFile.contentType
    });

    if (payload.caption) {
      form.append("caption", stripControlCharacters(payload.caption));
    }

    log.debug({ chatId, filename: resolvedFile.filename }, "Uploading document to Telegram");

    const response = await this.makeRequest<TelegramMessage>(
      {
        method: "POST",
        url: "sendDocument",
        data: form,
        headers: form.getHeaders()
      },
      context,
      log
    );

    log.info({ chatId, messageId: response.message_id }, "Document sent via Telegram");
    return response;
  }

  async getUpdates(payload: GetUpdatesPayload, context: ServiceContext): Promise<unknown[]> {
    const log = this.loggerFor(context).child({ tool: "telegram.get_updates" });

    const response = await this.makeRequest<unknown[]>(
      {
        method: "POST",
        url: "getUpdates",
        data: {
          offset: payload.offset,
          timeout: payload.timeout ?? 0,
          limit: payload.limit ?? 50
        }
      },
      context,
      log
    );

    log.debug({ updateCount: Array.isArray(response) ? response.length : 0 }, "Fetched updates");

    if (!Array.isArray(response)) {
      return [];
    }

    return response.map((update) => {
      if (typeof update !== "object" || update === null) {
        return update;
      }

      const allowedKeys = ["update_id", "message", "edited_message", "channel_post", "edited_channel_post"] as const;
      const filtered: Record<string, unknown> = {};
      for (const key of allowedKeys) {
        if (key in update) {
          filtered[key] = (update as Record<string, unknown>)[key];
        }
      }

      return filtered;
    });
  }

  async getChat(chatIdOrUsername: string, context: ServiceContext): Promise<TelegramChat> {
    const log = this.loggerFor(context).child({ tool: "telegram.get_chat" });
    const response = await this.makeRequest<TelegramChat>(
      {
        method: "POST",
        url: "getChat",
        data: { chat_id: chatIdOrUsername }
      },
      context,
      log
    );

    this.ensureChatAccess(response.id);
    log.debug({ chatId: response.id }, "Resolved chat information");
    return response;
  }

  private sanitizeText(text: string, mode: "HTML" | "Markdown" | "MarkdownV2"): string {
    const clean = stripControlCharacters(text);
    if (mode === "HTML") {
      return sanitizeHtml(clean, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(["span", "br"]),
        allowedAttributes: {
          a: ["href", "title"],
          span: ["class"],
          code: ["class"],
          pre: ["class"]
        }
      });
    }

    if (mode === "MarkdownV2") {
      return escapeMarkdownV2(clean);
    }

    return clean;
  }

  private async resolveChatId(chatId: string, context: ServiceContext): Promise<string | number> {
    if (chatId.startsWith("@")) {
      const chat = await this.getChat(chatId, context);
      return chat.id;
    }

    return chatId;
  }

  private ensureChatAccess(chatId: string | number) {
    if (this.config.allowedChatIds.size === 0) {
      return;
    }

    const normalized = String(chatId);
    if (!this.config.allowedChatIds.has(normalized)) {
      throw new AppError(403, `Chat ${normalized} is not allowed`);
    }
  }

  private async makeRequest<T>(
    config: AxiosRequestConfig,
    context: ServiceContext,
    log: Logger,
    attempt = 0
  ): Promise<T> {
    await this.rateLimiter.acquire();
    try {
      const response = await this.axios.request<TelegramResponse<T>>(config);
      if (!response.data?.ok || !response.data.result) {
        throw new AppError(
          502,
          response.data?.description || "Unexpected response from Telegram"
        );
      }

      return response.data.result;
    } catch (error) {
      const axiosError = error as AxiosError<TelegramResponse<T>>;
      const status = axiosError.response?.status ?? 500;

      if (this.shouldRetry(axiosError) && attempt < this.config.maxRetries) {
        const delayMs = 2 ** attempt * 300;
        log.warn({ attempt, delayMs }, "Retrying Telegram request after transient error");
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return this.makeRequest<T>(config, context, log, attempt + 1);
      }

      const description = axiosError.response?.data?.description || axiosError.message;
      const errorCode = axiosError.response?.data?.error_code;

      log.error({ status, errorCode, description }, "Telegram API request failed");
      throw new AppError(status, description ?? "Telegram API request failed");
    }
  }

  private shouldRetry(error: AxiosError): boolean {
    if (error.code === "ECONNABORTED") {
      return true;
    }

    const status = error.response?.status;
    if (!status) {
      return true;
    }

    return status >= 500;
  }

  private loggerFor(context: ServiceContext): Logger {
    if (context.logger) {
      return context.logger;
    }

    return this.logger.child({ requestId: context.requestId });
  }
}

export const telegramService = new TelegramService({
  token: env.telegramBotToken,
  allowedChatIds: env.allowedChatIds,
  timeoutMs: env.telegram.timeoutMs,
  maxRetries: env.telegram.maxRetries,
  rateLimitPerSecond: env.telegram.rateLimitPerSecond,
  maxDocumentBytes: env.telegram.maxDocumentBytes
});

// TODO: Add CRM and Google Sheets integrations alongside Telegram utilities.
