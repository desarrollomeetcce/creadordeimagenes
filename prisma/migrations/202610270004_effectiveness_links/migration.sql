CREATE TABLE "MetaEffectivenessLink" (
 "tableId" TEXT PRIMARY KEY REFERENCES "MetaAliasTable"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "sourceTableId" TEXT NOT NULL REFERENCES "MetaAliasTable"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 columns JSONB NOT NULL,
 since TEXT,
 until TEXT,
 revision INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "MetaEffectivenessLink_different_tables" CHECK ("tableId" <> "sourceTableId"),
 CONSTRAINT "MetaEffectivenessLink_dates" CHECK ((since IS NULL AND until IS NULL) OR (since IS NOT NULL AND until IS NOT NULL AND since <= until))
);
CREATE INDEX "MetaEffectivenessLink_sourceTableId_idx" ON "MetaEffectivenessLink"("sourceTableId");
