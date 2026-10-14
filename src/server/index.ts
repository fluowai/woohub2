import "next/dist/server/node-environment";
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
import { PrismaClient } from "@prisma/client";
import { issueInstallationKey, hashInstallationKey } from "../lib/installation";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3030", 10);

if (!process.env.AUTH_SECRET) {
  logger.error("Server", "AUTH_SECRET is not set. Generate one with: openssl rand -base64 32");
  process.exit(1);
}

// A stray rejection from a background send (quota denial, engine error) must not take
// the whole gateway down: every instance is dropped with it. Log and keep serving.
process.on("unhandledRejection", (reason) => {
  logger.error("Server", "Unhandled promise rejection:", reason);
});

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
  // Optional: Global instance for WhatsApp Engine to emit events
  (global as any).io = io;

  // Initialize WhatsApp Manager
  waManager.setup(io);
  waManager.loadSessions();

  // Background subsystem stops, invoked on SIGINT/SIGTERM (see shutdown()).
  const backgroundStops: Array<() => void> = [];
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let licenseHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let schedulerStop: (() => void) | null = null;

  // Start Scheduler
  import("../modules/whatsapp/scheduler")
    .then((m) => {
      schedulerStop = m.startScheduler();
      backgroundStops.push(() => schedulerStop?.());
    })
    .catch((err) => logger.error("Server", "Scheduler failed to start:", err));

  // Start quota usage flusher (public API request counters, flushed every minute)
  import("../lib/quota")
    .then((m) => {
      backgroundStops.push(m.startUsageFlusher());
    })
    .catch(err => logger.error("Server", "Usage flusher failed to start:", err));

  // Start durable outbound queue worker (MessageJob: scheduled messages, broadcasts)
  import("../lib/queue")
    .then((m) => {
      backgroundStops.push(m.startJobWorker());
    })
    .catch(err => logger.error("Server", "Queue worker failed to start:", err));

  // Start license installation heartbeat (client-side)
  try {
    licenseHeartbeatTimer = startLicenseHeartbeat();
    if (licenseHeartbeatTimer) {
      backgroundStops.push(() => { if (licenseHeartbeatTimer) clearInterval(licenseHeartbeatTimer); });
    }
  } catch (err) {
    logger.error("Server", "License heartbeat failed to start:", err);
  }

  // Cloudflare 520 Fix: increase keep-alive timeout so Node doesn't kill idle connections that Cloudflare expects to reuse
  // See: https://github.com/vercel/next.js/issues/48962
  server.keepAliveTimeout = 120 * 1000; // 120 seconds
  server.headersTimeout = 120 * 1000; // 120 seconds

  server.listen(port, () => {
    logger.banner(pkg.name.toUpperCase(), pkg.version, port);
    heartbeatTimer = startHeartbeat(hostname, port);
  });

  /**
   * Graceful shutdown: stop schedulers/workers, disconnect WhatsApp sessions,
   * close Socket.IO + HTTP, then disconnect Prisma. A hard-exit timer guarantees
   * the process never hangs forever (PM2/Docker would SIGKILL it anyway).
   */
  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Server", `${signal} received — starting graceful shutdown`);

    const forceExit = setTimeout(() => {
      logger.error("Server", "Graceful shutdown timed out after 15s — forcing exit");
      process.exit(1);
    }, 15_000);
    forceExit.unref();

    // 1. Stop background timers (scheduler, queue worker, usage flusher).
    for (const stop of backgroundStops) {
      try {
        stop();
      } catch (err) {
        logger.error("Server", "Failed to stop background worker:", err);
      }
    }
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (licenseHeartbeatTimer) clearInterval(licenseHeartbeatTimer);

    // 2. Close WhatsApp sessions without triggering reconnect or DB rewrites.
    try {
      await waManager.shutdownAll();
    } catch (err) {
      logger.error("Server", "Failed to shut down WhatsApp sessions:", err);
    }

    // 3. Close Socket.IO (also detaches the underlying HTTP server handlers).
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 5_000);
      t.unref();
      io.close(() => {
        clearTimeout(t);
        resolve();
      });
    });

    // 4. Stop accepting new HTTP connections; let in-flight requests finish.
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        server.closeIdleConnections?.();
        resolve();
      }, 5_000);
      t.unref();
      server.close(() => {
        clearTimeout(t);
        resolve();
      });
      server.closeIdleConnections?.();
    });

    // 5. Release the database connection.
    try {
      const { prisma } = await import("../lib/prisma");
      await prisma.$disconnect();
    } catch (err) {
      logger.error("Server", "Failed to disconnect Prisma:", err);
    }

    clearTimeout(forceExit);
    logger.info("Server", "Graceful shutdown complete");
    process.exit(0);
  }

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
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
  * Credits: heartbeat mechanism inherited from Woohub core.
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

