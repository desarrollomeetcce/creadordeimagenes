CREATE TABLE "StoredAsset" (
  "id" TEXT PRIMARY KEY,
  "data" BYTEA NOT NULL,
  "size" INTEGER NOT NULL CHECK ("size" >= 0 AND "size" = octet_length("data")),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
