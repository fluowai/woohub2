-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'SUSPENDED', 'REVOKED', 'PENDING');

-- CreateTable (base columns; "type" is added by 20261008100000, "commercialMode"/"resellerId" by 20261008010000)
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "licenseKey" TEXT NOT NULL,
    "status" "LicenseStatus" NOT NULL DEFAULT 'PENDING',
    "issuedTo" TEXT NOT NULL,
    "issuedToEmail" TEXT NOT NULL,
    "maxInstances" INTEGER NOT NULL DEFAULT 1,
    "maxTenants" INTEGER NOT NULL DEFAULT 1,
    "maxUsers" INTEGER NOT NULL DEFAULT 5,
    "maxResellers" INTEGER NOT NULL DEFAULT 0,
    "features" JSONB,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "lastValidatedAt" TIMESTAMP(3),
    "validationCount" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenseValidation" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "ip" TEXT,
    "domain" TEXT,
    "userAgent" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicenseValidation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "License_licenseKey_key" ON "License"("licenseKey");

-- CreateIndex
CREATE INDEX "License_status_idx" ON "License"("status");

-- CreateIndex
CREATE INDEX "License_issuedToEmail_idx" ON "License"("issuedToEmail");

-- CreateIndex
CREATE INDEX "License_expiresAt_idx" ON "License"("expiresAt");

-- CreateIndex
CREATE INDEX "LicenseValidation_licenseId_idx" ON "LicenseValidation"("licenseId");

-- CreateIndex
CREATE INDEX "LicenseValidation_createdAt_idx" ON "LicenseValidation"("createdAt");

-- AddForeignKey
ALTER TABLE "LicenseValidation" ADD CONSTRAINT "LicenseValidation_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE CASCADE ON UPDATE CASCADE;
