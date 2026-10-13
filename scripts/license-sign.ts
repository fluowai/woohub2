#!/usr/bin/env node
/**
 * Emissor de licencas Woohub (roda NO SERVIDOR DO FORNECEDOR, nunca na base
 * do cliente).
 *
 * Gerar o par de chaves (uma unica vez):
 *   npx tsx scripts/license-sign.ts --genkey
 *   -> guarda LICENCA_PRIV_KEY em cofre; LICENCA_PUB_KEY vai para o deploy
 *      (env LICENSE_PUBLIC_KEY ou arquivo scripts/license.pub na imagem).
 *
 * Emitir uma licenca:
 *   npx tsx scripts/license-sign.ts --sign \
 *     --priv "$LICENCA_PRIV_KEY" \
 *     --sub "Empresa X" --email "contato@x.com" --type PROFESSIONAL \
 *     --days 365 --max-instances 3 --max-tenants 5
 *
 * A chave emitida e uma string `WOHUB1.<payload>.<assinatura>` que o gate do
 * container verifica offline (src/lib/license-token.ts).
 */

import crypto from "node:crypto";

import { signLicenseKey, type LicenseClaims } from "../src/lib/license-token";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) {
    const value = process.argv[idx + 1];
    if (!value.startsWith("--")) return value;
  }
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : undefined;
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`) || process.argv.some((a) => a.startsWith(`--${name}=`));
}

function num(name: string, fallback?: number): number | undefined {
  const raw = arg(name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    console.error(`argumento --${name} invalido: ${raw}`);
    process.exit(1);
  }
  return parsed;
}

function genkey() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const privDer = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  const pubDer = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const privPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const pubPem = publicKey.export({ type: "spki", format: "pem" }).toString();

  console.log(`
Gerado par Ed25519 para licencas Woohub.

[LICENCA_PRIV_KEY] (FORNECEDOR — nunca vai para a base do cliente)
${privDer}

[LICENCA_PRIV_KEY_PEM]
${privPem}[LICENCA_PUB_KEY] / LICENSE_PUBLIC_KEY (vai para o deploy)
${pubDer}

[LICENCA_PUB_KEY_PEM]
${pubPem}
Arquivo alternative: scripts/license.pub (mesmo conteudo do PEM/DER).
`);
}

function sign() {
  const priv = arg("priv") || process.env.LICENCA_PRIV_KEY || process.env.LICENSE_SIGNING_KEY;
  if (!priv) {
    console.error("informe --priv ou defina LICENCA_PRIV_KEY (PKCS8 base64 ou PEM)");
    process.exit(1);
  }

  const sub = arg("sub");
  if (!sub) {
    console.error("obrigatorio: --sub (empresa/revendedor)");
    process.exit(1);
  }

  const now = Math.floor(Date.now() / 1000);
  const days = num("days");
  const expAt = arg("exp");

  let exp: number | null = null;
  if (expAt) {
    const parsed = Date.parse(expAt);
    if (Number.isNaN(parsed)) {
      console.error(`--exp invalido: ${expAt} (use ISO 8601, ex.: 2027-01-01)`);
      process.exit(1);
    }
    exp = Math.floor(parsed / 1000);
  } else if (days !== undefined) {
    exp = now + Math.round(days * 86400);
  }

  const features = arg("features")?.split(",").map((f) => f.trim()).filter(Boolean);

  const claims: LicenseClaims = {
    jti: arg("jti") || crypto.randomUUID(),
    sub,
    type: arg("type") || "STANDARD",
    status: arg("status") || "ACTIVE",
    iat: now,
    exp,
    maxInstances: num("max-instances", 1) ?? 1,
    maxTenants: num("max-tenants", 1) ?? 1,
    maxUsers: num("max-users", 5) ?? 5,
    maxResellers: num("max-resellers", 0) ?? 0,
    features: features && features.length > 0 ? features : null,
    domain: arg("domain") || null,
  };

  const email = arg("email");
  if (email) claims.email = email;

  try {
    const key = signLicenseKey(claims, priv);
    if (has("json")) {
      console.log(JSON.stringify({ licenseKey: key, claims }, null, 2));
    } else {
      console.log(key);
    }
  } catch (e) {
    console.error(`falha ao assinar: ${(e as Error).message}`);
    process.exit(1);
  }
}

if (has("genkey")) {
  genkey();
} else if (has("sign")) {
  sign();
} else {
  console.log(`uso:
  npx tsx scripts/license-sign.ts --genkey
  npx tsx scripts/license-sign.ts --sign --priv <PKCS8|PEM> --sub "<cliente>"
        [--email <email>] [--type TRIAL|STANDARD|PROFESSIONAL|ENTERPRISE|RESELLER]
        [--days <n> | --exp <ISO>] [--max-instances <n>] [--max-tenants <n>]
        [--max-users <n>] [--max-resellers <n>] [--features a,b,c]
        [--domain <host>] [--status ACTIVE|REVOKED|SUSPENDED] [--json]`);
  process.exit(1);
}
