CREATE TABLE "LibraryResourceBinding" (
 "id" TEXT PRIMARY KEY,
 "scope" TEXT NOT NULL CHECK ("scope" IN ('project','category','subproduct')),
 "resourceId" TEXT NOT NULL,
 "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "selection" TEXT NOT NULL,
 "purpose" TEXT NOT NULL DEFAULT 'Referencia visual',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "LibraryResourceBinding_scope_resourceId_userId_selection_key" ON "LibraryResourceBinding"("scope","resourceId","userId","selection");
CREATE INDEX "LibraryResourceBinding_scope_resourceId_idx" ON "LibraryResourceBinding"("scope","resourceId");
