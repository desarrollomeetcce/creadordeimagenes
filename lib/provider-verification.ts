// Verification belongs to a credential revision, not to a calendar window.
// Shared with the settings UI; never import secrets or server dependencies here.
export function isProviderVerified(
  row:
    | {
        status: string;
        verifiedAt?: Date | string | null;
        verifiedRevision?: number | null;
        revision: number;
      }
    | null
    | undefined,
): boolean {
  return (
    !!row &&
    row.status === "VERIFIED" &&
    row.verifiedRevision === row.revision &&
    !!row.verifiedAt &&
    Number.isFinite(new Date(row.verifiedAt).getTime())
  );
}
