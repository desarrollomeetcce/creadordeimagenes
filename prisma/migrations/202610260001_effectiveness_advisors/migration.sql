CREATE TABLE "MetaAdvisor" (id text PRIMARY KEY, name text NOT NULL UNIQUE, revision integer NOT NULL DEFAULT 0);
CREATE TABLE "MetaAdvisorAttendance" ("advisorId" text NOT NULL REFERENCES "MetaAdvisor"(id) ON DELETE RESTRICT, day text NOT NULL, status text CHECK (status IN ('PRESENT','ABSENT','NA')), revision integer NOT NULL DEFAULT 1, PRIMARY KEY ("advisorId",day));
ALTER TABLE "MetaAdObject" ADD COLUMN "advisorId" text REFERENCES "MetaAdvisor"(id) ON DELETE RESTRICT;
ALTER TABLE "MetaEffectivenessRow" ADD COLUMN "advisorId" text REFERENCES "MetaAdvisor"(id) ON DELETE RESTRICT;
CREATE INDEX "MetaAdObject_aliasId_aliasCountry_advisorId_idx" ON "MetaAdObject"("aliasId","aliasCountry","advisorId");
CREATE INDEX "MetaEffectivenessRow_advisorId_idx" ON "MetaEffectivenessRow"("advisorId");
