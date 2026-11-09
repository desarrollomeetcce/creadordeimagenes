ALTER TABLE "VisualAuditPolicy" ALTER COLUMN "retentionDays" SET DEFAULT 7;
INSERT INTO "VisualAuditPolicy" (id,enabled,"retentionDays","limitMb",revision,"updatedAt") VALUES ('global',true,7,32,1,CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET "retentionDays"=7,revision="VisualAuditPolicy".revision+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "VisualAuditPolicy"."retentionDays"<>7;
UPDATE "AuditThumbnail" SET "expiresAt"=LEAST("expiresAt","createdAt"+INTERVAL '7 days') WHERE status='AVAILABLE';
UPDATE "AuditThumbnail" SET data=NULL,size=0,status='EXPIRED',"removedAt"=CURRENT_TIMESTAMP WHERE status='AVAILABLE' AND "expiresAt"<=CURRENT_TIMESTAMP;
