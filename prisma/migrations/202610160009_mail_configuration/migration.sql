CREATE TABLE "MailConfiguration" (
  "id" TEXT PRIMARY KEY DEFAULT 'global',
  "host" TEXT NOT NULL,
  "port" INTEGER NOT NULL CHECK ("port" IN (465, 587)),
  "username" TEXT NOT NULL,
  "senderName" TEXT NOT NULL,
  "encryptedPassword" TEXT NOT NULL,
  "revision" TEXT NOT NULL,
  "verifiedRevision" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
