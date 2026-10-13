import { prisma } from "./prisma";
import { logger } from "./logger";
import crypto from "node:crypto";
import type { License as LicenseRow, LicenseStatus, LicenseType } from "@prisma/client";
import {
  decodeLicensePayload,
  getDefaultPublicKey,
  isSignedLicenseKey,
  verifyLicenseToken,
} from "./license-token";

export interface LicenseData {
  id: string;
  licenseKey: string;
  status: string;
  type: string;
  issuedTo: string;
  issuedToEmail: string;
  maxInstances: number;
  maxTenants: number;
  maxUsers: number;
  maxResellers: number;
  features: string[] | null;
  expiresAt: Date | null;
  lastValidatedAt: Date | null;
  validationCount: number;
}

export interface ValidationResult {
  valid: boolean;
  license?: LicenseData;
  error?: string;
  gracePeriod?: boolean;
}

const GRACE_PERIOD_HOURS = 24; // 24 hours grace after expiry

function generateLicenseKey(): string {
  const segments = [];
  for (let i = 0; i < 4; i++) {
    segments.push(crypto.randomBytes(4).toString("hex").toUpperCase());
  }
  return `WOHUB-${segments.join("-")}`;
}

export async function createLicense(data: {
  type: "TRIAL" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE" | "RESELLER";
  issuedTo: string;
  issuedToEmail: string;
  maxInstances?: number;
  maxTenants?: number;
  maxUsers?: number;
  maxResellers?: number;
  expiresAt?: Date | string | null;
  features?: string[];
}): Promise<LicenseData> {
  const licenseKey = generateLicenseKey();

  const defaults: Record<string, { maxInstances: number; maxTenants: number; maxUsers: number; maxResellers: number }> = {
    TRIAL: { maxInstances: 1, maxTenants: 1, maxUsers: 3, maxResellers: 0 },
    STANDARD: { maxInstances: 5, maxTenants: 3, maxUsers: 10, maxResellers: 0 },
    PROFESSIONAL: { maxInstances: 20, maxTenants: 10, maxUsers: 50, maxResellers: 0 },
    ENTERPRISE: { maxInstances: 100, maxTenants: 50, maxUsers: 200, maxResellers: 5 },
    RESELLER: { maxInstances: 200, maxTenants: 100, maxUsers: 500, maxResellers: 20 },
  };

  const typeDefaults = defaults[data.type] || defaults.TRIAL;

  const license = await prisma.license.create({
    data: {
      licenseKey,
      type: data.type,
      issuedTo: data.issuedTo,
      issuedToEmail: data.issuedToEmail,
      maxInstances: data.maxInstances ?? typeDefaults.maxInstances,
      maxTenants: data.maxTenants ?? typeDefaults.maxTenants,
      maxUsers: data.maxUsers ?? typeDefaults.maxUsers,
      maxResellers: data.maxResellers ?? typeDefaults.maxResellers,
      expiresAt: data.expiresAt
        ? data.expiresAt instanceof Date
          ? data.expiresAt
          : new Date(data.expiresAt)
        : null,
      features: data.features,
      status: "ACTIVE",
    },
  });

  logger.info("License", `License created: ${licenseKey} for ${data.issuedTo}`);

  return mapLicense(license);
}

