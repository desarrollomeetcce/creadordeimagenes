import type { Decision } from "./engine";
export type Change = {
  id: string;
  name: string;
  status: "ACTIVE" | "PAUSED";
  expectedStatus: "ACTIVE" | "PAUSED";
};
// Produces a reviewable plan only. The caller must obtain explicit human confirmation.
export function approvalPlan(
  selected: {
    decision: Decision;
    item: { id: string; name: string; status: string };
  }[],
): Change[] {
  const parents = new Map<string, Change>(),
    ads = new Map<string, Change>();
  for (const { decision: d, item } of selected) {
    if (!d.proposedStatus) continue;
    if (item.status !== "ACTIVE" && item.status !== "PAUSED")
      throw Error("Actualiza el estado antes de aprobar.");
    if (d.proposedStatus === "ACTIVE")
      for (const p of d.dependencies)
        parents.set(p.id, {
          id: p.id,
          name: p.name,
          status: "ACTIVE",
          expectedStatus: "PAUSED",
        });
    ads.set(item.id, {
      id: item.id,
      name: item.name,
      status: d.proposedStatus,
      expectedStatus: item.status,
    });
  }
  return [...parents.values(), ...ads.values()];
}
export async function applyApprovedPlan(
  plan: Change[],
  execute: (change: Change) => Promise<unknown>,
  onResult: (message: string) => void,
) {
  for (const change of plan) {
    try {
      await execute(change);
      onResult(
        `${change.name}: ${change.status === "ACTIVE" ? "activado" : "pausado"}.`,
      );
    } catch (e) {
      onResult(
        `${change.name}: ${e instanceof Error ? e.message : "No se pudo confirmar el cambio"}. Lote detenido; comprueba el estado en Meta antes de intentar de nuevo.`,
      );
      return false;
    }
  }
  return true;
}
