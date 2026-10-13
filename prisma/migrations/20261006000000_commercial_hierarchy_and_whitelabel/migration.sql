-- CreateEnum
CREATE TYPE "ResellerStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "DomainType" AS ENUM ('PLATFORM', 'RESELLER');

-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE', 'FAILED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CertStatus" AS ENUM ('PENDING', 'ISSUED', 'FAILED', 'EXTERNAL');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "resellerId" TEXT;

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "resellerId" TEXT;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "resellerId" TEXT,
ALTER COLUMN "tenantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "features" JSONB,
ADD COLUMN     "maxInstances" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "resellerId" TEXT;

-- CreateTable
CREATE TABLE "PlatformConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "platformName" TEXT NOT NULL DEFAULT 'Woohub',
    "primaryDomain" TEXT DEFAULT 'woohub.local',
    "supportEmail" TEXT DEFAULT 'suporte@woohub.local',
    "enableRegistration" BOOLEAN NOT NULL DEFAULT true,
    "defaultFeatures" JSONB,
    "maxResellers" INTEGER DEFAULT 100,
    "globalWebhookSecret" TEXT,
    "gatewayConfig" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reseller" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "ResellerStatus" NOT NULL DEFAULT 'ACTIVE',
    "maxInstances" INTEGER NOT NULL DEFAULT 10,
    "maxTenants" INTEGER NOT NULL DEFAULT 20,
    "maxUsers" INTEGER NOT NULL DEFAULT 50,
    "features" JSONB,
    "storageLimitMb" INTEGER NOT NULL DEFAULT 1024,
    "retentionDays" INTEGER NOT NULL DEFAULT 30,
    "customDomainAllowed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reseller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstanceAllocation" (
    "id" TEXT NOT NULL,
    "resellerId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "allocated" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstanceAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "type" "DomainType" NOT NULL DEFAULT 'RESELLER',
    "resellerId" TEXT,
    "status" "DomainStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verificationToken" TEXT NOT NULL,
    "verificationMethod" TEXT NOT NULL DEFAULT 'DNS_TXT',
    "certificateStatus" "CertStatus" NOT NULL DEFAULT 'PENDING',
    "validatedAt" TIMESTAMP(3),
    "dnsInstructions" JSONB,
    "history" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branding" (
    "id" TEXT NOT NULL,
    "resellerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#ff5a00',
    "secondaryColor" TEXT NOT NULL DEFAULT '#0f172a',
    "accentColor" TEXT NOT NULL DEFAULT '#f97316',
    "supportEmail" TEXT,
    "supportPhone" TEXT,
    "commercialLinks" JSONB,
    "docBrandName" TEXT,
    "customCss" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reseller_slug_key" ON "Reseller"("slug");

-- CreateIndex
CREATE INDEX "Reseller_status_idx" ON "Reseller"("status");

-- CreateIndex
CREATE INDEX "Reseller_ownerId_idx" ON "Reseller"("ownerId");

-- CreateIndex
CREATE INDEX "InstanceAllocation_resellerId_idx" ON "InstanceAllocation"("resellerId");

-- CreateIndex
CREATE INDEX "InstanceAllocation_tenantId_idx" ON "InstanceAllocation"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "InstanceAllocation_resellerId_tenantId_key" ON "InstanceAllocation"("resellerId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Domain_hostname_key" ON "Domain"("hostname");

-- CreateIndex
CREATE INDEX "Domain_status_idx" ON "Domain"("status");

-- CreateIndex
CREATE INDEX "Domain_resellerId_idx" ON "Domain"("resellerId");

-- CreateIndex
CREATE UNIQUE INDEX "Branding_resellerId_key" ON "Branding"("resellerId");

-- CreateIndex
CREATE INDEX "AuditLog_resellerId_createdAt_idx" ON "AuditLog"("resellerId", "createdAt");

-- CreateIndex
CREATE INDEX "Plan_resellerId_idx" ON "Plan"("resellerId");

-- CreateIndex
CREATE INDEX "Subscription_resellerId_idx" ON "Subscription"("resellerId");

-- CreateIndex
CREATE INDEX "Tenant_resellerId_idx" ON "Tenant"("resellerId");

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reseller" ADD CONSTRAINT "Reseller_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstanceAllocation" ADD CONSTRAINT "InstanceAllocation_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstanceAllocation" ADD CONSTRAINT "InstanceAllocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branding" ADD CONSTRAINT "Branding_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
