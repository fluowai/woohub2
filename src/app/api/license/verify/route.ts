import { NextRequest, NextResponse } from "next/server";
import { validateLicense } from "@/lib/license";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const key = body.licenseKey || body.key || "";

    if (!key.trim()) {
      return NextResponse.json(
        { valid: false, error: "LICENSE_KEY ausente ou vazia" },
        { status: 400 }
      );
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
    const userAgent = request.headers.get("user-agent") || "woohub-entrypoint/1.0";
    const domain = body.domain || body.host || request.headers.get("host") || undefined;

    const result = await validateLicense(key, { ip, userAgent, domain });

    if (!result.valid) {
      return NextResponse.json(
        {
          valid: false,
          error: result.error || "Licença inválida, suspensa ou expirada",
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      valid: true,
      gracePeriod: !!result.gracePeriod,
      license: {
        id: result.license?.id,
        status: result.license?.status,
        type: result.license?.type,
        issuedTo: result.license?.issuedTo,
        expiresAt: result.license?.expiresAt,
        maxInstances: result.license?.maxInstances,
        maxTenants: result.license?.maxTenants,
        maxUsers: result.license?.maxUsers,
        maxResellers: result.license?.maxResellers,
        features: result.license?.features,
      },
    });
  } catch {
    return NextResponse.json(
      { valid: false, error: "Requisição inválida" },
      { status: 400 }
    );
  }
}
