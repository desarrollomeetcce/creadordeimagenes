ALTER TABLE "Project" ADD COLUMN "allAdministrators" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Subproduct" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE TABLE "CategoryMember" (
 "categoryId" TEXT NOT NULL REFERENCES "Category"(id) ON DELETE CASCADE,
 "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
 PRIMARY KEY ("categoryId", "userId")
);
CREATE INDEX "CategoryMember_userId_idx" ON "CategoryMember"("userId");
CREATE TABLE "SubproductMember" (
 "subproductId" TEXT NOT NULL REFERENCES "Subproduct"(id) ON DELETE CASCADE,
 "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
 PRIMARY KEY ("subproductId", "userId")
);
CREATE INDEX "SubproductMember_userId_idx" ON "SubproductMember"("userId");
CREATE INDEX "Subproduct_categoryId_deletedAt_idx" ON "Subproduct"("categoryId", "deletedAt");
