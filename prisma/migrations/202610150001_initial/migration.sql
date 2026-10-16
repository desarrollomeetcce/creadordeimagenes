CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'USER');

CREATE TYPE "AccountStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'USER',
  "status" "AccountStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "Project" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "seedKey" TEXT UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "prompt" TEXT NOT NULL DEFAULT '',
  "ownerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3)
);

CREATE TABLE "ProjectMember" (
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "permission" TEXT NOT NULL DEFAULT 'VIEW',
  PRIMARY KEY ("projectId","userId")
);

CREATE TABLE "Category" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "prompt" TEXT NOT NULL DEFAULT '',
  "projectId" TEXT NOT NULL,
  "settings" JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE "Subproduct" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "prompt" TEXT NOT NULL DEFAULT '',
  "categoryId" TEXT NOT NULL,
  "settings" JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE "PromptVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scope" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Attachment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scope" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "text" TEXT NOT NULL DEFAULT '',
  "size" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ProviderConfiguration" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
  "provider" TEXT NOT NULL DEFAULT 'openai',
  "encryptedKey" TEXT,
  "maskedKey" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "verifiedRevision" INTEGER,
  "verifiedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
  "error" TEXT,
  "models" JSONB NOT NULL DEFAULT '[]',
  "imageModel" TEXT,
  "creativeModel" TEXT,
  "alternatives" JSONB NOT NULL DEFAULT '[]',
  "quality" TEXT NOT NULL DEFAULT 'low',
  "resolution" TEXT NOT NULL DEFAULT '1024x1024',
  "monthlyLimitMicros" BIGINT NOT NULL DEFAULT 0,
  "dailyLimitMicros" BIGINT NOT NULL DEFAULT 0,
  "operationLimitMicros" BIGINT NOT NULL DEFAULT 0,
  "imageReserveMicros" BIGINT NOT NULL DEFAULT 0,
  "maxGenerations" INTEGER NOT NULL DEFAULT 100,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "GenerationJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actorId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "subproductId" TEXT,
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "snapshot" JSONB NOT NULL,
  "reservedMicros" BIGINT NOT NULL,
  "error" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Variation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "subproductId" TEXT,
  "jobId" TEXT NOT NULL UNIQUE,
  "path" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "permanent" BOOLEAN NOT NULL DEFAULT false,
  "favorite" BOOLEAN NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "expired" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "UsageLedger" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "jobId" TEXT NOT NULL UNIQUE,
  "actorId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "reservedMicros" BIGINT NOT NULL,
  "actualMicros" BIGINT,
  "usage" JSONB,
  "status" TEXT NOT NULL DEFAULT 'RESERVED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resourceId" TEXT,
  "detail" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "RateLimit" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "count" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL
);

ALTER TABLE "Session" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Session_1_idx" ON "Session" ("expiresAt");

ALTER TABLE "Project" ADD FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectMember" ADD FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectMember" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Category" ADD FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Category_6_idx" ON "Category" ("projectId");

ALTER TABLE "Subproduct" ADD FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Subproduct_8_idx" ON "Subproduct" ("categoryId");

CREATE INDEX "PromptVersion_9_idx" ON "PromptVersion" ("resourceId","createdAt");

CREATE INDEX "Attachment_10_idx" ON "Attachment" ("scope","resourceId");

CREATE INDEX "GenerationJob_11_idx" ON "GenerationJob" ("status","createdAt");

ALTER TABLE "Variation" ADD FOREIGN KEY ("subproductId") REFERENCES "Subproduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Variation" ADD FOREIGN KEY ("jobId") REFERENCES "GenerationJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "UsageLedger_14_idx" ON "UsageLedger" ("createdAt","status");

CREATE INDEX "AuditEvent_15_idx" ON "AuditEvent" ("actorId","createdAt");
