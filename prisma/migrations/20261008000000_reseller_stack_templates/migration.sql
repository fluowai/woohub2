CREATE TYPE "StackTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "InstallationStatus" AS ENUM ('DRAFT', 'RESERVED', 'PREPARED', 'ACTIVATING', 'ACTIVE', 'DEGRADED', 'OFFLINE', 'LICENSE_RESTRICTED', 'RETIRED');
CREATE TYPE "InstallationMode" AS ENUM ('COMPOSE', 'SWARM');
CREATE TYPE "LicenseType" AS ENUM ('TRIAL', 'STANDARD', 'PROFESSIONAL', 'ENTERPRISE', 'RESELLER');

CREATE TABLE "StackTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "status" "StackTemplateStatus" NOT NULL DEFAULT 'DRAFT',
  "edition" TEXT NOT NULL DEFAULT 'RESELLER',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StackTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StackTemplate_slug_key" ON "StackTemplate"("slug");
CREATE INDEX "StackTemplate_status_idx" ON "StackTemplate"("status");

CREATE TABLE "StackTemplateVersion" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "composeYaml" TEXT NOT NULL,
  "parametersSchema" JSONB NOT NULL,
  "requirements" JSONB,
  "images" JSONB,
  "healthchecks" JSONB,
  "migrationNotes" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StackTemplateVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StackTemplateVersion_templateId_version_key" ON "StackTemplateVersion"("templateId", "version");
CREATE INDEX "StackTemplateVersion_templateId_publishedAt_idx" ON "StackTemplateVersion"("templateId", "publishedAt");

CREATE TABLE "TemplateEntitlement" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "licenseType" "LicenseType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TemplateEntitlement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TemplateEntitlement_templateId_licenseType_key" ON "TemplateEntitlement"("templateId", "licenseType");

CREATE TABLE "Installation" (
  "id" TEXT NOT NULL,
  "resellerId" TEXT NOT NULL,
  "licenseId" TEXT NOT NULL,
  "templateVersionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "domain" TEXT,
  "mode" "InstallationMode" NOT NULL,
  "status" "InstallationStatus" NOT NULL DEFAULT 'DRAFT',
  "capacity" INTEGER NOT NULL DEFAULT 1,
  "bootstrapHash" TEXT,
  "bootstrapExpiresAt" TIMESTAMP(3),
  "activatedAt" TIMESTAMP(3),
  "lastContactAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Installation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Installation_bootstrapHash_key" ON "Installation"("bootstrapHash");
CREATE INDEX "Installation_resellerId_status_idx" ON "Installation"("resellerId", "status");
CREATE INDEX "Installation_licenseId_idx" ON "Installation"("licenseId");

ALTER TABLE "StackTemplate" ADD CONSTRAINT "StackTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StackTemplateVersion" ADD CONSTRAINT "StackTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "StackTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TemplateEntitlement" ADD CONSTRAINT "TemplateEntitlement_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "StackTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "StackTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
