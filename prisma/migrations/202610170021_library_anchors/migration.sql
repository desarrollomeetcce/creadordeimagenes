ALTER TABLE "LibraryFolder" ADD COLUMN "anchorScope" TEXT, ADD COLUMN "anchorId" TEXT;
ALTER TABLE "LibraryFolder" ADD CONSTRAINT "LibraryFolder_anchor_check" CHECK (("anchorScope" IS NULL AND "anchorId" IS NULL) OR ("anchorScope" IN ('project','product','subproduct','tests') AND "anchorId" IS NOT NULL AND "parentId" IS NULL));
