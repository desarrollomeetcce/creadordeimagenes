CREATE TABLE "MetaEffectivenessColors" ("tableId" text PRIMARY KEY REFERENCES "MetaAliasTable"(id) ON DELETE CASCADE, rules jsonb NOT NULL DEFAULT '[]'::jsonb, revision integer NOT NULL DEFAULT 1);