function startHeartbeat(hostname: string, port: number): ReturnType<typeof setInterval> {
  const MONITOR_URL = process.env.TELEMETRY_URL || "";
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
  return setInterval(sendHeartbeat, 30000);
}

/**
 * License installation heartbeat (client-side).
 *
 * Registers this deployment with the license server (local /api/license/heartbeat)
 * and sends periodic heartbeats with instance/connection stats. This enables
 * the central license server to track active installations and enforce limits.
 *
 * Requires INSTALLATION_KEY env var (set after first boot) or generates one on
 * first run and logs it for the operator to configure.
 */
async function getOrCreateInstallation(): Promise<{ id: string; key: string } | null> {
  const prisma = new PrismaClient();
  try {
    const envKey = process.env.INSTALLATION_KEY?.trim();
    if (envKey) {
      const envKeyHash = hashInstallationKey(envKey);
      const matched = await prisma.installation.findFirst({
        where: { installationKeyHash: envKeyHash },
        include: { license: true },
      });
      if (matched) {
        return { id: matched.id, key: envKey };
      }
    }

    const installation = await prisma.installation.findFirst({
      where: {
        license: { status: "ACTIVE" },
        installationKeyHash: { not: null }
      },
      include: { license: true },
      orderBy: { createdAt: "desc" },
    });

    if (installation && envKey) {
      return { id: installation.id, key: envKey };
    }

    return null;
  } catch (e) {
    logger.error("LicenseHeartbeat", `Failed to resolve installation: ${(e as Error).message}`);
    return null;
  } finally {
    await prisma.$disconnect();
  }
}

function startLicenseHeartbeat(): ReturnType<typeof setInterval> | null {
  let installation: { id: string; key: string } | null = null;
  let initialized = false;

  const sendHeartbeat = async () => {
    if (!initialized) {
      initialized = true;
      installation = await getOrCreateInstallation();
      if (!installation) {
        logger.info("LicenseHeartbeat", "Heartbeat disabled (no installation/key)");
        return;
      }
      logger.info("LicenseHeartbeat", `Heartbeat enabled for installation ${installation.id}`);
    }

    if (!installation) return;

    try {
      const { waManager } = await import("../modules/whatsapp/manager");
      const sessions = waManager.getAllSessions();
      const instances = sessions.length;
      const connected = sessions.filter((s) => s.status?.toUpperCase() === "CONNECTED").length;

      const res = await fetch(`${process.env.BASE_URL || "http://localhost:3000"}/api/license/heartbeat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-woohub-installation-key": installation.key,
          "x-woohub-installation-id": installation.id,
        },
        body: JSON.stringify({
          protocolVersion: 1,
          licenseRevision: 1,
          version: pkg.version,
          instances,
          connected,
          state: connected > 0 ? "connected" : "disconnected",
        }),
      });

      if (!res.ok) {
        const err = await res.text().catch(() => "");
        logger.warn("LicenseHeartbeat", `Heartbeat failed: ${res.status} ${err}`);
      } else {
        logger.info("LicenseHeartbeat", `Heartbeat OK (instances: ${instances}, connected: ${connected})`);
      }
    } catch (e) {
      logger.warn("LicenseHeartbeat", `Heartbeat error: ${(e as Error).message}`);
    }
  };

  // Initial heartbeat after 10s, then every 5 minutes
  setTimeout(sendHeartbeat, 10000);
  return setInterval(sendHeartbeat, 5 * 60 * 1000);
}
