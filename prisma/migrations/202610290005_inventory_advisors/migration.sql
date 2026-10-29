ALTER TABLE "MetaInventoryItem" ADD COLUMN "advisorRevision" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "MetaInventoryAdvisor" (
 "itemId" TEXT NOT NULL REFERENCES "MetaInventoryItem"("id") ON DELETE CASCADE,
 "advisorId" TEXT NOT NULL REFERENCES "MetaAdvisor"("id") ON DELETE RESTRICT,
 PRIMARY KEY ("itemId","advisorId")
);
CREATE INDEX "MetaInventoryAdvisor_advisorId_idx" ON "MetaInventoryAdvisor"("advisorId");
