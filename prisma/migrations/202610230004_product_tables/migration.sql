CREATE TABLE "MetaAliasTable" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL UNIQUE);
INSERT INTO "MetaAliasTable" ("id", "name") VALUES ('diplomados', 'Diplomados');
ALTER TABLE "MetaAlias" ADD COLUMN "tableId" TEXT NOT NULL DEFAULT 'diplomados';
ALTER TABLE "MetaAlias" ADD CONSTRAINT "MetaAlias_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "MetaAliasTable"("id") ON DELETE RESTRICT;
CREATE INDEX "MetaAlias_tableId_idx" ON "MetaAlias"("tableId");
