import { NextRequest, NextResponse } from "next/server";
import { validateLicense } from "@/lib/license";
import { getDefaultPublicKey } from "@/lib/license-token";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key") || searchParams.get("licenseKey") || "";
  const format = searchParams.get("format") || "compose"; // 'compose' ou 'swarm'

  if (!key.trim()) {
    return NextResponse.json(
      {
        status: false,
        error: "Parâmetro 'key' obrigatório. Forneça sua chave de licença ativa.",
      },
      { status: 400 }
    );
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  const userAgent = request.headers.get("user-agent") || undefined;
  const domain = searchParams.get("domain") || request.headers.get("host") || undefined;

  // 1. Valida a licença com rigor
  const validation = await validateLicense(key, { ip, userAgent, domain });

  if (!validation.valid || !validation.license) {
    return NextResponse.json(
      {
        status: false,
        error: validation.error || "Licença inválida, suspensa ou expirada. Acesso à stack bloqueado.",
        code: "license_access_denied",
      },
      { status: 403 }
    );
  }

  const lic = validation.license;
  const serverUrl = process.env.BASE_URL || `${request.nextUrl.protocol}//${request.headers.get("host")}`;
  const pubKey = getDefaultPublicKey() || process.env.LICENSE_PUBLIC_KEY || "";
  const registryImage = process.env.DOCKER_IMAGE_NAME || "ghcr.io/woohub/app:1.6.4";

  // 2. Gera o YAML personalizado para a Revenda
  const yamlContent = format === "swarm"
    ? generateSwarmStackYaml({
        licenseKey: key,
        licenseId: lic.id,
        issuedTo: lic.issuedTo,
        expiresAt: lic.expiresAt ? new Date(lic.expiresAt).toISOString() : "Sem expiração",
        serverUrl,
        pubKey,
        registryImage,
      })
    : generateComposeStackYaml({
        licenseKey: key,
        licenseId: lic.id,
        issuedTo: lic.issuedTo,
        expiresAt: lic.expiresAt ? new Date(lic.expiresAt).toISOString() : "Sem expiração",
        serverUrl,
        pubKey,
        registryImage,
      });

  return new NextResponse(yamlContent, {
    status: 200,
    headers: {
      "Content-Type": "text/yaml; charset=utf-8",
      "Content-Disposition": `inline; filename="woohub-stack-${format}.yml"`,
      "X-License-Status": lic.status,
      "X-License-Issued-To": encodeURIComponent(lic.issuedTo),
    },
  });
}

