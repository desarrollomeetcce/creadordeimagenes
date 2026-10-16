CREATE TABLE "ProviderBillingCredential" (
    "provider" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "maskedKey" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProviderBillingCredential_pkey" PRIMARY KEY ("provider")
);
