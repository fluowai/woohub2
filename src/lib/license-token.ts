import crypto from "node:crypto";

/**
 * Chave de licenca auto-contida (offline).
 *
 * Formato: `WOHUB1.<payload base64url>.<assinatura Ed25519 base64url>`
 *
 * Por que assinada: o gate de subida do container precisa decidir ANTES de a
 * aplicacao subir, e sem depender do banco (em deploy novo a tabela License
 * ainda nao existe). Validar a licenca numa linha da propria base seria
 * forjavel por quem controla a DATABASE_URL e criaria um ovo x galinha.
 *
 * A verificacao usa apenas `node:crypto` (sem dependencia externa).
 */

export const LICENSE_TOKEN_PREFIX = "WOHUB1";

export interface LicenseClaims {
  /** id da licenca (rastreabilidade / auditoria) */
  jti: string;
  /** emitida para (empresa/revendedor) */
  sub: string;
  email?: string;
  type?: string;
  status?: string;
  /** epoch seconds */
  iat?: number;
  /** epoch seconds; null/ausente = sem expiracao */
  exp?: number | null;
  maxInstances?: number;
  maxTenants?: number;
  maxUsers?: number;
  maxResellers?: number;
  features?: string[] | null;
  /** binding opcional: so valida neste host/domínio */
  domain?: string | null;
}

export interface VerifyOptions {
  /** SPKI DER em base64, PEM, ou caminho ja lido como string */
  publicKey: string;
  /** horas de carencia apos `exp` (padrao 24) */
  graceHours?: number;
  /** relogio injetavel (testes) */
  now?: Date;
}

export type VerifyResult =
  | { ok: true; claims: LicenseClaims; gracePeriod: boolean }
  | { ok: false; error: string };

function b64urlDecode(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

import fs from "node:fs";
import path from "node:path";

export function isSignedLicenseKey(key: string): boolean {
  return key.trim().startsWith(`${LICENSE_TOKEN_PREFIX}.`);
}

/** Tenta extrair as claims do payload sem verificar assinatura (para inspecionar jti/sub). */
export function decodeLicensePayload(key: string): LicenseClaims | null {
  const trimmed = (key || "").trim();
  if (!isSignedLicenseKey(trimmed)) return null;
  const parts = trimmed.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = b64urlDecode(parts[1]).toString("utf8");
    return JSON.parse(json) as LicenseClaims;
  } catch {
    return null;
  }
}

/** Lê chave pública padrão de LICENSE_PUBLIC_KEY ou de arquivo license.pub. */
export function getDefaultPublicKey(): string {
  const fromEnv = process.env.LICENSE_PUBLIC_KEY?.trim();
  if (fromEnv) return fromEnv;

  const candidates = [
    path.join(process.cwd(), "scripts", "license.pub"),
    path.join(process.cwd(), "license.pub"),
    "license.pub",
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
    } catch {
      /* segue */
    }
  }
  return "";
}

/** Converte SPKI (base64) ou PEM em um KeyObject Ed25519. Lanca em erro. */
export function toPublicKey(input: string): crypto.KeyObject {
  const raw = input.trim();
  const key = raw.includes("BEGIN PUBLIC KEY")
    ? { key: raw, format: "pem" as const, type: "spki" as const }
    : { key: Buffer.from(raw, "base64"), format: "der" as const, type: "spki" as const };
  const pub = crypto.createPublicKey(key);
  if (pub.asymmetricKeyType !== "ed25519") {
    throw new Error("A chave publica de licenca deve ser Ed25519");
  }
  return pub;
}

export function toPrivateKey(input: string): crypto.KeyObject {
  const raw = input.trim();
  const key = raw.includes("PRIVATE KEY")
    ? { key: raw, format: "pem" as const, type: "pkcs8" as const }
    : { key: Buffer.from(raw, "base64"), format: "der" as const, type: "pkcs8" as const };
  const priv = crypto.createPrivateKey(key);
  if (priv.asymmetricKeyType !== "ed25519") {
    throw new Error("A chave privada de licenca deve ser Ed25519");
  }
  return priv;
}

