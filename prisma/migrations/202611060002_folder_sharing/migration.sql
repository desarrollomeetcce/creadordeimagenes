ALTER TABLE "Project" ADD COLUMN "allUsers" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Category" ADD COLUMN "allUsers" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "createdById" TEXT;
ALTER TABLE "Subproduct" ADD COLUMN "allUsers" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "createdById" TEXT;
ALTER TABLE "LibraryFolder" ADD COLUMN "allUsers" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "LibraryFolderMember" ("folderId" TEXT NOT NULL,"userId" TEXT NOT NULL,PRIMARY KEY("folderId","userId"),FOREIGN KEY("folderId") REFERENCES "LibraryFolder"("id") ON DELETE CASCADE,FOREIGN KEY("userId") REFERENCES "User"("id") ON DELETE CASCADE);
CREATE INDEX "LibraryFolderMember_userId_idx" ON "LibraryFolderMember"("userId");
