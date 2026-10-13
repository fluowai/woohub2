CREATE TYPE "CommercialMode" AS ENUM ('DIRECT', 'RESELLER', 'WHITE_LABEL');

ALTER TABLE "Tenant" ADD COLUMN "commercialMode" "CommercialMode" NOT NULL DEFAULT 'DIRECT';
ALTER TABLE "Plan" ADD COLUMN "commercialMode" "CommercialMode" NOT NULL DEFAULT 'DIRECT';
ALTER TABLE "Plan" ADD COLUMN "maxInstallations" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Plan" ADD COLUMN "trialDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Plan" ADD COLUMN "gracePeriodDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Subscription" ADD COLUMN "commercialMode" "CommercialMode" NOT NULL DEFAULT 'DIRECT';
ALTER TABLE "Subscription" ADD COLUMN "contractedMaxInstances" INTEGER;
ALTER TABLE "Subscription" ADD COLUMN "contractedMaxUsers" INTEGER;
ALTER TABLE "Subscription" ADD COLUMN "contractedMaxInstallations" INTEGER;
ALTER TABLE "Subscription" ADD COLUMN "termsVersion" TEXT;
ALTER TABLE "Reseller" ADD COLUMN "commercialMode" "CommercialMode" NOT NULL DEFAULT 'RESELLER';
ALTER TABLE "License" ADD COLUMN "commercialMode" "CommercialMode" NOT NULL DEFAULT 'WHITE_LABEL';
ALTER TABLE "License" ADD COLUMN "resellerId" TEXT;

CREATE INDEX "License_resellerId_status_idx" ON "License"("resellerId", "status");
ALTER TABLE "License" ADD CONSTRAINT "License_resellerId_fkey"
  FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Installation" ADD COLUMN "installationKeyHash" TEXT;
ALTER TABLE "Installation" ADD COLUMN "activationNonce" TEXT;
ALTER TABLE "Installation" ADD COLUMN "protocolVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Installation" ADD COLUMN "licenseRevision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Installation" ADD COLUMN "reportedInstances" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Installation" ADD COLUMN "reportedConnected" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Installation" ADD COLUMN "reportedState" TEXT;
ALTER TABLE "Installation" ADD COLUMN "reportedVersion" TEXT;
ALTER TABLE "Installation" ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3);
ALTER TABLE "Installation" ADD COLUMN "transferRequestedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Installation_installationKeyHash_key" ON "Installation"("installationKeyHash");
CREATE INDEX "Installation_lastContactAt_idx" ON "Installation"("lastContactAt");
