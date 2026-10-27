-- BA is manual and independent of BM, Meta B and computed assignment estimates.
-- Counts are shared by financial sheet, country and day; no currency conversion or inferred adviser.
CREATE TABLE "MetaAdvisorBaseDay" (
 "tableId" TEXT NOT NULL REFERENCES "MetaAliasTable"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 country TEXT NOT NULL,
 day TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'VALUE',
 allocations JSONB NOT NULL DEFAULT '[]',
 revision INTEGER NOT NULL DEFAULT 1,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("tableId", country, day),
 CONSTRAINT "MetaAdvisorBaseDay_state" CHECK (state IN ('VALUE','EMPTY','NA')),
 CONSTRAINT "MetaAdvisorBaseDay_allocations" CHECK (jsonb_typeof(allocations) = 'array')
);
CREATE INDEX "MetaAdvisorBaseDay_day_idx" ON "MetaAdvisorBaseDay"(day);
