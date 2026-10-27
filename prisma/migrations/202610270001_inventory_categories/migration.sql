ALTER TABLE "MetaEffectivenessSheet" ADD COLUMN "categoryRevision" integer NOT NULL DEFAULT 0;
CREATE TABLE "MetaInventoryCategory" (
 id text PRIMARY KEY, "sheetId" text NOT NULL REFERENCES "MetaEffectivenessSheet"(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('PRIMARY','SECONDARY')), name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80), key text NOT NULL,
 UNIQUE ("sheetId",kind,key)
);
CREATE TABLE "MetaInventoryCategoryRelation" (
 "primaryId" text NOT NULL REFERENCES "MetaInventoryCategory"(id) ON DELETE CASCADE,
 "secondaryId" text NOT NULL REFERENCES "MetaInventoryCategory"(id) ON DELETE CASCADE,
 PRIMARY KEY ("primaryId","secondaryId")
);
CREATE INDEX "MetaInventoryCategoryRelation_secondaryId_idx" ON "MetaInventoryCategoryRelation"("secondaryId");
CREATE TABLE "MetaInventoryCategoryAssignment" (
 "aliasId" text NOT NULL REFERENCES "MetaAlias"(id) ON DELETE CASCADE,
 "categoryId" text NOT NULL REFERENCES "MetaInventoryCategory"(id) ON DELETE CASCADE,
 PRIMARY KEY ("aliasId","categoryId")
);
CREATE INDEX "MetaInventoryCategoryAssignment_categoryId_idx" ON "MetaInventoryCategoryAssignment"("categoryId");
