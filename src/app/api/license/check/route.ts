import { NextRequest, NextResponse } from "next/server";
import { validateLicense } from "@/lib/license";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key") || searchParams.get("licenseKey") || "";

  if (!key.trim()) {
    return NextResponse.json(
      { status: false, valid: false, error: "Parâmetro 'key' obrigatório" },
      { status: 400 }
    );
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  const userAgent = request.headers.get("user-agent") || undefined;
  const domain = searchParams.get("domain") || request.headers.get("host") || undefined;

  const result = await validateLicense(key, { ip, userAgent, domain });

  if (!result.valid) {
    return NextResponse.json(
      {
        status: false,
        valid: false,
        error: result.error || "Licença inválida ou expirada",
      },
      { status: 403 }
    );
  }

  return NextResponse.json({
    status: true,
    valid: true,
    data: {
      id: result.license?.id,
      status: result.license?.status,
      type: result.license?.type,
      issuedTo: result.license?.issuedTo,
      expiresAt: result.license?.expiresAt,
      gracePeriod: !!result.gracePeriod,
      limits: {
        maxInstances: result.license?.maxInstances,
        maxTenants: result.license?.maxTenants,
        maxUsers: result.license?.maxUsers,
        maxResellers: result.license?.maxResellers,
      },
      features: result.license?.features,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const key = body.key || body.licenseKey || "";

    if (!key.trim()) {
      return NextResponse.json(
        { status: false, valid: false, error: "Chave de licença obrigatória" },
        { status: 400 }
      );
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
    const userAgent = request.headers.get("user-agent") || undefined;
    const domain = body.domain || request.headers.get("host") || undefined;

    const result = await validateLicense(key, { ip, userAgent, domain });

    if (!result.valid) {
      return NextResponse.json(
        {
          status: false,
          valid: false,
          error: result.error || "Licença inválida ou expirada",
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      status: true,
      valid: true,
      data: {
        id: result.license?.id,
        status: result.license?.status,
        type: result.license?.type,
        issuedTo: result.license?.issuedTo,
        expiresAt: result.license?.expiresAt,
        gracePeriod: !!result.gracePeriod,
        limits: {
          maxInstances: result.license?.maxInstances,
          maxTenants: result.license?.maxTenants,
          maxUsers: result.license?.maxUsers,
          maxResellers: result.license?.maxResellers,
        },
        features: result.license?.features,
      },
    });
  } catch {
    return NextResponse.json(
      { status: false, valid: false, error: "Corpo JSON inválido" },
      { status: 400 }
    );
  }
}
