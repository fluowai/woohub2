import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  isSignedLicenseKey,
  signLicenseKey,
  toPrivateKey,
  toPublicKey,
  verifyLicenseToken,
  type LicenseClaims,
} from "@/lib/license-token";

const pair = crypto.generateKeyPairSync("ed25519");
const PRIV = pair.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
const PUB = pair.publicKey.export({ type: "spki", format: "der" }).toString("base64");
const PUB_PEM = pair.publicKey.export({ type: "spki", format: "pem" }).toString();

const otherPair = crypto.generateKeyPairSync("ed25519");
const OTHER_PRIV = otherPair.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");

const NOW = new Date("2026-06-15T12:00:00Z");
const nowSec = Math.floor(NOW.getTime() / 1000);

function claims(overrides: Partial<LicenseClaims> = {}): LicenseClaims {
  return {
    jti: "lic-1",
    sub: "Empresa X",
    email: "contato@x.com",
    type: "PROFESSIONAL",
    status: "ACTIVE",
    iat: nowSec - 60,
    exp: nowSec + 86400,
    maxInstances: 3,
    maxTenants: 5,
    maxUsers: 10,
    maxResellers: 0,
    features: ["api", "white-label"],
    ...overrides,
  };
}

describe("license-token", () => {
  it("detecta chave assinada pelo prefixo", () => {
    expect(isSignedLicenseKey(`WOHUB1.abc.def`)).toBe(true);
    expect(isSignedLicenseKey("  WOHUB1.abc.def  ")).toBe(true);
    expect(isSignedLicenseKey("WOHUB-1234-5678")).toBe(false);
    expect(isSignedLicenseKey("")).toBe(false);
  });

  it("emite e verifica uma licenca valida (roundtrip)", () => {
    const key = signLicenseKey(claims(), PRIV);
    expect(key.startsWith("WOHUB1.")).toBe(true);

    const result = verifyLicenseToken(key, { publicKey: PUB, now: NOW });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.sub).toBe("Empresa X");
      expect(result.claims.maxInstances).toBe(3);
      expect(result.gracePeriod).toBe(false);
    }
  });

  it("aceita chave publica em PEM", () => {
    const key = signLicenseKey(claims(), PRIV);
    const result = verifyLicenseToken(key, { publicKey: PUB_PEM, now: NOW });
    expect(result.ok).toBe(true);
  });

  it("rejeita payload adulterado", () => {
    const key = signLicenseKey(claims(), PRIV);
    const parts = key.split(".");
    const forged = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    forged.maxInstances = 999;
    const tampered = `WOHUB1.${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${parts[2]}`;
    expect(verifyLicenseToken(tampered, { publicKey: PUB, now: NOW }).ok).toBe(false);
  });

  it("rejeita assinatura feita com outra chave", () => {
    const key = signLicenseKey(claims(), OTHER_PRIV);
    const result = verifyLicenseToken(key, { publicKey: PUB, now: NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/assinatura/i);
  });

  it("rejeita chaves malformadas e vazias", () => {
    expect(verifyLicenseToken("", { publicKey: PUB, now: NOW }).ok).toBe(false);
    expect(verifyLicenseToken("WOHUB1.sohedois", { publicKey: PUB, now: NOW }).ok).toBe(false);
    expect(verifyLicenseToken("qualquer-coisa", { publicKey: PUB, now: NOW }).ok).toBe(false);
    expect(verifyLicenseToken("WOHUB1.nao-base64.nao-base64", { publicKey: PUB, now: NOW }).ok).toBe(false);
  });

  it("rejeita public key invalida ou nao-Ed25519", () => {
    const key = signLicenseKey(claims(), PRIV);
    const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const rsaPem = rsa.publicKey.export({ type: "spki", format: "pem" }).toString();

    expect(verifyLicenseToken(key, { publicKey: "nao-e-chave", now: NOW }).ok).toBe(false);
    expect(() => toPublicKey(rsaPem)).toThrow(/Ed25519/);
    expect(verifyLicenseToken(key, { publicKey: rsaPem, now: NOW }).ok).toBe(false);
  });

  it("bloqueia licenca expirada alem da carencia", () => {
    const key = signLicenseKey(claims({ exp: nowSec - 86400 * 3 }), PRIV);
    const result = verifyLicenseToken(key, { publicKey: PUB, now: NOW, graceHours: 24 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/expirada/i);
  });

  it("bloqueia licenca expirada quando nao ha carencia configurada", () => {
    const key = signLicenseKey(claims({ exp: nowSec - 100 }), PRIV);
    const result = verifyLicenseToken(key, { publicKey: PUB, now: NOW, graceHours: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/expirada/i);
  });

  it("libera dentro da carencia marcando gracePeriod", () => {
    const key = signLicenseKey(claims({ exp: nowSec - 100 }), PRIV);
    const result = verifyLicenseToken(key, { publicKey: PUB, now: NOW, graceHours: 24 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.gracePeriod).toBe(true);
  });

  it("libera licenca sem expiracao (exp nulo)", () => {
    const key = signLicenseKey(claims({ exp: null }), PRIV);
    expect(verifyLicenseToken(key, { publicKey: PUB, now: NOW }).ok).toBe(true);
  });

  it("bloqueia licenca revogada ou suspensa embutida no token", () => {
    for (const status of ["REVOKED", "SUSPENDED"]) {
      const key = signLicenseKey(claims({ status }), PRIV);
      const result = verifyLicenseToken(key, { publicKey: PUB, now: NOW });
      expect(result.ok).toBe(false);
    }
  });

  it("bloqueia licenca emitida no futuro", () => {
    const key = signLicenseKey(claims({ iat: nowSec + 3600 }), PRIV);
    expect(verifyLicenseToken(key, { publicKey: PUB, now: NOW }).ok).toBe(false);
  });

  it("exige claims obrigatórias (jti, sub)", () => {
    const key = signLicenseKey({ jti: "", sub: "" }, PRIV);
    expect(verifyLicenseToken(key, { publicKey: PUB, now: NOW }).ok).toBe(false);
  });

  it("respeita binding de dominio quando declarado", () => {
    const key = signLicenseKey(claims({ domain: "cliente.com" }), PRIV);
    delete process.env.LICENSE_DOMAIN;
    delete process.env.BASE_URL;

    expect(verifyLicenseToken(key, { publicKey: PUB, now: NOW }).ok).toBe(false);

    process.env.LICENSE_DOMAIN = "https://cliente.com.br";
    expect(verifyLicenseToken(key, { publicKey: PUB, now: NOW }).ok).toBe(true);
    delete process.env.LICENSE_DOMAIN;
  });

  it("toPrivateKey aceita DER e PEM e recusa outro algoritmo", () => {
    expect(toPrivateKey(PRIV).asymmetricKeyType).toBe("ed25519");
    const pem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(toPrivateKey(pem).asymmetricKeyType).toBe("ed25519");

    const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const rsaPriv = rsa.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(() => toPrivateKey(rsaPriv)).toThrow(/Ed25519/);
  });
});
