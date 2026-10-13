#!/usr/bin/env node
/**
 * Woohub License Gate (entrypoint do container).
 *
 * Roda ANTES da aplicacao. Sem licenca valida o processo sai com codigo 1 e o
 * container nunca sobe (tarefa "Failed" no Portainer / `Exited` no Compose).
 *
 * Duas fontes de autoridade, nesta ordem:
 *   1. Chave ASSINADA (`WOHUB1.<payload>.<sig>`)  -> verificacao 100% offline,
 *      sem banco. Caminho padrao em producao.
 *   2. Chave opaca (`WOHUB-XXXX-...`)             -> verificada na tabela
 *      `License` do banco (compatibilidade com chaves emitidas pelo painel).
 *      Falha fechada se o banco/registro nao estiver disponivel.
 *
 * Variaveis de ambiente:
 *   LICENSE_KEY                obrigatoria
 *   LICENSE_PUBLIC_KEY         SPKI base64 ou PEM da chave Ed25519 (chave 1)
 *   LICENSE_GRACE_PERIOD_HOURS carencia apos expiracao (padrao 24)
 *   LICENSE_DOMAIN             host esperado quando a licenca declara `domain`
 *   DATABASE_URL               obrigatoria apenas no caminho 2
 *
 * Uso: entrypoint recebe o comando real apos `--` (ver Dockerfile) e o executa
 * propagando sinais; sem `--` sobe `src/server/index.ts`.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  isSignedLicenseKey,
  verifyLicenseToken,
  type LicenseClaims,
} from "../src/lib/license-token";

const prisma = new PrismaClient({ log: ["error", "warn"] });

const GRACE_PERIOD_HOURS = parseInt(process.env.LICENSE_GRACE_PERIOD_HOURS || "24", 10);
const DEFAULT_COMMAND = ["node", "node_modules/tsx/dist/cli.mjs", "src/server/index.ts"];

function log(level: "info" | "warn" | "error", message: string) {
  const ts = new Date().toISOString();
  const tag = { info: "\x1b[36mINFO\x1b[0m", warn: "\x1b[33mWARN\x1b[0m", error: "\x1b[31mERROR\x1b[0m" }[level];
  console.log(`${ts} ${tag} [LICENSE] ${message}`);
}

function banner(lines: string[]) {
  const width = 64;
  console.log(`\n╔${"═".repeat(width)}╗`);
  for (const l of lines) console.log(`║ ${l.padEnd(width - 2)} ║`);
  console.log(`╚${"═".repeat(width)}╝\n`);
}

function fail(message: string, lines: string[] = []): never {
  log("error", message);
  banner(["LICENCA INVALIDA / AUSENTE", "", ...lines, "", message]);
  process.exit(1);
}

function readPublicKey(): string {
  const fromEnv = process.env.LICENSE_PUBLIC_KEY?.trim();
  if (fromEnv) return fromEnv;

  const candidates = [path.join(process.cwd(), "scripts", "license.pub"), "license.pub"];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
    } catch {
      /* segue para a mensagem de erro */
    }
  }
  return "";
}

// -----------------------------------------------------------------------------
// Caminho 1: chave assinada (offline, sem banco)
// -----------------------------------------------------------------------------
function gateSignedKey(licenseKey: string): LicenseClaims {
  const publicKey = readPublicKey();
  if (!publicKey) {
    return fail("LICENSE_PUBLIC_KEY nao definida (nem scripts/license.pub encontrada)");
  }

  const result = verifyLicenseToken(licenseKey, { publicKey, graceHours: GRACE_PERIOD_HOURS });
  if (!result.ok) {
    return fail(result.error, [
      "O container nao sobe sem uma licenca valida.",
      "Emita uma chave com: npx tsx scripts/license-sign.ts --genkey",
    ]);
  }

  const { claims } = result;
  banner([
    "LICENCA VALIDA (assinada)",
    `Cliente:     ${claims.sub}`,
    `Tipo:        ${claims.type || "n/d"}`,
    `ID:          ${claims.jti}`,
    `Expira em:   ${claims.exp ? new Date(claims.exp * 1000).toISOString() : "sem expiracao"}`,
    `Instancias:  ${claims.maxInstances ?? "n/d"}`,
    result.gracePeriod ? "ATENCAO: carencia apos expiracao ativa" : "Status:      OK",
  ]);

  if (result.gracePeriod) {
    log("warn", "licenca em carencia — renove imediatamente para evitar interrupcao");
  }

  recordValidationBestEffort(claims.jti, true).catch(() => {
    /* telemetria nunca derruba o boot */
  });
  return claims;
}

