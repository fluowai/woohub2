import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/access";
import { issueInstallationKey } from "@/lib/installation";
import { audit } from "@/lib/audit";

function hashBootstrap(value: string) { return createHash("sha256").update(value).digest("hex"); }

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok || !auth.context.isMegaAdmin) return NextResponse.json({ status: false, message: "Acesso restrito ao Mega Admin" }, { status: 403 });
  const installations = await prisma.installation.findMany({
    include: { reseller: { select: { id: true, name: true, slug: true } }, license: { select: { id: true, status: true, expiresAt: true, maxInstances: true } }, templateVersion: { select: { version: true, template: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ status: true, data: installations.map((item) => ({ ...item, installationKeyHash: undefined, bootstrapHash: undefined })) });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok || !auth.context.isMegaAdmin) return NextResponse.json({ status: false, message: "Acesso restrito ao Mega Admin" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const resellerId = typeof body.resellerId === "string" ? body.resellerId : "";
  const licenseId = typeof body.licenseId === "string" ? body.licenseId : "";
  const templateVersionId = typeof body.templateVersionId === "string" ? body.templateVersionId : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  const mode = body.mode === "SWARM" ? "SWARM" : "COMPOSE";
  if (!resellerId || !licenseId || !templateVersionId || !name) return NextResponse.json({ status: false, message: "resellerId, licenseId, templateVersionId e name são obrigatórios" }, { status: 400 });
  const [reseller, license, templateVersion] = await Promise.all([
    prisma.reseller.findUnique({ where: { id: resellerId } }),
    prisma.license.findUnique({ where: { id: licenseId } }),
    prisma.stackTemplateVersion.findUnique({ where: { id: templateVersionId }, include: { template: true } }),
  ]);
  if (!reseller || !license || !templateVersion) return NextResponse.json({ status: false, message: "Revenda, licença ou template não encontrado" }, { status: 404 });
  if (license.resellerId !== reseller.id || license.commercialMode !== "WHITE_LABEL") return NextResponse.json({ status: false, code: "license_reseller_mismatch" }, { status: 422 });
  const { key: installationKey, hash: installationKeyHash } = issueInstallationKey();
  const bootstrap = `boot_${randomBytes(32).toString("base64url")}`;
  const installation = await prisma.installation.create({ data: { resellerId, licenseId, templateVersionId, name, mode, status: "RESERVED", capacity: license.maxInstances, bootstrapHash: hashBootstrap(bootstrap), bootstrapExpiresAt: new Date(Date.now() + 15 * 60 * 1000), installationKeyHash } });
  await audit({ actorUserId: auth.context.userId, actorLabel: auth.context.email || "mega-admin", action: "installation.reserve", resource: "installation", resourceId: installation.id, resellerId, metadata: { templateVersionId, mode } });
  return NextResponse.json({ status: true, data: { installationId: installation.id, bootstrap, installationKey, expiresAt: installation.bootstrapExpiresAt, template: { id: templateVersion.template.id, version: templateVersion.version } } }, { status: 201 });
}
