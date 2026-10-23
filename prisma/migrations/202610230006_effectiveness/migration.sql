CREATE TABLE "MetaEffectivenessRow" (
 "id" TEXT PRIMARY KEY, "aliasId" TEXT NOT NULL REFERENCES "MetaAlias"("id") ON DELETE RESTRICT,
 "country" TEXT NOT NULL CHECK ("country" ~ '^[A-Z]{2}$'),
 "currency" TEXT NOT NULL CHECK ("currency" ~ '^[A-Z]{3}$'),
 UNIQUE ("aliasId","country","currency")
);
CREATE TABLE "MetaEffectivenessDay" (
 "rowId" TEXT NOT NULL REFERENCES "MetaEffectivenessRow"("id") ON DELETE CASCADE,
 "day" TEXT NOT NULL CHECK ("day" ~ '^\d{4}-\d{2}-\d{2}$'),
 "sales" INTEGER CHECK ("sales" >= 0),
 "fixedCost" DECIMAL(18,6) CHECK ("fixedCost" >= 0),
 "revision" INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY ("rowId","day")
);
