CREATE TABLE "LibraryExclusion" (
 "userId" TEXT NOT NULL,
 "variationId" TEXT NOT NULL REFERENCES "Variation"(id) ON DELETE CASCADE,
 PRIMARY KEY ("userId","variationId")
);
