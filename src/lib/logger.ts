/**
 * Woohub Logger
 *
 * Development: colored ANSI console output (human-readable).
 * Production (NODE_ENV=production): single-line JSON logs (machine-parseable,
 * works with Docker/JSON log drivers, Loki, CloudWatch, etc.).
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("Server", "Ready on port 3030");
 *   logger.success("Session", "Connected successfully");
 *   logger.warn("Scheduler", "No messages to send");
 *   logger.error("API", "Request failed", error);
 *   logger.debug("Store", "Processing message", { id: "123" });
 */

const IS_PROD = process.env.NODE_ENV === "production";

// ANSI color codes (dev only)
const c = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    italic: "\x1b[3m",
    underline: "\x1b[4m",

    // Foreground
    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",

    // Bright foreground
    gray: "\x1b[90m",
    brightRed: "\x1b[91m",
    brightGreen: "\x1b[92m",
    brightYellow: "\x1b[93m",
    brightBlue: "\x1b[94m",
    brightMagenta: "\x1b[95m",
    brightCyan: "\x1b[96m",
    brightWhite: "\x1b[97m",

    // Background
    bgBlue: "\x1b[44m",
    bgGreen: "\x1b[42m",
    bgYellow: "\x1b[43m",
    bgRed: "\x1b[41m",
    bgMagenta: "\x1b[45m",
    bgCyan: "\x1b[46m",
    bgWhite: "\x1b[47m",
};

function timestamp(): string {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    return `${c.gray}${h}:${m}:${s}${c.reset}`;
}

function formatTag(tag: string): string {
    return `${c.bold}${c.cyan}[${tag}]${c.reset}`;
}

function formatArgs(args: any[]): string {
    return args
        .map((a) => {
            if (a instanceof Error) return `${a.message}`;
            if (typeof a === "object") {
                try { return JSON.stringify(a, null, 2); } catch { return String(a); }
            }
            return String(a);
        })
        .join(" ");
}

/** Serializes args into a single JSON-safe field for production logs. */
function serializeArgs(args: any[]): string | undefined {
    if (args.length === 0) return undefined;
    return args
        .map((a) => {
            if (a instanceof Error) return a.stack || a.message;
            if (typeof a === "object") {
                try { return JSON.stringify(a); } catch { return String(a); }
            }
            return String(a);
        })
        .join(" ");
}

function emitJson(level: "info" | "warn" | "error" | "debug", tag: string, args: any[]) {
    const record: Record<string, unknown> = {
        time: new Date().toISOString(),
        level,
        tag,
    };
    const msg = serializeArgs(args);
    if (msg !== undefined) record.msg = msg;
    const line = JSON.stringify(record);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
}

export const logger = {
    info(tag: string, ...args: any[]) {
        if (IS_PROD) return emitJson("info", tag, args);
        console.log(`${timestamp()} ${c.bgBlue}${c.white}${c.bold} INFO ${c.reset} ${formatTag(tag)} ${formatArgs(args)}`);
    },

    success(tag: string, ...args: any[]) {
        if (IS_PROD) return emitJson("info", tag, args);
        console.log(`${timestamp()} ${c.bgGreen}${c.black}${c.bold}  OK  ${c.reset} ${formatTag(tag)} ${c.green}${formatArgs(args)}${c.reset}`);
    },

    warn(tag: string, ...args: any[]) {
        if (IS_PROD) return emitJson("warn", tag, args);
        console.warn(`${timestamp()} ${c.bgYellow}${c.black}${c.bold} WARN ${c.reset} ${formatTag(tag)} ${c.yellow}${formatArgs(args)}${c.reset}`);
    },

    error(tag: string, ...args: any[]) {
        if (IS_PROD) return emitJson("error", tag, args);
        console.error(`${timestamp()} ${c.bgRed}${c.white}${c.bold} ERR! ${c.reset} ${formatTag(tag)} ${c.red}${formatArgs(args)}${c.reset}`);
    },

    debug(tag: string, ...args: any[]) {
        if (process.env.NODE_ENV === "production") return;
        console.log(`${timestamp()} ${c.bgMagenta}${c.white}${c.bold} DBG  ${c.reset} ${formatTag(tag)} ${c.dim}${formatArgs(args)}${c.reset}`);
    },

    /** Print a fancy startup banner */
    banner(name: string, version: string, port: number | string) {
        if (IS_PROD) {
            emitJson("info", "Server", [`Booting ${name} v${version} on port ${port} (${process.env.NODE_ENV})`]);
            return;
        }
        const line = "─".repeat(42);
        console.log("");
        console.log(`  ${c.cyan}${line}${c.reset}`);
        console.log(`  ${c.cyan}│${c.reset}                                          ${c.cyan}│${c.reset}`);
        console.log(`  ${c.cyan}│${c.reset}   ${c.bold}${c.brightCyan}⚡ ${name}${c.reset}  ${c.dim}v${version}${c.reset}${" ".repeat(Math.max(0, 26 - name.length - version.length))}${c.cyan}│${c.reset}`);
        console.log(`  ${c.cyan}│${c.reset}                                          ${c.cyan}│${c.reset}`);
        console.log(`  ${c.cyan}│${c.reset}   ${c.green}● Server${c.reset}  ${c.dim}http://localhost:${port}${c.reset}${" ".repeat(Math.max(0, 20 - String(port).length))}${c.cyan}│${c.reset}`);
        console.log(`  ${c.cyan}│${c.reset}   ${c.blue}● Node${c.reset}    ${c.dim}${process.version}${c.reset}${" ".repeat(Math.max(0, 24 - process.version.length))}${c.cyan}│${c.reset}`);
        console.log(`  ${c.cyan}│${c.reset}   ${c.magenta}● Env${c.reset}     ${c.dim}${process.env.NODE_ENV || "development"}${c.reset}${" ".repeat(Math.max(0, 24 - (process.env.NODE_ENV || "development").length))}${c.cyan}│${c.reset}`);
        console.log(`  ${c.cyan}│${c.reset}                                          ${c.cyan}│${c.reset}`);
        console.log(`  ${c.cyan}${line}${c.reset}`);
        console.log("");
    }
};
