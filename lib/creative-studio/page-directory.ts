import { db } from "../db";
import { demand } from "../errors";
import { campaignPageIssue } from "./page-errors";
export type StudioPageMetadata = {
  id: string;
  name: string;
  picture: string;
  whatsapp: string;
};
const pending = new Map<
  string,
  Promise<Awaited<ReturnType<typeof refreshDirectory>>>
>();
export function safePagePicture(value: unknown) {
  try {
    const u = new URL(String(value));
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === "443") &&
      !u.searchParams.has("access_token") &&
      (u.hostname.endsWith(".fbcdn.net") ||
        u.hostname.endsWith(".fbsbx.com") ||
        u.hostname === "graph.facebook.com")
      ? u.href
      : "";
  } catch {
    return "";
  }
}
type Account = {
  id: string;
  connectionId: string;
  connection: { revision: number; tokenExpiresAt: Date | null };
};
type Source = () => Promise<{ data?: any[]; paging?: { next?: unknown } }>;
const MAX_AGE = 24 * 60 * 60 * 1000;
function valid(
  row: {
    connectionId: string;
    credentialRevision: number;
    fetchedAt: Date;
  } | null,
  a: Account,
) {
  return (
    !!row &&
    row.connectionId === a.connectionId &&
    row.credentialRevision === a.connection.revision &&
    Date.now() - row.fetchedAt.getTime() < MAX_AGE &&
    (!a.connection.tokenExpiresAt ||
      a.connection.tokenExpiresAt.getTime() > Date.now())
  );
}
/** Caller must authorize the account before entering; cached directories never authorize publication. */
export async function campaignPageDirectory(
  a: Account,
  read: Source,
  force = false,
) {
  const stored = await db.creativeMetaPageDirectory.findUnique({
      where: { accountId: a.id },
    }),
    cached = valid(stored, a) ? stored : null;
  if (cached && !force)
    return {
      pages: cached.pages as StudioPageMetadata[],
      partial: cached.partial,
      pageIssue: null,
      pageCached: true,
      pageSavedAt: cached.fetchedAt.toISOString(),
    };
  const key = JSON.stringify([a.id, a.connectionId, a.connection.revision]);
  let request = pending.get(key);
  if (!request) {
    request = refreshDirectory(a, read, cached);
    pending.set(key, request);
    void request
      .finally(() => {
        if (pending.get(key) === request) pending.delete(key);
      })
      .catch(() => {});
  }
  return request;
}
async function refreshDirectory(
  a: Account,
  read: Source,
  cached: Awaited<ReturnType<typeof db.creativeMetaPageDirectory.findUnique>>,
) {
  try {
    const result = await read();
    const current = await db.metaAdAccount.findUnique({
      where: { id: a.id },
      select: {
        connectionId: true,
        connection: { select: { revision: true, disconnectedAt: true } },
      },
    });
    demand(
      current?.connectionId === a.connectionId &&
        current.connection.revision === a.connection.revision &&
        !current.connection.disconnectedAt,
      "La conexión cambió. Actualiza las páginas.",
      409,
    );
    const pages: StudioPageMetadata[] = (result.data ?? [])
      .filter((p) => /^\d{1,40}$/.test(String(p.id)))
      .map((p) => ({
        id: String(p.id),
        name: String(p.name ?? p.id).slice(0, 500),
        picture: safePagePicture(p.picture?.data?.url),
        whatsapp:
          typeof p.whatsapp_number === "string"
            ? p.whatsapp_number.slice(0, 100)
            : "",
      }));
    const fetchedAt = new Date(),
      partial = !!result.paging?.next;
    if (pages.length)
      await db.creativeMetaPageDirectory.upsert({
        where: { accountId: a.id },
        create: {
          accountId: a.id,
          connectionId: a.connectionId,
          credentialRevision: a.connection.revision,
          pages,
          partial,
          fetchedAt,
        },
        update: {
          connectionId: a.connectionId,
          credentialRevision: a.connection.revision,
          pages,
          partial,
          fetchedAt,
        },
      });
    else
      await db.creativeMetaPageDirectory.deleteMany({
        where: {
          accountId: a.id,
          connectionId: a.connectionId,
          credentialRevision: a.connection.revision,
        },
      });
    return {
      pages,
      partial,
      pageIssue: null,
      pageCached: false,
      pageSavedAt: pages.length ? fetchedAt.toISOString() : null,
    };
  } catch (error) {
    if ((error as { status?: number })?.status === 409) throw error;
    const issue = campaignPageIssue(error);
    if (["AUTH", "PERMISSION"].includes(issue.kind))
      await db.creativeMetaPageDirectory.deleteMany({
        where: {
          accountId: a.id,
          connectionId: a.connectionId,
          credentialRevision: a.connection.revision,
        },
      });
    const fallback =
      cached && ["RATE_LIMIT", "UNAVAILABLE"].includes(issue.kind);
    return {
      pages: fallback ? (cached.pages as StudioPageMetadata[]) : [],
      partial: fallback ? cached.partial : false,
      pageIssue: issue,
      pageCached: !!fallback,
      pageSavedAt: fallback ? cached.fetchedAt.toISOString() : null,
    };
  }
}
