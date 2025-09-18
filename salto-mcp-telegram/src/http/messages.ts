import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError, ErrorCodes } from "../utils/errors.js";
import { env } from "../utils/env.js";

const JsonRpcMessageSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string().min(1),
  params: z.unknown().optional()
});

const LegacyMessageSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  tool: z.string().min(1),
  arguments: z.record(z.any()).optional()
});

const METHOD_ALIASES: Record<string, string> = {
  call_tool: "tools/call",
  list_tools: "tools/list"
};

export type JsonRpcMessage = z.infer<typeof JsonRpcMessageSchema>;

const normalizeMethod = (method: string): string => METHOD_ALIASES[method] ?? method;

const ensureArgumentsObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

export const normalizeIncomingMessage = (input: unknown): JsonRpcMessage => {
  let candidate: unknown = input;
  if (typeof input === "string") {
    try {
      candidate = JSON.parse(input);
    } catch (error) {
      throw new AppError(400, ErrorCodes.INVALID_JSON, "Body must be valid JSON", error);
    }
  }

  const parsed = JsonRpcMessageSchema.safeParse(candidate);
  if (parsed.success) {
    return { ...parsed.data, method: normalizeMethod(parsed.data.method) };
  }

  const legacyParsed = LegacyMessageSchema.safeParse(candidate);
  if (legacyParsed.success) {
    if (!env.allowLegacyBody) {
      throw new AppError(400, ErrorCodes.INVALID_REQUEST, "Legacy payloads are disabled");
    }

    return {
      jsonrpc: "2.0",
      id: legacyParsed.data.id ?? randomUUID(),
      method: "tools/call",
      params: {
        name: legacyParsed.data.tool,
        arguments: ensureArgumentsObject(legacyParsed.data.arguments)
      }
    };
  }

  throw new AppError(400, ErrorCodes.INVALID_JSON, "Invalid JSON-RPC payload");
};
