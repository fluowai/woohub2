import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const installationId = typeof body.installationId === "string" ? body.installationId : "";
  const bootstrap = typeof body.bootstrap === "string" ? body.bootstrap : "";
  if (!installationId || !bootstrap) return NextResponse.json({ status: false, code: "invalid_activation" }, { status: 400 });
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const installation = await tx.installation.findUnique({ where: { id: installationId }, include: { license: true } });
    if (!installation || !installation.bootstrapHash || installation.bootstrapHash !== digest(bootstrap) || !installation.bootstrapExpiresAt || installation.bootstrapExpiresAt <= now) return null;
    const nonce = randomBytes(16).toString("hex");
    return tx.installation.update({ where: { id: installation.id }, data: { bootstrapHash: null, bootstrapExpiresAt: null, activationNonce: nonce, status: "ACTIVE", activatedAt: now, lastContactAt: now }, include: { license: true, templateVersion: { select: { version: true } } } });
  });
  if (!result) return NextResponse.json({ status: false, code: "bootstrap_invalid_or_used" }, { status: 409 });
  return NextResponse.json({ status: true, data: { installationId: result.id, status: result.status, license: { id: result.license.id, expiresAt: result.license.expiresAt, maxInstances: result.license.maxInstances, features: result.license.features }, templateVersion: result.templateVersion.version } });
}
