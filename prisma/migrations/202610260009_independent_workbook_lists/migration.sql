ALTER TABLE "MetaAdvisor" ADD COLUMN "sheetId" text NOT NULL DEFAULT 'default-advisors' REFERENCES "MetaEffectivenessSheet"(id) ON DELETE RESTRICT;
ALTER TABLE "MetaAdvisor" DROP CONSTRAINT "MetaAdvisor_name_key";
CREATE UNIQUE INDEX "MetaAdvisor_sheetId_name_key" ON "MetaAdvisor"("sheetId",name);
ALTER TABLE "MetaAlias" ADD COLUMN "inventorySheetId" text NOT NULL DEFAULT 'default-inventory' REFERENCES "MetaEffectivenessSheet"(id) ON DELETE RESTRICT;
CREATE INDEX "MetaAlias_inventorySheetId_idx" ON "MetaAlias"("inventorySheetId");
ALTER TABLE "MetaEffectivenessTotalDay" ADD COLUMN "sheetId" text NOT NULL DEFAULT 'default-totals' REFERENCES "MetaEffectivenessSheet"(id) ON DELETE RESTRICT;
ALTER TABLE "MetaEffectivenessTotalDay" DROP CONSTRAINT "MetaEffectivenessTotalDay_pkey";
ALTER TABLE "MetaEffectivenessTotalDay" ADD PRIMARY KEY ("sheetId","tableId",country,currency,day);
