CREATE TABLE "MetaAdvisorPortal" (
 "advisorId" TEXT PRIMARY KEY REFERENCES "MetaAdvisor"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "userId" TEXT UNIQUE REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE,
 revision INTEGER NOT NULL DEFAULT 1,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "MetaAdvisorGoal" (
 id TEXT PRIMARY KEY,
 "advisorId" TEXT NOT NULL REFERENCES "MetaAdvisor"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 basis TEXT NOT NULL CHECK (basis IN ('BC','BM')),
 since TEXT NOT NULL,
 until TEXT NOT NULL,
 percent DOUBLE PRECISION NOT NULL CHECK (percent >= 0 AND percent <= 100),
 "salesTarget" INTEGER CHECK ("salesTarget" > 0),
 revision INTEGER NOT NULL DEFAULT 1,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (since <= until)
);
CREATE INDEX "MetaAdvisorGoal_advisorId_since_until_idx" ON "MetaAdvisorGoal"("advisorId",since,until);
