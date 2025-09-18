import type { Express } from "express";
import { env } from "../utils/env.js";

export const registerHealthEndpoint = (app: Express, startedAt: number) => {
  app.get("/healthz", (_req, res) => {
    res.json({
      ok: true,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      version: env.version
    });
  });
};
