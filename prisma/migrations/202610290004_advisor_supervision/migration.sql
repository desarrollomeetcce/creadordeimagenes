ALTER TYPE "Role" ADD VALUE 'SUPERVISOR';
ALTER TYPE "Role" ADD VALUE 'ADVISOR';
CREATE TABLE "MetaAdvisorTarget" (
  "advisorId" TEXT NOT NULL REFERENCES "MetaAdvisor"("id") ON DELETE RESTRICT,
  "basis" TEXT NOT NULL CHECK ("basis" IN ('BC','BM')),
  "percent" DOUBLE PRECISION CHECK ("percent" >= 0 AND "percent" <= 100),
  "salesTarget" INTEGER CHECK ("salesTarget" > 0),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("advisorId","basis")
);
