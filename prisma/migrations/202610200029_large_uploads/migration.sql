ALTER TABLE "LibraryDocument" ADD COLUMN "previewPath" TEXT, ADD COLUMN "generationReady" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "LargeAsset" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "clientKey" TEXT NOT NULL,
 "name" TEXT NOT NULL, "mime" TEXT NOT NULL, "purpose" TEXT NOT NULL,
 "folderId" TEXT, "size" INTEGER NOT NULL CHECK ("size">0 AND "size"<=1073741824),
 "receivedBytes" INTEGER NOT NULL DEFAULT 0, "status" TEXT NOT NULL DEFAULT 'UPLOADING',
 "previewPath" TEXT, "documentId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "LargeAsset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LargeAsset_userId_clientKey_key" ON "LargeAsset"("userId","clientKey");
CREATE INDEX "LargeAsset_status_expiresAt_idx" ON "LargeAsset"("status","expiresAt");
CREATE TABLE "LargeAssetChunk" (
 "assetId" TEXT NOT NULL, "index" INTEGER NOT NULL, "size" INTEGER NOT NULL CHECK ("size">0 AND "size"<=2097152),
 "checksum" TEXT NOT NULL, "data" BYTEA NOT NULL,
 CONSTRAINT "LargeAssetChunk_pkey" PRIMARY KEY ("assetId","index"),
 CONSTRAINT "LargeAssetChunk_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "LargeAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
