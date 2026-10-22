CREATE TABLE "PrivacyRequest" (
  "id" TEXT PRIMARY KEY,
  "receiptHash" TEXT NOT NULL UNIQUE,
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT '',
  "email" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reply" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PrivacyRequest_status_createdAt_idx" ON "PrivacyRequest"("status", "createdAt");
