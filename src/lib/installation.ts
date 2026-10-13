import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";

export function hashInstallationKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function issueInstallationKey(): { key: string; hash: string } {
  const key = `wohi_${randomBytes(32).toString("base64url")}`;
  return { key, hash: hashInstallationKey(key) };
}

export function validInstallationKey(candidate: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashInstallationKey(candidate), "utf8");
  const expected = Buffer.from(expectedHash, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function authorizeInstallation(request: Request) {
  const key = request.headers.get("x-woohub-installation-key")?.trim();
  const id = request.headers.get("x-woohub-installation-id")?.trim();
  if (!key || !id) return null;
  const installation = await prisma.installation.findUnique({ where: { id }, include: { license: true } });
  if (!installation?.installationKeyHash || !validInstallationKey(key, installation.installationKeyHash)) return null;
  return installation;
}

export function sanitizedHeartbeat(body: unknown) {
  const value = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const number = (key: string) => typeof value[key] === "number" && Number.isFinite(value[key]) ? Math.max(0, Math.floor(value[key] as number)) : 0;
  return {
    protocolVersion: number("protocolVersion") || 1,
    licenseRevision: number("licenseRevision") || 1,
    version: typeof value.version === "string" ? value.version.slice(0, 80) : null,
    instances: number("instances"),
    connected: number("connected"),
    state: typeof value.state === "string" ? value.state.slice(0, 40) : null,
  };
}
