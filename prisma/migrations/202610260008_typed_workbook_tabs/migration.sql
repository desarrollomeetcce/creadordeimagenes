CREATE TABLE "MetaEffectivenessSheet" (
 id text PRIMARY KEY,
 kind text NOT NULL CHECK (kind IN ('TOTALS','ADVISORS','INVENTORY')),
 name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
 config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config)='object'),
 revision integer NOT NULL DEFAULT 1,
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MetaEffectivenessSheet_kind_createdAt_idx" ON "MetaEffectivenessSheet"(kind,"createdAt");
CREATE UNIQUE INDEX "MetaEffectivenessSheet_kind_name_ci_key" ON "MetaEffectivenessSheet"(kind,lower(name));
INSERT INTO "MetaEffectivenessSheet"(id,kind,name) VALUES
 ('default-totals','TOTALS','Totales'),
 ('default-advisors','ADVISORS','Asesores'),
 ('default-inventory','INVENTORY','Inventario');
