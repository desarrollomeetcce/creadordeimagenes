CREATE TABLE "MetaEffectivenessTotalDay" (
 "tableId" TEXT NOT NULL REFERENCES "MetaAliasTable"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 country TEXT NOT NULL,
 currency TEXT NOT NULL,
 day TEXT NOT NULL,
 values JSONB NOT NULL DEFAULT '{}',
 revision INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY ("tableId",country,currency,day)
);
