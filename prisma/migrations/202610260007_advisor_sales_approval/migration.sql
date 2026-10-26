CREATE TABLE "MetaAdvisorSalesApproval" (
 "rowId" text NOT NULL REFERENCES "MetaEffectivenessRow"(id) ON DELETE CASCADE,
 day text NOT NULL,
 "salesTotal" integer NOT NULL CHECK ("salesTotal">=0),
 allocations jsonb NOT NULL CHECK (jsonb_typeof(allocations)='array'),
 basis jsonb NOT NULL CHECK (jsonb_typeof(basis)='object'),
 revision integer NOT NULL DEFAULT 1,
 "approvedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "actorId" text NOT NULL,
 PRIMARY KEY ("rowId",day)
);
