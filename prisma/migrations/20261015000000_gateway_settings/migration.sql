-- Gateway de pagamento configuravel pelo painel (fallback: variaveis de ambiente).
-- Colunas anulaveis de proposito: NULL = "nunca configurado pelo painel" e o
-- sistema usa as variaveis de ambiente; preenchido = o painel tem precedencia.
-- paymentGatewaySecretKey e paymentWebhookSecret guardam envelopes AES-256-GCM,
-- nunca texto puro.
ALTER TABLE "SystemConfig" ADD COLUMN "paymentGateway" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN "paymentGatewayPublicKey" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN "paymentGatewaySecretKey" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN "paymentGatewayBaseUrl" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN "paymentWebhookSecret" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN "paymentGatewaySandbox" BOOLEAN;
