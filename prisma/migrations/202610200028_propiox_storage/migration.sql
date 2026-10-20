CREATE TABLE "GenerationEngineConfiguration" (
 "id" TEXT NOT NULL DEFAULT 'global', "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
 "propioxEnabled" BOOLEAN NOT NULL DEFAULT false, "defaultEngine" TEXT NOT NULL DEFAULT 'ai',
 "quality" TEXT NOT NULL DEFAULT 'high', "resolution" TEXT NOT NULL DEFAULT '1024x1024',
 "revision" INTEGER NOT NULL DEFAULT 1, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "GenerationEngineConfiguration_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "LibraryDocument" ADD COLUMN "text" TEXT NOT NULL DEFAULT '', ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'Referencia visual', ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
CREATE TABLE "StorageBinding" (
 "id" TEXT NOT NULL, "scope" TEXT NOT NULL, "resourceId" TEXT NOT NULL, "userId" TEXT NOT NULL,
 "folderId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "StorageBinding_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "StorageBinding_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "LibraryFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StorageBinding_scope_resourceId_folderId_key" ON "StorageBinding"("scope","resourceId","folderId");
CREATE INDEX "StorageBinding_scope_resourceId_idx" ON "StorageBinding"("scope","resourceId");
