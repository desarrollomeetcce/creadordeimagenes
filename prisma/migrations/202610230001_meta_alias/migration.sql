CREATE TABLE "MetaAlias" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL UNIQUE);
ALTER TABLE "MetaAdObject" ADD COLUMN "aliasId" TEXT REFERENCES "MetaAlias"("id") ON DELETE SET NULL;
CREATE INDEX "MetaAdObject_aliasId_idx" ON "MetaAdObject"("aliasId");
