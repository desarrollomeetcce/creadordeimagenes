import { z } from "zod";
export const instructionPolicySchema = z.object({
  includeSelf:z.boolean().optional(), includeProject:z.boolean().optional(), includeProduct:z.boolean().optional(),
  loadedPresetId:z.string().max(100).optional(), loadedPresetName:z.string().max(150).optional(),
  presetAttachments:z.record(z.string().max(100),z.string().max(100)).refine(v=>Object.keys(v).length<=50).optional(),
  brandPresetAttachments:z.record(z.string().max(100),z.string().max(100)).refine(v=>Object.keys(v).length<=50).optional(),
  brandPresetId:z.string().max(100).optional(), brandPresetName:z.string().max(150).optional(),
});
export type InstructionPolicy = z.infer<typeof instructionPolicySchema>;
export const policyOf = (value: unknown): InstructionPolicy => instructionPolicySchema.parse(value ?? {});
export function instructionUse(project:unknown, product:unknown, subproduct:unknown, productApplies=true) {
  const p=policyOf(project), c=policyOf(product), s=policyOf(subproduct);
  return { project:p.includeSelf!==false && c.includeProject!==false && s.includeProject!==false,
    product:productApplies && c.includeSelf!==false && s.includeProduct!==false,
    subproduct:s.includeSelf!==false };
}
export function instructionFlags(value:unknown){const policy=policyOf(value);return Object.fromEntries((["includeSelf","includeProject","includeProduct"] as const).filter(key=>policy[key]!==undefined).map(key=>[key,policy[key]])) as Pick<InstructionPolicy,"includeSelf"|"includeProject"|"includeProduct">;}
