import { describe, expect, it } from "vitest";

import { normalizeIncomingMessage } from "../src/http/messages.js";
import { AppError, ErrorCodes } from "../src/utils/errors.js";
import { env } from "../src/utils/env.js";

describe("normalizeIncomingMessage", () => {
  it("passes through modern JSON-RPC calls", () => {
    const message = normalizeIncomingMessage({
      jsonrpc: "2.0",
      id: "1",
      method: "tools/call",
      params: { name: "system.health", arguments: {} }
    });

    expect(message.method).toBe("tools/call");
    expect(message.params).toMatchObject({ name: "system.health" });
  });

  it("maps call_tool alias to tools/call", () => {
    const message = normalizeIncomingMessage({
      jsonrpc: "2.0",
      id: "2",
      method: "call_tool",
      params: { name: "system.health", arguments: {} }
    });

    expect(message.method).toBe("tools/call");
  });

  it("maps list_tools alias to tools/list", () => {
    const message = normalizeIncomingMessage({
      jsonrpc: "2.0",
      id: "3",
      method: "list_tools"
    });

    expect(message.method).toBe("tools/list");
  });

  it("wraps legacy bodies when allowed", () => {
    const legacy = normalizeIncomingMessage({ tool: "system.health", arguments: {} });
    expect(legacy.method).toBe("tools/call");
    expect(legacy.params).toMatchObject({ name: "system.health", arguments: {} });
    expect(legacy.jsonrpc).toBe("2.0");
    expect(legacy.id).toBeDefined();
  });

  it("rejects legacy bodies when disabled", () => {
    const original = env.allowLegacyBody;
    env.allowLegacyBody = false;

    try {
      normalizeIncomingMessage({ tool: "system.health" });
      throw new Error("Expected legacy body to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCodes.INVALID_REQUEST);
    } finally {
      env.allowLegacyBody = original;
    }
  });

  it("throws on invalid JSON", () => {
    expect(() => normalizeIncomingMessage("not-json")).toThrowError(AppError);
  });
});
