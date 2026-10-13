import { NextRequest, NextResponse } from "next/server";
import { validateLicense } from "@/lib/license";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key") || searchParams.get("licenseKey") || "";

  if (!key.trim()) {
    return NextResponse.json(
      {
        version: "2",
        templates: [],
        error: "Parâmetro 'key' de licença obrigatório",
      },
      { status: 400 }
    );
  }

  const validation = await validateLicense(key);

  if (!validation.valid || !validation.license) {
    return NextResponse.json(
      {
        version: "2",
        templates: [],
        error: validation.error || "Licença inválida ou expirada",
      },
      { status: 403 }
    );
  }

  const serverUrl = process.env.BASE_URL || `${request.nextUrl.protocol}//${request.headers.get("host")}`;
  const stackUrl = `${serverUrl}/api/license/portainer-stack?key=${encodeURIComponent(key)}`;

  const templates = [
    {
      type: 3, // Compose stack
      title: "Woohub White-Label WhatsApp API",
      description: `Stack completa da plataforma Woohub para ${validation.license.issuedTo}`,
      note: `Licença ativa até: ${validation.license.expiresAt ? new Date(validation.license.expiresAt).toLocaleDateString("pt-BR") : "vitalícia"}`,
      categories: ["whatsapp", "messaging", "api", "crm"],
      platform: "linux",
      logo: `${serverUrl}/favicon.ico`,
      repository: {
        url: stackUrl,
        stackfile: "docker-compose.yml",
      },
      env: [
        {
          name: "DATABASE_URL",
          label: "Database URL (PostgreSQL)",
          description: "URL de conexão PostgreSQL (ex: Supabase pooler porta 5432 com sslmode=require)",
          default: "",
        },
        {
          name: "AUTH_SECRET",
          label: "Auth Secret (NextAuth)",
          description: "Chave secreta aleatória de 32 caracteres para encriptação da sessão",
          default: "",
        },
        {
          name: "BASE_URL",
          label: "Domínio / Base URL",
          description: "URL pública da sua plataforma (ex: https://zap.suaempresa.com.br)",
          default: "http://localhost:3000",
        },
      ],
    },
  ];

  return NextResponse.json({
    version: "2",
    templates,
  });
}
