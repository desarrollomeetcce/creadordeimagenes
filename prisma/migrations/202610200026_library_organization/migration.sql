ALTER TABLE "LibraryItem" ADD COLUMN "destinationKey" TEXT, ADD COLUMN "broughtAt" TIMESTAMP(3);
ALTER TABLE "LibraryDocument" ADD COLUMN "destinationKey" TEXT, ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE TABLE "LibraryNodeState" (
  "userId" TEXT NOT NULL, "nodeKey" TEXT NOT NULL, "parentKey" TEXT,
  "hidden" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "LibraryNodeState_pkey" PRIMARY KEY ("userId", "nodeKey")
);
CREATE TABLE "LibraryImageCopy" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "variationId" TEXT NOT NULL,
  "destinationKey" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "LibraryImageCopy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LibraryImageCopy_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "Variation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "LibraryImageCopy_userId_destinationKey_createdAt_idx" ON "LibraryImageCopy"("userId", "destinationKey", "createdAt");
CREATE INDEX "LibraryImageCopy_variationId_idx" ON "LibraryImageCopy"("variationId");
