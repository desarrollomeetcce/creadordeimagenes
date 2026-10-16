CREATE TABLE "VisualAuditPolicy" (
  "id" TEXT PRIMARY KEY DEFAULT 'global',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "retentionDays" INTEGER NOT NULL DEFAULT 30 CHECK ("retentionDays" BETWEEN 1 AND 3650),
  "limitMb" INTEGER NOT NULL DEFAULT 32 CHECK ("limitMb" BETWEEN 1 AND 256),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "VisualAuditPolicy" ("id") VALUES ('global');
CREATE TABLE "AuditThumbnail" (
  "id" TEXT PRIMARY KEY,
  "versionId" TEXT NOT NULL UNIQUE,
  "variationId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "actorId" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "projectName" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "subproductName" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "data" BYTEA,
  "size" INTEGER NOT NULL CHECK ("size" BETWEEN 0 AND 65536),
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "removedAt" TIMESTAMP(3)
);
CREATE INDEX "AuditThumbnail_createdAt_id_idx" ON "AuditThumbnail"("createdAt","id");
CREATE INDEX "AuditThumbnail_expiresAt_status_idx" ON "AuditThumbnail"("expiresAt","status");