export async function validateLicense(licenseKey: string, context?: { ip?: string; domain?: string; userAgent?: string }): Promise<ValidationResult> {
  const trimmed = (licenseKey || "").trim();
  if (!trimmed) {
    return { valid: false, error: "Chave de licença não fornecida" };
  }

  try {
    let license = null;
    const isSigned = isSignedLicenseKey(trimmed);
    let signedClaims = null;

    if (prisma && "license" in prisma && typeof (prisma as any).license?.findUnique === "function") {
      try {
        license = await prisma.license.findUnique({
          where: { licenseKey: trimmed },
          include: {
            validations: { take: 10, orderBy: { createdAt: "desc" } },
          },
        });

        if (isSigned) {
          signedClaims = decodeLicensePayload(trimmed);
          if (!license && signedClaims?.jti) {
            license = await prisma.license.findFirst({
              where: { OR: [{ id: signedClaims.jti }, { licenseKey: signedClaims.jti }] },
              include: {
                validations: { take: 10, orderBy: { createdAt: "desc" } },
              },
            });
          }
        }
      } catch (dbErr) {
        logger.warn("License", `Consulta ao banco falhou: ${(dbErr as Error).message}`);
      }
    }

    // Se encontramos a licença no banco de dados da plataforma, o status cadastrado tem prioridade
    if (license) {
      // Check status
      if (license.status === "REVOKED") {
        await recordValidation(license.id, trimmed, context, false, "License revoked");
        return { valid: false, error: `Licença revogada: ${license.revokedReason || "Motivo não informado"}` };
      }

      if (license.status === "SUSPENDED") {
        await recordValidation(license.id, trimmed, context, false, "License suspended");
        return { valid: false, error: "Licença suspensa por pendência comercial" };
      }

      // Check expiry
      const now = new Date();
      if (license.expiresAt && license.expiresAt < now) {
        const gracePeriodEnd = new Date(license.expiresAt.getTime() + GRACE_PERIOD_HOURS * 60 * 60 * 1000);
        if (now > gracePeriodEnd) {
          await prisma.license.update({
            where: { id: license.id },
            data: { status: "EXPIRED" },
          });
          await recordValidation(license.id, trimmed, context, false, "License expired");
          return { valid: false, error: "Licença expirada" };
        }
        // In grace period
        await recordValidation(license.id, trimmed, context, true, "Grace period");
        await updateValidationStats(license.id);
        return { valid: true, license: mapLicense(license), gracePeriod: true };
      }

      // Valid license in DB
      await recordValidation(license.id, trimmed, context, true, null);
      await updateValidationStats(license.id);

      return { valid: true, license: mapLicense(license) };
    }

    // Se NÃO está no banco, mas é uma chave assinada criptograficamente (WOHUB1.*)
    if (isSigned) {
      const pubKey = getDefaultPublicKey();
      if (pubKey) {
        const verify = verifyLicenseToken(trimmed, { publicKey: pubKey });
        if (verify.ok) {
          const claims = verify.claims;
          const mapped: LicenseData = {
            id: claims.jti,
            licenseKey: trimmed,
            status: claims.status || "ACTIVE",
            type: claims.type || "STANDARD",
            issuedTo: claims.sub,
            issuedToEmail: claims.email || "",
            maxInstances: claims.maxInstances ?? 1,
            maxTenants: claims.maxTenants ?? 1,
            maxUsers: claims.maxUsers ?? 5,
            maxResellers: claims.maxResellers ?? 0,
            features: claims.features || null,
            expiresAt: claims.exp ? new Date(claims.exp * 1000) : null,
            lastValidatedAt: new Date(),
            validationCount: 1,
          };
          await recordValidation(null, trimmed, context, true, null);
          return { valid: true, license: mapped, gracePeriod: verify.gracePeriod };
        } else {
          await recordValidation(null, trimmed, context, false, verify.error);
          return { valid: false, error: verify.error };
        }
      }
    }

    await recordValidation(null, trimmed, context, false, "License not found");
    return { valid: false, error: "Licença não encontrada no sistema" };
  } catch (error) {
    logger.error("License", "Validation error", error);
    return { valid: false, error: "Erro interno na validação" };
  }
}

async function recordValidation(
  licenseId: string | null,
  licenseKey: string,
  context: { ip?: string; domain?: string; userAgent?: string } | undefined,
  success: boolean,
  error?: string | null
) {
  try {
    if (licenseId && prisma && "licenseValidation" in prisma && typeof (prisma as any).licenseValidation?.create === "function") {
      await prisma.licenseValidation.create({
        data: {
          licenseId,
          ip: context?.ip,
          domain: context?.domain,
          userAgent: context?.userAgent,
          success,
          error: error || undefined,
        },
      });
    }
  } catch (e) {
    logger.warn("License", `Falha ao registrar validacao: ${(e as Error).message}`);
  }
}

