DROP INDEX "MetaAdvisorAssignment_aliasId_country_effectiveAt_key";
CREATE INDEX "MetaAdvisorAssignment_aliasId_country_effectiveAt_idx" ON "MetaAdvisorAssignment"("aliasId",country,"effectiveAt");
