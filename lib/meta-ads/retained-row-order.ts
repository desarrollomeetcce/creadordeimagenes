/** A retained inactive row keeps the same sorting group as active rows. */
export function compareRowRetention(
  a: { active: boolean; pinned?: boolean },
  b: { active: boolean; pinned?: boolean },
) {
  return (
    Number(b.active || b.pinned === true) -
    Number(a.active || a.pinned === true)
  );
}
