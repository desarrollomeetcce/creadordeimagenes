ALTER TABLE "MetaAliasTable" ADD COLUMN "aliasColumnName" TEXT NOT NULL DEFAULT 'Alias';
ALTER TABLE "MetaAliasTable" ADD COLUMN "defaultCountry" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MetaAliasTable" ADD COLUMN "defaultCurrency" TEXT NOT NULL DEFAULT '';
UPDATE "MetaAliasTable" SET "aliasColumnName"='Diplomado' WHERE id='diplomados';
ALTER TABLE "MetaEffectivenessRow" ADD COLUMN "legacy" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MetaEffectivenessRow" ADD COLUMN "displayCurrency" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MetaEffectivenessRow" ADD COLUMN "presentationRowId" TEXT REFERENCES "MetaEffectivenessRow"(id) ON DELETE SET NULL;
CREATE INDEX "MetaEffectivenessRow_presentationRowId_idx" ON "MetaEffectivenessRow"("presentationRowId");
ALTER TABLE "MetaEffectivenessRow" DROP CONSTRAINT "MetaEffectivenessRow_currency_check";
ALTER TABLE "MetaEffectivenessRow" ADD CONSTRAINT "MetaEffectivenessRow_currency_check" CHECK (currency='' OR currency ~ '^[A-Z]{3}$');
UPDATE "MetaEffectivenessRow" SET legacy=true;
INSERT INTO "MetaEffectivenessRow" (id,"aliasId",country,currency,hidden,revision,legacy,"displayCurrency")
 SELECT 'fxsheet_'||md5("aliasId"||':'||country),"aliasId",country,'',bool_and(hidden),0,false,
 CASE WHEN count(DISTINCT currency) FILTER(WHERE NOT hidden)=1 THEN min(currency) FILTER(WHERE NOT hidden) ELSE '' END
 FROM "MetaEffectivenessRow" WHERE legacy GROUP BY "aliasId",country;
UPDATE "MetaEffectivenessRow" old SET "presentationRowId"=p.id FROM "MetaEffectivenessRow" p
 WHERE old.legacy AND NOT p.legacy AND p."aliasId"=old."aliasId" AND p.country=old.country;
ALTER TABLE "MetaEffectivenessDay" ADD COLUMN "salesOverridden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MetaEffectivenessDay" ADD COLUMN "fixedCostOverridden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MetaEffectivenessDay" ADD COLUMN "fixedCostCurrency" TEXT;
CREATE TABLE "MetaFxDay" (
 day TEXT PRIMARY KEY, rates JSONB NOT NULL DEFAULT '{}', source TEXT NOT NULL,
 "sourceUrl" TEXT NOT NULL, "fetchedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "lastError" TEXT
);
