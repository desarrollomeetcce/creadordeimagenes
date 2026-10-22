-- Shared by connections of the same Meta user. Never store tokens or headers here.
CREATE TABLE "MetaApiQuota" (
  "scope" TEXT PRIMARY KEY,
  "nextReadAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "blockedUntil" TIMESTAMPTZ,
  "lastLimitedAt" TIMESTAMPTZ,
  "failures" INTEGER NOT NULL DEFAULT 0
);
