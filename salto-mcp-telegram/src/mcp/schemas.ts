import { z } from "zod";

export const sendMessageSchema = z.object({
  chat_id: z.string(),
  text: z.string().min(1),
  parse_mode: z.enum(["Markdown", "MarkdownV2", "HTML"]).default("HTML"),
  disable_web_page_preview: z.boolean().default(true),
  disable_notification: z.boolean().default(false)
});

export const sendDocumentSchema = z.object({
  chat_id: z.string(),
  file: z.string(),
  filename: z.string().default("document.pdf"),
  caption: z.string().optional()
});

export const getUpdatesSchema = z.object({
  offset: z.number().int().optional(),
  timeout: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(50)
});

export const getChatSchema = z.object({
  chat_id_or_username: z.string().min(1)
});

export const healthSchema = z.object({});
