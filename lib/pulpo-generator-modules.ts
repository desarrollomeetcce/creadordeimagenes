import { hasAiModuleAccess } from "./roles";
import type { Module } from "./pulpo-menu-model";

export function availableGeneratorModules(user: {
  role: string;
  aiAccessEnabled?: boolean;
  advisorLinked?: boolean;
  metaAdsShared?: boolean;
  effectivenessShared?: boolean;
  fixedCostsShared?: boolean;
}): Module[] {
  const owner = user.role === "OWNER";
  const restricted = ["ADVISOR", "SUPERVISOR"].includes(user.role);
  const observer = user.role === "OBSERVER";
  const result: Module[] = [];
  if (owner || restricted || user.advisorLinked) result.push("performance");
  if (owner || user.metaAdsShared) result.push("metaads");
  if (owner || user.effectivenessShared)
    result.push("products", "advisors", "inventory");
  if (owner || user.fixedCostsShared) result.push("fixed-costs");
  if (!restricted && hasAiModuleAccess(user)) {
    result.push("projects", "library");
    if (!observer) result.push("trash");
    if (owner) result.push("courses-ai");
  }
  return result;
}
