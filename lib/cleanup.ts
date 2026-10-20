import { db } from "./db";
import { remove } from "./storage";
import { cleanupAuditThumbnails } from "./visual-audit";

// Each invocation is bounded; pending deletions survive a process crash or a storage failure.
export async function cleanupStorage(now = new Date()) {
  await (await import("./large-uploads")).cleanupIncompleteUploads(now);
  const thumbnails = await cleanupAuditThumbnails(now);
  const candidates = await db.variation.findMany({
    where: { permanent: false, filesQueuedAt: null, expiresAt: { lte: now } },
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
    select: { id: true },
    take: 25,
  });
  let expired = 0;
  for (const candidate of candidates) {
    expired += await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Variation" WHERE id=${candidate.id} FOR UPDATE`;
      const v = await tx.variation.findUnique({
        where: { id: candidate.id },
        include: { versions: { select: { path: true, backgroundPath: true } } },
      });
      if (!v || v.permanent || v.filesQueuedAt || v.expiresAt > now) return 0;
      const paths = [
        ...new Set([
          v.path,
          ...v.versions.flatMap((x) => [
            x.path,
            ...(x.backgroundPath ? [x.backgroundPath] : []),
          ]),
        ]),
      ];
      await tx.assetDeletion.createMany({
        data: paths.map((path) => ({ path, nextAttemptAt: now })),
        skipDuplicates: true,
      });
      await tx.variation.update({
        where: { id: v.id },
        data: { expired: true, filesQueuedAt: now },
      });
      return v.expired ? 0 : 1;
    });
  }
  let deletedFiles = 0,
    failedFiles = 0;
  const deadline = Date.now() + 20000;
  for (let i = 0; i < 100 && Date.now() < deadline; i++) {
    const result = await db.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<
          { path: string }[]
        >`SELECT path FROM "AssetDeletion" WHERE "nextAttemptAt" <= ${now} ORDER BY "nextAttemptAt", path LIMIT 1 FOR UPDATE SKIP LOCKED`;
        if (!rows[0]) return null;
        const path = rows[0].path;
        try {
          await remove(path);
        } catch (error) {
          if (!(
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "ENOENT"
          )) {
            await tx.assetDeletion.update({
              where: { path },
              data: {
                attempts: { increment: 1 },
                nextAttemptAt: new Date(now.getTime() + 300000),
              },
            });
            return false;
          }
        }
        await tx.assetDeletion.delete({ where: { path } });
        return true;
      },
      { timeout: 15000 },
    );
    if (result === null) break;
    if (result) deletedFiles++;
    else failedFiles++;
  }
  return { expired, thumbnails, deletedFiles, failedFiles };
}
