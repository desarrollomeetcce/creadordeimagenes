CREATE TABLE "LibraryDocument" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "folderId" TEXT REFERENCES "LibraryFolder"(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  path TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0 AND size <= 3000000),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "LibraryDocument_user_folder_idx" ON "LibraryDocument"("userId","folderId");
