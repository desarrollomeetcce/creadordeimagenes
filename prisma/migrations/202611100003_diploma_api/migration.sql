CREATE TABLE "DiplomaApiKey" (
 id TEXT PRIMARY KEY,"ownerId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
 name TEXT NOT NULL,"tokenHash" TEXT NOT NULL UNIQUE,mask TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3),"revokedAt" TIMESTAMP(3),"lastUsedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "DiplomaApiKey_ownerId_createdAt_idx" ON "DiplomaApiKey"("ownerId","createdAt");
CREATE TABLE "DiplomaApiKeyList" (
 "keyId" TEXT NOT NULL REFERENCES "DiplomaApiKey"(id) ON DELETE CASCADE,
 "listId" TEXT NOT NULL REFERENCES "MetaEffectivenessSheet"(id) ON DELETE CASCADE,
 PRIMARY KEY ("keyId","listId")
);
CREATE INDEX "DiplomaApiKeyList_listId_idx" ON "DiplomaApiKeyList"("listId");
