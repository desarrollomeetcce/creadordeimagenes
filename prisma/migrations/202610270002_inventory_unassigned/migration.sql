CREATE TABLE "MetaInventoryItem" (
 id text PRIMARY KEY,
 "sheetId" text NOT NULL REFERENCES "MetaEffectivenessSheet"(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 150),
 UNIQUE ("sheetId",name)
);
CREATE TABLE "MetaInventoryItemCategory" (
 "itemId" text NOT NULL REFERENCES "MetaInventoryItem"(id) ON DELETE CASCADE,
 "categoryId" text NOT NULL REFERENCES "MetaInventoryCategory"(id) ON DELETE CASCADE,
 PRIMARY KEY ("itemId","categoryId")
);
CREATE INDEX "MetaInventoryItemCategory_categoryId_idx" ON "MetaInventoryItemCategory"("categoryId");
