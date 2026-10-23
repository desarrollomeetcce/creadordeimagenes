ALTER TABLE "MetaEffectivenessRow" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MetaEffectivenessRow" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MetaEffectivenessRow" DROP CONSTRAINT "MetaEffectivenessRow_country_check";
ALTER TABLE "MetaEffectivenessRow" ADD CONSTRAINT "MetaEffectivenessRow_country_check" CHECK ("country" = '' OR "country" ~ '^[A-Z]{2}$');
