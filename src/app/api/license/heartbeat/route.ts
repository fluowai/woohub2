import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeInstallation, sanitizedHeartbeat } from "@/lib/installation";

export async function POST(request: NextRequest) {
  const installation = await authorizeInstallation(request);
  if (!installation) return NextResponse.json({ status: false, code: "installation_unauthorized" }, { status: 401 });
  const payload = sanitizedHeartbeat(await request.json().catch(() => ({})));
  const now = new Date();
  const licenseValid = installation.license.status === "ACTIVE" && (!installation.license.expiresAt || installation.license.expiresAt > now);
  await prisma.installation.update({
    where: { id: installation.id },
    data: { lastContactAt: now, lastHeartbeatAt: now, reportedInstances: payload.instances, reportedConnected: payload.connected, reportedState: payload.state, reportedVersion: payload.version },
  });
  return NextResponse.json({ status: true, data: { license: licenseValid ? "ACTIVE" : installation.license.status, expiresAt: installation.license.expiresAt, maxInstances: installation.license.maxInstances, grace: false } });
}