/** Assina claims e devolve a chave no formato `WOHUB1.<payload>.<sig>`. */
export function signLicenseKey(claims: LicenseClaims, privateKey: string | crypto.KeyObject): string {
  const priv = typeof privateKey === "string" ? toPrivateKey(privateKey) : privateKey;
  const payload = b64urlEncode(Buffer.from(JSON.stringify(claims), "utf8"));
  const signingInput = `${LICENSE_TOKEN_PREFIX}.${payload}`;
  const sig = crypto.sign(null, Buffer.from(signingInput, "utf8"), priv);
  return `${signingInput}.${b64urlEncode(sig)}`;
}

/**
 * Verifica assinatura, expiracao (com carencia) e coerencia de claims.
 * Falha fechada: qualquer problema = `ok: false`.
 */
export function verifyLicenseToken(key: string, opts: VerifyOptions): VerifyResult {
  const trimmed = (key || "").trim();

  if (!trimmed) {
    return { ok: false, error: "LICENSE_KEY nao definida" };
  }
  if (!isSignedLicenseKey(trimmed)) {
    return { ok: false, error: "Formato de chave invalido (esperado WOHUB1.<payload>.<assinatura>)" };
  }

  const parts = trimmed.split(".");
  if (parts.length !== 3) {
    return { ok: false, error: "Chave de licenca malformada (esperado 3 segmentos)" };
  }

  const [, payloadB64, sigB64] = parts;

  let claims: LicenseClaims;
  try {
    claims = JSON.parse(b64urlDecode(payloadB64).toString("utf8")) as LicenseClaims;
  } catch {
    return { ok: false, error: "Payload da licenca nao e JSON valido" };
  }

  if (!claims || typeof claims !== "object" || !claims.jti || !claims.sub) {
    return { ok: false, error: "Claims obrigatórias ausentes (jti, sub)" };
  }

  let pub: crypto.KeyObject;
  try {
    pub = toPublicKey(opts.publicKey);
  } catch (e) {
    return { ok: false, error: `Chave publica de licenca invalida: ${(e as Error).message}` };
  }

  const data = Buffer.from(`${LICENSE_TOKEN_PREFIX}.${payloadB64}`, "utf8");
  let signatureOk = false;
  try {
    signatureOk = crypto.verify(null, data, pub, b64urlDecode(sigB64));
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) {
    return { ok: false, error: "Assinatura da licenca invalida" };
  }

  if (claims.status === "REVOKED") {
    return { ok: false, error: "Licenca revogada" };
  }
  if (claims.status === "SUSPENDED") {
    return { ok: false, error: "Licenca suspensa" };
  }

  const now = opts.now ?? new Date();
  const nowSec = Math.floor(now.getTime() / 1000);

  if (typeof claims.iat === "number" && claims.iat > nowSec + 60) {
    return { ok: false, error: "Licenca emitida no futuro" };
  }

  let gracePeriod = false;
  if (typeof claims.exp === "number") {
    const graceHours = opts.graceHours ?? 24;
    const graceEnd = claims.exp + Math.max(0, graceHours) * 3600;
    if (nowSec > claims.exp && nowSec <= graceEnd) {
      gracePeriod = true;
    } else if (nowSec > claims.exp) {
      return { ok: false, error: "Licenca expirada (carencia encerrada)" };
    }
  }

  if (claims.domain) {
    const host = (process.env.LICENSE_DOMAIN || process.env.BASE_URL || "").toLowerCase();
    const wanted = claims.domain.toLowerCase();
    const hostOk = host.includes(wanted) || wanted === host;
    if (!hostOk) {
      return { ok: false, error: `Licenca restrita ao dominio ${claims.domain}` };
    }
  }

  return { ok: true, claims, gracePeriod };
}
