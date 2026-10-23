ALTER TABLE "MetaAdObject" ADD COLUMN "aliasCountry" TEXT;
ALTER TABLE "MetaAdObject" ADD CONSTRAINT "MetaAdObject_aliasCountry_format" CHECK ("aliasCountry" IS NULL OR "aliasCountry" ~ '^[A-Z]{2}$');
CREATE INDEX "MetaAdObject_aliasId_aliasCountry_idx" ON "MetaAdObject"("aliasId", "aliasCountry");
