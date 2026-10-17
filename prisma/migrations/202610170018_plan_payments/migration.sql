CREATE TABLE "PaymentConnection" (
 provider TEXT PRIMARY KEY,
 "encryptedCredentials" TEXT NOT NULL,
 "maskedCredentials" JSONB NOT NULL,
 "merchantId" TEXT NOT NULL,
 mode TEXT NOT NULL DEFAULT 'SANDBOX',
 currency TEXT NOT NULL DEFAULT 'USD',
 "exchangeRateMicros" BIGINT NOT NULL DEFAULT 1000000,
 enabled BOOLEAN NOT NULL DEFAULT FALSE,
 revision INTEGER NOT NULL DEFAULT 1,
 "verifiedRevision" INTEGER,
 "verifiedAt" TIMESTAMP(3),
 error TEXT,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "PlanPurchase" (
 id TEXT PRIMARY KEY,
 "userId" TEXT NOT NULL REFERENCES "User"(id),
 "planId" TEXT NOT NULL REFERENCES "MembershipPlan"(id),
 "planName" TEXT NOT NULL,
 provider TEXT NOT NULL,
 "connectionRevision" INTEGER NOT NULL,
 mode TEXT NOT NULL,
 "amountCents" INTEGER NOT NULL CHECK ("amountCents">0),
 currency TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'CREATING',
 "externalId" TEXT UNIQUE,
 "externalPaymentId" TEXT UNIQUE,
 "requestId" TEXT NOT NULL UNIQUE,
 "checkoutUrl" TEXT,
 error TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "paidAt" TIMESTAMP(3)
);
CREATE INDEX "PlanPurchase_userId_createdAt_idx" ON "PlanPurchase"("userId","createdAt");
