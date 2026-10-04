import { loadEnvConfig } from "@next/env";
// Load environment variables before any other imports/logic
loadEnvConfig(process.cwd());

import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import { setupSocket } from "./socket";
import { waManager } from "../modules/whatsapp/manager";
import { logger } from "../lib/logger";
import pkg from "../../package.json";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3030", 10);

if (!process.env.AUTH_SECRET) {
  logger.error("Server", "AUTH_SECRET is not set. Generate one with: openssl rand -base64 32");
  process.exit(1);
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      if (!req.url) return;
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      logger.error("Server", "Error handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  const allowedOrigins = resolveAllowedOrigins(hostname, port);

  const io = new Server(server, {
    path: "/api/socket/io",
    addTrailingSlash: false,
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"]
    }
  });

  setupSocket(io);
  // Optional: Global instance for Baileys to emit events
  (global as any).io = io;

  // Initialize WhatsApp Manager
  waManager.setup(io);
  waManager.loadSessions();

  // Start Scheduler
  import("../modules/whatsapp/scheduler").then(m => m.startScheduler());

  // Cloudflare 520 Fix: increase keep-alive timeout so Node doesn't kill idle connections that Cloudflare expects to reuse
  // See: https://github.com/vercel/next.js/issues/48962
  server.keepAliveTimeout = 120 * 1000; // 120 seconds
  server.headersTimeout = 120 * 1000; // 120 seconds

  server.listen(port, () => {
    logger.banner(pkg.name.toUpperCase(), pkg.version, port);
    startHeartbeat(hostname, port);
  });
});

/**
 * Socket.IO origin allow-list.
 * Configure with SOCKET_ALLOWED_ORIGINS (comma separated). Defaults to BASE_URL plus
 * local development origins. "*" is intentionally never used.
 */
function resolveAllowedOrigins(
  hostname: string,
  port: number
): (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void {
  const configured = process.env.SOCKET_ALLOWED_ORIGINS;
  const origins = (configured ? configured.split(",") : [])
    .map((o) => o.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    origins.push(
      process.env.BASE_URL || `http://${hostname}:${port}`,
      `http://localhost:${port}`,
      `http://127.0.0.1:${port}`
    );
  }

  const allowList = new Set(origins.map((o) => o.replace(/\/$/, "")));

  return (origin, cb) => {
    // Non-browser clients (no Origin header) are allowed; authentication still applies.
    if (!origin) return cb(null, true);
    cb(null, allowList.has(origin.replace(/\/$/, "")));
  };
}

/**
 * Optional external heartbeat (telemetry).
 *
 * Disabled by default. Enable with TELEMETRY_ENABLED=true (or the "telemetryEnabled"
 * flag in SystemConfig) and optionally override TELEMETRY_URL.
 *
 * Data sent (and nothing else): product name, product version, deployment URL,
 * platform, Node version and RSS memory in MB. No customer data, tenant data,
 * credentials, QR codes or message content is ever transmitted.
 *
 * Credits: heartbeat mechanism inherited from WA-AKG by mrifqidaffaaditya (MIT).
 */
async function isHeartbeatEnabled(): Promise<boolean> {
  if (process.env.TELEMETRY_ENABLED) {
    return process.env.TELEMETRY_ENABLED === "true";
  }
  try {
    const { prisma } = await import("../lib/prisma");
    const config = await prisma.systemConfig.findUnique({ where: { id: "default" } });
    return config?.telemetryEnabled === true;
  } catch {
    return false;
  }
}

function startHeartbeat(hostname: string, port: number): void {
  const MONITOR_URL = process.env.TELEMETRY_URL || "https://api-wa-akg.aikeigroup.net/api/ping";
  const APP_URL = process.env.BASE_URL || `http://${hostname}:${port}`;
  const APP_NAME = process.env.APP_NAME || pkg.name;
  const VERSION = pkg.version;

  let enabled: boolean | null = null;

  const sendHeartbeat = async () => {
    if (enabled === null) {
      enabled = await isHeartbeatEnabled();
      if (!enabled) {
        logger.info("Telemetry", "External heartbeat disabled (default).");
        return;
      }
      logger.info("Telemetry", `External heartbeat enabled -> ${MONITOR_URL}`);
    }
    if (!enabled) return;

    try {
      await fetch(MONITOR_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appUrl: APP_URL,
          appName: APP_NAME,
          appVersion: VERSION,
          isBackend: true,
          systemInfo: {
            platform: process.platform,
            nodeVersion: process.version,
            memoryUsage: Math.round(process.memoryUsage().rss / 1024 / 1024) + "MB"
          }
        }),
      });
    } catch {
      // Telemetry must never disturb the application.
    }
  };

  sendHeartbeat();
  setInterval(sendHeartbeat, 30000);
}
