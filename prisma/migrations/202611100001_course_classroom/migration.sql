CREATE TABLE "AICourseRender" (
 "id" TEXT PRIMARY KEY,"moduleId" TEXT NOT NULL REFERENCES "AICourseModule"(id) ON DELETE CASCADE,
 "actorId" TEXT NOT NULL,"requestId" TEXT NOT NULL UNIQUE,revision INTEGER NOT NULL,resolution TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING',progress INTEGER NOT NULL DEFAULT 0,error TEXT,"assetId" TEXT,"leaseToken" TEXT,"heartbeatAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "AICourseRender_status_createdAt_idx" ON "AICourseRender"(status,"createdAt");
CREATE INDEX "AICourseRender_moduleId_revision_idx" ON "AICourseRender"("moduleId",revision);
CREATE TABLE "AICourseVimeoConnection" (
 generation TEXT NOT NULL, id TEXT PRIMARY KEY DEFAULT 'global',"encryptedToken" TEXT NOT NULL,"maskedToken" TEXT NOT NULL,"accountUri" TEXT NOT NULL,"accountName" TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,"verifiedAt" TIMESTAMP(3) NOT NULL,"updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "AICourseVimeoUpload" (
 "credentialGeneration" TEXT NOT NULL, id TEXT PRIMARY KEY,"renderId" TEXT NOT NULL REFERENCES "AICourseRender"(id) ON DELETE CASCADE,"actorId" TEXT NOT NULL,"requestId" TEXT NOT NULL UNIQUE,
 "credentialRevision" INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',"remoteUri" TEXT,"uploadURL" TEXT,"uploadedBytes" INTEGER NOT NULL DEFAULT 0,"totalBytes" INTEGER NOT NULL DEFAULT 0,error TEXT,"leaseToken" TEXT,"heartbeatAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "AICourseVimeoUpload_status_createdAt_idx" ON "AICourseVimeoUpload"(status,"createdAt");
