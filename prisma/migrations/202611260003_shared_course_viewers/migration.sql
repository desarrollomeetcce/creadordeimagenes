CREATE TABLE "AICourseViewer" (
  "courseId" TEXT NOT NULL REFERENCES "AICourse"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY ("courseId", "userId")
);
CREATE INDEX "AICourseViewer_userId_idx" ON "AICourseViewer"("userId");
