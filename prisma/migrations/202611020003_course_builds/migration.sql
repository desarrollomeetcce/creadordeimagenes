CREATE TABLE "AICourseBuild" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "courseId" TEXT NOT NULL REFERENCES "AICourse"("id") ON DELETE CASCADE,
 "actorId" TEXT NOT NULL,
 "requestId" TEXT NOT NULL UNIQUE,
 "status" TEXT NOT NULL DEFAULT 'PENDING',
 "resources" JSONB NOT NULL,
 "credentialRevisions" JSONB NOT NULL,
 "moduleIds" JSONB NOT NULL,
 "moduleIndex" INTEGER NOT NULL DEFAULT 0,
 "totalModules" INTEGER NOT NULL DEFAULT 0,
 "completed" INTEGER NOT NULL DEFAULT 0,
 "currentTaskId" TEXT,
 "error" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "AICourseBuild_courseId_status_idx" ON "AICourseBuild"("courseId","status");
CREATE UNIQUE INDEX "AICourseBuild_one_active_idx" ON "AICourseBuild"("courseId") WHERE status IN ('PENDING','RUNNING','STOPPING','DISPATCH_UNCERTAIN');