async function updateValidationStats(licenseId: string) {
  try {
    if (prisma && "license" in prisma && typeof (prisma as any).license?.update === "function") {
      await prisma.license.update({
        where: { id: licenseId },
        data: {
          validationCount: { increment: 1 },
          lastValidatedAt: new Date(),
        },
      });
    }
  } catch (e) {
    logger.warn("License", `Falha ao atualizar estatisticas: ${(e as Error).message}`);
  }
}

function mapLicense(license: LicenseRow): LicenseData {
  return {
    id: license.id,
    licenseKey: license.licenseKey,
    status: license.status,
    type: license.type,
    issuedTo: license.issuedTo,
    issuedToEmail: license.issuedToEmail,
    maxInstances: license.maxInstances,
    maxTenants: license.maxTenants,
    maxUsers: license.maxUsers,
    maxResellers: license.maxResellers,
    features: license.features as string[] | null,
    expiresAt: license.expiresAt,
    lastValidatedAt: license.lastValidatedAt,
    validationCount: license.validationCount,
  };
}

export async function getLicense(licenseKey: string): Promise<LicenseData | null> {
  const license = await prisma.license.findUnique({ where: { licenseKey } });
  return license ? mapLicense(license) : null;
}

export async function updateLicense(licenseKey: string, data: Partial<LicenseData>): Promise<LicenseData | null> {
  const license = await prisma.license.update({
    where: { licenseKey },
    data: {
      ...data,
      status: data.status as LicenseStatus | undefined,
      type: data.type as LicenseType | undefined,
      features: data.features ? JSON.parse(JSON.stringify(data.features)) : undefined,
    },
  });
  return mapLicense(license);
}

export async function revokeLicense(licenseKey: string, reason: string): Promise<void> {
  await prisma.license.update({
    where: { licenseKey },
    data: { status: "REVOKED", revokedAt: new Date(), revokedReason: reason },
  });
  logger.warn("License", `License revoked: ${licenseKey} - ${reason}`);
}

export async function suspendLicense(licenseKey: string): Promise<void> {
  await prisma.license.update({
    where: { licenseKey },
    data: { status: "SUSPENDED" },
  });
  logger.warn("License", `License suspended: ${licenseKey}`);
}

export async function activateLicense(licenseKey: string): Promise<void> {
  await prisma.license.update({
    where: { licenseKey },
    data: { status: "ACTIVE" },
  });
  logger.info("License", `License activated: ${licenseKey}`);
}

export async function listLicenses(filters?: { status?: string; type?: string }): Promise<LicenseData[]> {
  const licenses = await prisma.license.findMany({
    where: {
      status: filters?.status as LicenseStatus | undefined,
      type: filters?.type as LicenseType | undefined,
    },
    orderBy: { createdAt: "desc" },
  });
  return licenses.map(mapLicense);
}

export async function getLicenseStats() {
  const [total, active, expired, trial, byType] = await Promise.all([
    prisma.license.count(),
    prisma.license.count({ where: { status: "ACTIVE" } }),
    prisma.license.count({ where: { status: "EXPIRED" } }),
    prisma.license.count({ where: { type: "TRIAL" } }),
    prisma.license.groupBy({
      by: ["type"],
      _count: true,
    }),
  ]);

  return {
    total,
    active,
    expired,
    trial,
    byType: byType.reduce((acc, item) => ({ ...acc, [item.type]: item._count }), {}),
  };
}

export function formatLicenseKey(key: string): string {
  // Format: WOHUB-XXXX-XXXX-XXXX-XXXX
  return key.replace(/(.{5})/g, "$1-").replace(/-$/, "");
}

export function parseLicenseKey(key: string): { prefix: string; segments: string[] } | null {
  const parts = key.split("-");
  if (parts.length !== 5 || parts[0] !== "WOHUB") return null;
  return { prefix: parts[0], segments: parts.slice(1) };
}