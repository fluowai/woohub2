import crypto from "node:crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { signLicenseKey, type LicenseClaims } from "@/lib/license-token";

process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/woohub_test?sslmode=require";

// Par de chaves Ed25519 de teste
const pair = crypto.generateKeyPairSync("ed25519");
const PRIV = pair.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
const PUB = pair.publicKey.export({ type: "spki", format: "der" }).toString("base64");

process.env.LICENSE_PUBLIC_KEY = PUB;

const NOW_SEC = Math.floor(Date.now() / 1000);

function createTestToken(overrides: Partial<LicenseClaims> = {}): string {
  const claims: LicenseClaims = {
    jti: "test-license-1",
    sub: "Revenda Teste WhiteLabel",
    email: "contato@revenda.com",
    type: "RESELLER",
    status: "ACTIVE",
    iat: NOW_SEC - 60,
    exp: NOW_SEC + 86400 * 30, // 30 dias
    maxInstances: 50,
    maxTenants: 20,
    maxUsers: 100,
    maxResellers: 0,
    features: ["whitelabel", "api"],
    ...overrides,
  };
  return signLicenseKey(claims, PRIV);
}

describe("Rotas e Validação de Licença para Portainer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/license/check bloqueia quando a chave não é informada", async () => {
    const { GET } = await import("@/app/api/license/check/route");
    const req = new NextRequest("http://localhost:3000/api/license/check");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.valid).toBe(false);
  });

  it("GET /api/license/check rejeita chave inválida com 403", async () => {
    const { GET } = await import("@/app/api/license/check/route");
    const req = new NextRequest("http://localhost:3000/api/license/check?key=CHAVE_TOTALMENTE_INVALIDA");
    const res = await GET(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.valid).toBe(false);
  });

  it("GET /api/license/check aprova chave assinada válida", async () => {
    const token = createTestToken();
    const { GET } = await import("@/app/api/license/check/route");
    const req = new NextRequest(`http://localhost:3000/api/license/check?key=${encodeURIComponent(token)}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.valid).toBe(true);
    expect(json.data.issuedTo).toBe("Revenda Teste WhiteLabel");
    expect(json.data.limits.maxInstances).toBe(50);
  });

  it("POST /api/license/verify para heartbeat e entrypoint", async () => {
    const token = createTestToken();
    const { POST } = await import("@/app/api/license/verify/route");
    const req = new NextRequest("http://localhost:3000/api/license/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseKey: token }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.valid).toBe(true);
    expect(json.license.issuedTo).toBe("Revenda Teste WhiteLabel");
  });

  it("GET /api/license/portainer-stack BLOQUEIA com 403 se a licença for inválida", async () => {
    const { GET } = await import("@/app/api/license/portainer-stack/route");
    const req = new NextRequest("http://localhost:3000/api/license/portainer-stack?key=INVALIDA");
    const res = await GET(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe("license_access_denied");
  });

  it("GET /api/license/portainer-stack ENTREGA YAML com 200 se a licença for válida", async () => {
    const token = createTestToken();
    const { GET } = await import("@/app/api/license/portainer-stack/route");
    const req = new NextRequest(`http://localhost:3000/api/license/portainer-stack?key=${encodeURIComponent(token)}&format=compose`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("yaml");

    const yaml = await res.text();
    // Confere se as diretivas de imagem, chave e proteção estão presentes no YAML
    expect(yaml).toContain("woohub-whitelabel");
    expect(yaml).toContain("LICENSE_KEY=");
    expect(yaml).toContain("LICENSE_SERVER_URL=");
    expect(yaml).toContain("ghcr.io/woohub/app:1.6.4");
  });

  it("GET /api/license/portainer-template entrega formato template do Portainer", async () => {
    const token = createTestToken();
    const { GET } = await import("@/app/api/license/portainer-template/route");
    const req = new NextRequest(`http://localhost:3000/api/license/portainer-template?key=${encodeURIComponent(token)}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.version).toBe("2");
    expect(json.templates.length).toBe(1);
    expect(json.templates[0].title).toContain("Woohub White-Label");
  });
});
