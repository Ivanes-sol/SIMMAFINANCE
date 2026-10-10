import type { Express, Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";

function getAllowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function applyHardening(app: Express) {
  // If deployed behind a reverse proxy (Cloudflare, nginx), this prevents rate-limit issues
  // and ensures correct IP detection.
    // Only trust a reverse proxy when explicitly enabled.
  // For local-only operation, keep this disabled.
  const trustProxy = process.env.TRUST_PROXY === "true";
  if (trustProxy) {
    app.set("trust proxy", 1);
  }
  // Basic security headers (safe for an API).
  app.use(
    helmet({
      contentSecurityPolicy: false, // API responses only
      crossOriginEmbedderPolicy: false,
    })
  );

  // Gzip responses (JSON compresses well)
  app.use(compression());

  // Lightweight CORS allowlist (avoid extra dependency)
  const allow = new Set(getAllowedOrigins());
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && allow.has(origin)) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("vary", "origin");
      res.setHeader("access-control-allow-credentials", "true");
      res.setHeader("access-control-allow-headers", "content-type");
      res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    }
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  });

  // Rate limiting (protect from spam / brute force)
  // Defaults are intentionally conservative for local use.
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? "60000"); // 1 min
  const max = Number(process.env.RATE_LIMIT_MAX ?? "120"); // 120 req/min per IP
  app.use(
    rateLimit({
      windowMs,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "rate_limited" },
    })
  );

  // Add request id + simple structured logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    const rid = crypto.randomBytes(8).toString("hex");
    (req as any).rid = rid;
    res.setHeader("x-request-id", rid);

    const start = Date.now();
    res.on("finish", () => {
      const ms = Date.now() - start;
      const line = JSON.stringify({
        ts: new Date().toISOString(),
        rid,
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        ms,
      });
      // keep logs simple + grep-friendly
      console.log(line);
    });

    next();
  });
}

// 404 handler (must be registered AFTER routes)
export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: "not_found" });
}

// error handler (must be registered AFTER routes)
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const msg = err?.message ? String(err.message) : String(err);
  console.error("UNHANDLED_ERROR", msg);
  res.status(500).json({ error: "internal_error" });
}
