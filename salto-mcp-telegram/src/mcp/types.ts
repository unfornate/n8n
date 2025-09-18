import type { z } from "zod";
import {
  getChatSchema,
  getUpdatesSchema,
  healthSchema,
  sendDocumentSchema,
  sendMessageSchema
} from "./schemas.js";

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type SendDocumentInput = z.infer<typeof sendDocumentSchema>;
export type GetUpdatesInput = z.infer<typeof getUpdatesSchema>;
export type GetChatInput = z.infer<typeof getChatSchema>;
export type HealthInput = z.infer<typeof healthSchema>;
