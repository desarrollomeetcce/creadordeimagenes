import { z } from "zod";
import { demand } from "../errors";
import type { CampaignConfig } from "./campaign-policy";
export const metaInterestSchema = z
  .object({
    id: z.string().regex(/^\d{1,40}$/),
    name: z.string().trim().min(1).max(250),
  })
  .strict();
export type MetaInterest = z.infer<typeof metaInterestSchema>;
export function interestQueries(text: string) {
  return z
    .object({
      queries: z.array(z.string().trim().min(2).max(80)).min(1).max(4),
    })
    .strict()
    .parse(
      JSON.parse(text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")),
    ).queries;
}
export function verifiedAudienceInterests(
  audiences: CampaignConfig["audiences"],
  catalog: MetaInterest[],
  special = false,
) {
  const available = new Map(catalog.map((i) => [i.id, i]));
  const result = audiences.map((a) => ({
    ...a,
    interests: (a.interests ?? []).map((i) => {
      const known = available.get(i.id);
      demand(known, "La IA propuso un interés que Meta no confirmó.", 502);
      return known;
    }),
  }));
  if (special) {
    demand(
      result.every(
        (a) =>
          !a.interests.length &&
          a.ageMin === 18 &&
          a.ageMax === 65 &&
          a.gender === "ALL",
      ),
      "La categoría especial requiere segmentación amplia sin restricciones de edad o género.",
      502,
    );
    return result;
  }
  demand(
    catalog.length > 0 && result.some((a) => a.interests.length > 0),
    "Meta no devolvió intereses aplicables. No se creará una campaña con segmentación genérica sin avisarte.",
    409,
  );
  const signatures = result.map((a) =>
    JSON.stringify(a.interests.map((i) => i.id).sort()),
  );
  demand(
    new Set(signatures).size === signatures.length,
    "La IA repitió los mismos intereses en varios conjuntos. No se publicará esa segmentación duplicada.",
    502,
  );
  return result;
}
