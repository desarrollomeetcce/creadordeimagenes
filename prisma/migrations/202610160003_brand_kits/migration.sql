CREATE TABLE "BrandKit" (
  "projectId" TEXT PRIMARY KEY REFERENCES "Project"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "name" TEXT NOT NULL DEFAULT '',
  "prompt" TEXT NOT NULL DEFAULT '',
  "colors" JSONB NOT NULL DEFAULT '[]',
  "font" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "BrandLogo" (
  "projectId" TEXT NOT NULL REFERENCES "BrandKit"("projectId") ON UPDATE CASCADE ON DELETE CASCADE,
  "attachmentId" TEXT NOT NULL REFERENCES "Attachment"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  PRIMARY KEY ("projectId", "attachmentId")
);
CREATE TABLE "PasswordReset" (
  "tokenHash" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PasswordReset_userId_idx" ON "PasswordReset"("userId");
CREATE INDEX "PasswordReset_expiresAt_idx" ON "PasswordReset"("expiresAt");
