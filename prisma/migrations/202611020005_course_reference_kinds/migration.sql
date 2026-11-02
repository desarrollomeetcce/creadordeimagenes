ALTER TABLE "AICourseReference" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'TEXT';
ALTER TABLE "AICourseReference" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
UPDATE "AICourseReference" SET "kind"=CASE WHEN "url" IS NOT NULL THEN 'WEB' WHEN "name" ~* '\.(pdf|docx|txt|csv|md)$' THEN 'FILE' ELSE 'TEXT' END;
