ALTER TABLE "MetaEffectivenessDay" ADD COLUMN "annotations" JSONB NOT NULL DEFAULT '{}';
CREATE TABLE "MetaEffectivenessState" (
 id TEXT PRIMARY KEY,
 "aliasId" TEXT NOT NULL REFERENCES "MetaAlias"(id) ON DELETE CASCADE,
 country TEXT NOT NULL CHECK(country ~ '^[A-Z]{2}$'),
 active BOOLEAN NOT NULL DEFAULT true,
 revision INTEGER NOT NULL DEFAULT 0,
 UNIQUE("aliasId",country)
);
CREATE TABLE "MetaEffectivenessEvent" (
 id TEXT PRIMARY KEY,
 "stateId" TEXT NOT NULL REFERENCES "MetaEffectivenessState"(id) ON DELETE CASCADE,
 active BOOLEAN NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "actorId" TEXT NOT NULL,
 snapshot JSONB NOT NULL
);
CREATE INDEX "MetaEffectivenessEvent_stateId_createdAt_id_idx" ON "MetaEffectivenessEvent"("stateId","createdAt",id);
