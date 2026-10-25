-- Alias identity remains immutable; identical names can now exist in different tables.
ALTER TABLE "MetaAlias" DROP CONSTRAINT "MetaAlias_name_key";
CREATE UNIQUE INDEX "MetaAlias_tableId_name_key" ON "MetaAlias"("tableId",name);
CREATE TABLE "MetaEffectivenessSync" (
 "tableId" TEXT PRIMARY KEY REFERENCES "MetaAliasTable"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "sourceTableId" TEXT NOT NULL REFERENCES "MetaAliasTable"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 columns JSONB NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,
 "lastSyncAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
