ALTER TABLE "ProviderConfiguration" ADD COLUMN "creativeProvider" TEXT;
CREATE TABLE "ProviderConnection" (
    "provider" TEXT NOT NULL,
    "encryptedKey" TEXT,
    "maskedKey" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "verifiedRevision" INTEGER,
    "verifiedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "error" TEXT,
    "models" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProviderConnection_pkey" PRIMARY KEY ("provider")
);
INSERT INTO "ProviderConnection" ("provider","encryptedKey","maskedKey","revision","verifiedRevision","verifiedAt","status","error","models","updatedAt")
SELECT "provider","encryptedKey","maskedKey","revision","verifiedRevision","verifiedAt","status","error","models","updatedAt"
FROM "ProviderConfiguration" WHERE id = 'global' AND "encryptedKey" IS NOT NULL;