// -----------------------------------------------------------------------------
// Caminho 2: chave opaca validada no banco (compatibilidade)
// -----------------------------------------------------------------------------
type DbLicense = {
  id: string;
  status: string;
  type: string;
  issuedTo: string;
  expiresAt: Date | null;
  maxInstances: number;
  maxTenants: number;
  maxUsers: number;
  maxResellers: number;
  features: unknown;
};

async function gateDatabaseKey(licenseKey: string): Promise<DbLicense> {
  if (!process.env.DATABASE_URL) {
    return fail("Caminho de licenca por banco exige DATABASE_URL");
  }

  let license: DbLicense | null = null;
  try {
    const row = await prisma.license.findUnique({ where: { licenseKey } });
    if (row) {
      license = {
        id: row.id,
        status: row.status,
        type: row.type,
        issuedTo: row.issuedTo,
        expiresAt: row.expiresAt,
        maxInstances: row.maxInstances,
        maxTenants: row.maxTenants,
        maxUsers: row.maxUsers,
        maxResellers: row.maxResellers,
        features: row.features,
      };
    }
  } catch (e) {
    return fail(`Banco indisponivel para validar a licenca: ${(e as Error).message}`);
  }

  if (!license) {
    return fail("Licenca nao encontrada no banco de dados");
  }
  if (license.status === "REVOKED") return fail("Licenca revogada");
  if (license.status === "SUSPENDED") return fail("Licenca suspensa");

  const now = Date.now();
  let gracePeriod = false;
  if (license.expiresAt && license.expiresAt.getTime() < now) {
    const graceEnd = license.expiresAt.getTime() + GRACE_PERIOD_HOURS * 3600 * 1000;
    if (now > graceEnd) {
      try {
        await prisma.license.update({ where: { id: license.id }, data: { status: "EXPIRED" } });
      } catch {
        /* best-effort */
      }
      return fail("Licenca expirada (carencia encerrada)");
    }
    gracePeriod = true;
  }

  banner([
    "LICENCA VALIDA (banco)",
    `Cliente:     ${license.issuedTo}`,
    `Tipo:        ${license.type}`,
    `Status:      ${license.status}`,
    `Expira em:   ${license.expiresAt ? license.expiresAt.toISOString() : "sem expiracao"}`,
    gracePeriod ? "ATENCAO: carencia apos expiracao ativa" : "Status:      OK",
  ]);

  await recordValidation(license.id);
  return license;
}

async function recordValidation(licenseId: string) {
  try {
    await prisma.$transaction([
      prisma.licenseValidation.create({
        data: {
          licenseId,
          ip: process.env.HOST_IP || "container",
          domain: process.env.LICENSE_DOMAIN || "docker",
          userAgent: "woohub-container/1.0",
          success: true,
        },
      }),
      prisma.license.update({
        where: { id: licenseId },
        data: { validationCount: { increment: 1 }, lastValidatedAt: new Date() },
      }),
    ]);
  } catch (e) {
    log("warn", `nao foi possivel registrar a validacao: ${(e as Error).message}`);
  }
}

/** Caminho assinado nao depende do banco; se a linha existir, apenas registra. */
async function recordValidationBestEffort(jti: string, success: boolean) {
  if (!process.env.DATABASE_URL) return;
  try {
    const row = await prisma.license.findFirst({ where: { OR: [{ id: jti }, { licenseKey: jti }] } });
    if (!row) return;
    await prisma.$transaction([
      prisma.licenseValidation.create({
        data: {
          licenseId: row.id,
          ip: process.env.HOST_IP || "container",
          domain: process.env.LICENSE_DOMAIN || "docker",
          userAgent: "woohub-container/1.0",
          success,
        },
      }),
      prisma.license.update({
        where: { id: row.id },
        data: { validationCount: { increment: 1 }, lastValidatedAt: new Date() },
      }),
    ]);
  } catch {
    /* telemetria nunca bloqueia o boot */
  }
}

