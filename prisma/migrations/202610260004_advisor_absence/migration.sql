CREATE TABLE "MetaAdvisorAbsence" (
 "advisorId" text NOT NULL REFERENCES "MetaAdvisor"(id) ON DELETE RESTRICT,
 day text NOT NULL, mode text NOT NULL DEFAULT 'MANUAL' CHECK (mode IN ('MANUAL','CLOCK')),
 "manualHours" numeric(10,6) CHECK ("manualHours" >= 0 AND "manualHours" <= 24),
 intervals jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(intervals)='array'),
 revision integer NOT NULL DEFAULT 1,
 PRIMARY KEY ("advisorId",day)
);
