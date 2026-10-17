CREATE INDEX "GenerationJob_preview_group_idx" ON "GenerationJob" ("actorId",(snapshot->>'approvalGroup')) WHERE snapshot->>'previewFirst'='true';
