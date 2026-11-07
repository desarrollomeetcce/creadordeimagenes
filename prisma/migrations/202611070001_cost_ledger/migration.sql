ALTER TABLE "FixedCostEntry"
 ADD COLUMN "project" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "unit" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "bonus" DECIMAL(14,2) NOT NULL DEFAULT 0,
 ADD COLUMN "conversionRate" DECIMAL(18,6),
 ADD COLUMN "targetCurrency" TEXT NOT NULL DEFAULT 'PEN';
CREATE TABLE "FixedCostOption" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "kind" TEXT NOT NULL,
 "name" TEXT NOT NULL,
 "key" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "FixedCostOption_kind_key_key" ON "FixedCostOption"("kind", "key");
INSERT INTO "FixedCostSheet" ("id","name","createdAt") VALUES ('fc_20261107_asesores','Asesores',CURRENT_TIMESTAMP) ON CONFLICT ("name") DO NOTHING;
INSERT INTO "FixedCostOption" ("id","kind","name","key","createdAt") VALUES ('fcu_20261107_asesores','UNIT','Asesores','asesores',CURRENT_TIMESTAMP) ON CONFLICT ("kind","key") DO NOTHING;
INSERT INTO "FixedCostSheet" ("id","name","createdAt") VALUES ('fc_20261107_servicios','Servicios',CURRENT_TIMESTAMP) ON CONFLICT ("name") DO NOTHING;
INSERT INTO "FixedCostOption" ("id","kind","name","key","createdAt") VALUES ('fcu_20261107_servicios','UNIT','Servicios','servicios',CURRENT_TIMESTAMP) ON CONFLICT ("kind","key") DO NOTHING;
INSERT INTO "FixedCostSheet" ("id","name","createdAt") VALUES ('fc_20261107_tecnologia','Tecnología',CURRENT_TIMESTAMP) ON CONFLICT ("name") DO NOTHING;
INSERT INTO "FixedCostOption" ("id","kind","name","key","createdAt") VALUES ('fcu_20261107_tecnologia','UNIT','Tecnología','tecnologia',CURRENT_TIMESTAMP) ON CONFLICT ("kind","key") DO NOTHING;
INSERT INTO "FixedCostSheet" ("id","name","createdAt") VALUES ('fc_20261107_impuestos','Impuestos',CURRENT_TIMESTAMP) ON CONFLICT ("name") DO NOTHING;
INSERT INTO "FixedCostOption" ("id","kind","name","key","createdAt") VALUES ('fcu_20261107_impuestos','UNIT','Impuestos','impuestos',CURRENT_TIMESTAMP) ON CONFLICT ("kind","key") DO NOTHING;
