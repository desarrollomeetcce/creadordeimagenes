ALTER TABLE "User" ADD COLUMN "aiAccessEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "User_archivedAt_idx" ON "User"("archivedAt");