function generateComposeStackYaml(params: {
  licenseKey: string;
  licenseId: string;
  issuedTo: string;
  expiresAt: string;
  serverUrl: string;
  pubKey: string;
  registryImage: string;
}): string {
  return `# =============================================================================
# Woohub White-Label — Stack Docker Compose (Portainer)
# Licença Emitida Para: ${params.issuedTo}
# ID da Licença: ${params.licenseId}
# Expiração: ${params.expiresAt}
#
# INSTRUÇÕES PARA PORTAINER:
# 1. No Portainer, adicione o Registry em: Registries > Add Registry
#    - URL: ghcr.io (ou o registry privado informado)
#    - Preencha com o seu Token de Leitura (Personal Access Token)
# 2. Em Stacks > Add Stack, cole este conteúdo ou use a Web URL
# 3. Configure as variáveis de ambiente necessárias (DATABASE_URL, AUTH_SECRET)
# =============================================================================
name: woohub-whitelabel

services:
  migrate:
    image: ${params.registryImage}
    container_name: woohub-migrate
    restart: "no"
    environment:
      - LICENSE_KEY=${params.licenseKey}
      - LICENSE_SERVER_URL=${params.serverUrl}
      - LICENSE_PUBLIC_KEY=${params.pubKey}
      - LICENSE_GRACE_PERIOD_HOURS=24
      - DATABASE_URL=\${DATABASE_URL:?Defina DATABASE_URL no .env (postgresql://...)}
      - TZ=America/Sao_Paulo
      - ADMIN_EMAIL=\${ADMIN_EMAIL:-}
      - ADMIN_PASSWORD=\${ADMIN_PASSWORD:-}
    command: ["sh", "scripts/migrate.sh"]
    networks:
      - woohub_net

  app:
    image: ${params.registryImage}
    container_name: woohub-app
    restart: "on-failure:3"
    ports:
      - "\${PORT:-3000}:3000"
    environment:
      - DATABASE_URL=\${DATABASE_URL:?Defina DATABASE_URL no .env}
      - AUTH_SECRET=\${AUTH_SECRET:?Defina AUTH_SECRET no .env}
      - BASE_URL=\${BASE_URL:-http://localhost:3000}
      - NEXTAUTH_URL=\${NEXTAUTH_URL:-\${BASE_URL:-http://localhost:3000}}
      - NODE_ENV=production
      - PORT=3000
      - HOSTNAME=0.0.0.0
      - TZ=America/Sao_Paulo
      - LICENSE_KEY=${params.licenseKey}
      - LICENSE_SERVER_URL=${params.serverUrl}
      - LICENSE_PUBLIC_KEY=${params.pubKey}
      - LICENSE_GRACE_PERIOD_HOURS=24
      - BAILEYS_LOG_LEVEL=\${BAILEYS_LOG_LEVEL:-error}
      - RATE_LIMIT_PER_MINUTE=\${RATE_LIMIT_PER_MINUTE:-120}
    depends_on:
      migrate:
        condition: service_completed_successfully
    networks:
      - woohub_net
    volumes:
      - woohub_data:/app/data
      - woohub_uploads:/app/uploads
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3000/api/system/health >/dev/null 2>&1 || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 60s

networks:
  woohub_net:
    driver: bridge

volumes:
  woohub_data:
  woohub_uploads:
`;
}

function generateSwarmStackYaml(params: {
  licenseKey: string;
  licenseId: string;
  issuedTo: string;
  expiresAt: string;
  serverUrl: string;
  pubKey: string;
  registryImage: string;
}): string {
  return `# =============================================================================
# Woohub White-Label — Docker Swarm Stack (Portainer Swarm)
# Licença Emitida Para: ${params.issuedTo}
# ID da Licença: ${params.licenseId}
# Expiração: ${params.expiresAt}
# =============================================================================
version: "3.8"

x-license-env: &license-env
  LICENSE_KEY: ${params.licenseKey}
  LICENSE_SERVER_URL: ${params.serverUrl}
  LICENSE_PUBLIC_KEY: "${params.pubKey}"
  LICENSE_GRACE_PERIOD_HOURS: 24

services:
  migrate:
    image: ${params.registryImage}
    command: ["sh", "scripts/migrate.sh"]
    environment:
      <<: *license-env
      DATABASE_URL: \${DATABASE_URL:?Defina DATABASE_URL}
      TZ: America/Sao_Paulo
      ADMIN_EMAIL: \${ADMIN_EMAIL:-}
      ADMIN_PASSWORD: \${ADMIN_PASSWORD:-}
    networks:
      - woohub_public
    deploy:
      replicas: 0
      restart_policy:
        condition: none

  app:
    image: ${params.registryImage}
    ports:
      - "\${PORT:-3000}:3000"
    environment:
      <<: *license-env
      DATABASE_URL: \${DATABASE_URL:?Defina DATABASE_URL}
      NODE_ENV: production
      TZ: America/Sao_Paulo
      AUTH_SECRET: \${AUTH_SECRET:?Defina AUTH_SECRET}
      BASE_URL: \${BASE_URL:-http://localhost:3000}
      NEXTAUTH_URL: \${NEXTAUTH_URL:-\${BASE_URL:-http://localhost:3000}}
      PORT: "3000"
      HOSTNAME: 0.0.0.0
      BAILEYS_LOG_LEVEL: \${BAILEYS_LOG_LEVEL:-error}
      RATE_LIMIT_PER_MINUTE: \${RATE_LIMIT_PER_MINUTE:-120}
    volumes:
      - woohub_data:/app/data
    networks:
      - woohub_public
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3

volumes:
  woohub_data:

networks:
  woohub_public:
    driver: overlay
`;
}
