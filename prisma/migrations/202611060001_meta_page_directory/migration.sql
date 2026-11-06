CREATE TABLE "CreativeMetaPageDirectory" (
 "accountId" TEXT NOT NULL,
 "connectionId" TEXT NOT NULL,
 "credentialRevision" INTEGER NOT NULL,
 "pages" JSONB NOT NULL,
 "partial" BOOLEAN NOT NULL DEFAULT false,
 "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "CreativeMetaPageDirectory_pkey" PRIMARY KEY ("accountId"),
 CONSTRAINT "CreativeMetaPageDirectory_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MetaAdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CreativeMetaPageDirectory_fetchedAt_idx" ON "CreativeMetaPageDirectory"("fetchedAt");
