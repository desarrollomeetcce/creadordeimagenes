CREATE TABLE "FixedCostSheetGrant" (
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "sheetId" TEXT NOT NULL REFERENCES "FixedCostSheet"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "sheetId")
);
CREATE INDEX "FixedCostSheetGrant_sheetId_idx" ON "FixedCostSheetGrant"("sheetId");
