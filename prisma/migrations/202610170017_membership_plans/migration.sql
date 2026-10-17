CREATE TABLE "MembershipPlan" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "priceCents" INTEGER NOT NULL CHECK ("priceCents" >= 0),
  "monthlyImages" INTEGER CHECK ("monthlyImages" > 0),
  "monthlyAIMicros" BIGINT CHECK ("monthlyAIMicros" > 0),
  "isPublic" BOOLEAN NOT NULL DEFAULT TRUE,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "MembershipPlan" (id,name,description,"priceCents","monthlyImages","monthlyAIMicros","isPublic") VALUES
('INICIO','Inicio','Para comenzar a crear tus campañas.',2000,20,10000000,TRUE),
('CRECIMIENTO','Crecimiento','Más variaciones para campañas frecuentes.',4900,50,25000000,TRUE),
('EMPRESA','Empresa','Mayor capacidad para tu equipo.',10000,100,50000000,TRUE),
('ILIMITADO','Ilimitado','Asignación interna exclusiva del OWNER.',0,NULL,NULL,FALSE);
ALTER TABLE "User" ADD COLUMN "planId" TEXT REFERENCES "MembershipPlan"(id), ADD COLUMN "planValidUntil" TIMESTAMP(3);
CREATE INDEX "UsageLedger_actorId_createdAt_idx" ON "UsageLedger"("actorId","createdAt");