// -----------------------------------------------------------------------------
// Execucao
// -----------------------------------------------------------------------------
function resolveCommand(): string[] {
  const sep = process.argv.indexOf("--");
  const forwarded = sep >= 0 ? process.argv.slice(sep + 1) : [];
  return forwarded.length > 0 ? forwarded : DEFAULT_COMMAND;
}

function startChild(command: string[]): void {
  const [cmd, ...args] = command;
  const child = spawn(cmd, args, { stdio: "inherit", env: process.env });

  const forward = (signal: NodeJS.Signals) => {
    if (!child.killed) child.kill(signal);
  };
  process.on("SIGTERM", () => forward("SIGTERM"));
  process.on("SIGINT", () => forward("SIGINT"));

  child.on("error", (err) => {
    log("error", `falha ao iniciar a aplicacao (${cmd}): ${err.message}`);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

async function checkRemoteLicense(
  licenseKey: string,
  serverUrl: string
): Promise<{ ok: boolean; status?: string; error?: string }> {
  try {
    const endpoint = `${serverUrl.replace(/\/+$/, "")}/api/license/verify`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "woohub-gate/1.6.4",
      },
      body: JSON.stringify({
        licenseKey,
        domain: process.env.LICENSE_DOMAIN || process.env.BASE_URL || "",
        host: process.env.HOSTNAME || "",
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = (await res.json().catch(() => ({}))) as {
      valid?: boolean;
      error?: string;
      license?: { status?: string };
    };

    if (res.status === 200 && data.valid) {
      return { ok: true, status: data.license?.status || "ACTIVE" };
    }

    if (res.status === 403 || data.valid === false) {
      return { ok: false, error: data.error || "Licenca rejeitada pela autoridade central" };
    }

    return { ok: true, status: "SERVER_UNAVAILABLE" };
  } catch {
    return { ok: true, status: "NETWORK_TIMEOUT" };
  }
}

async function main() {
  const licenseKey = (process.env.LICENSE_KEY || "").trim();

  if (!licenseKey) {
    return fail("LICENSE_KEY nao definida nas variaveis de ambiente", [
      "Sem licenca o container nao sobe.",
      "Defina LICENSE_KEY no .env / na stack antes do deploy.",
    ]);
  }

  // 1. Validacao online (se LICENSE_SERVER_URL estiver definido)
  const serverUrl = process.env.LICENSE_SERVER_URL?.trim();
  if (serverUrl) {
    log("info", `consultando autoridade remota em ${serverUrl}...`);
    const remote = await checkRemoteLicense(licenseKey, serverUrl);
    if (!remote.ok) {
      return fail(remote.error || "Licenca suspensa ou revogada", [
        "Acesso cancelado ou suspenso pelo fornecedor.",
        "Entre em contato com o suporte para regularizar.",
      ]);
    }
    if (remote.status === "SERVER_UNAVAILABLE" || remote.status === "NETWORK_TIMEOUT") {
      log("warn", "autoridade remota temporariamente inacessivel - operando com validacao local");
    } else {
      log("info", "autoridade remota confirmou licenca ativa");
    }
  }

  let usedDatabase = false;

  if (isSignedLicenseKey(licenseKey)) {
    await gateSignedKey(licenseKey);
  } else if (licenseKey.startsWith("WOHUB-")) {
    usedDatabase = true;
    await gateDatabaseKey(licenseKey);
  } else {
    return fail("Formato de chave invalido (esperado WOHUB1.* ou WOHUB-*)");
  }

  log("info", "licenca validada - iniciando aplicacao");

  if (usedDatabase) {
    try {
      await prisma.$disconnect();
    } catch {
      /* ignora */
    }
  }

  startChild(resolveCommand());
}

main().catch(async (err) => {
  log("error", `erro fatal no gate de licenca: ${(err as Error).message}`);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignora */
  }
  process.exit(1);
});
