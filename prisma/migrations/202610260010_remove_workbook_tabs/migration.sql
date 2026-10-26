ALTER TABLE "MetaEffectivenessSheet" ADD COLUMN "archivedAt" timestamp(3);
DROP INDEX "MetaEffectivenessSheet_kind_name_ci_key";
CREATE UNIQUE INDEX "MetaEffectivenessSheet_kind_name_ci_key" ON "MetaEffectivenessSheet"(kind,lower(name)) WHERE "archivedAt" IS NULL;
CREATE INDEX "MetaEffectivenessSheet_kind_archivedAt_createdAt_idx" ON "MetaEffectivenessSheet"(kind,"archivedAt","createdAt");
