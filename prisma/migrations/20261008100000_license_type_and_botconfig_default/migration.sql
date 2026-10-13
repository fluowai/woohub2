-- AlterTable: schema drift never captured by a migration
ALTER TABLE "BotConfig" ALTER COLUMN "botName" SET DEFAULT 'WooHub Bot';

-- AlterTable: "LicenseType" was created by 20261008000000_reseller_stack_templates
ALTER TABLE "License" ADD COLUMN "type" "LicenseType" NOT NULL DEFAULT 'TRIAL';
