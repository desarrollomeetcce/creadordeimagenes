import { demand } from "./errors";

/** Reuse bytes only within this authorized job. Never cache between jobs/users. */
export async function generationInputs<
  T extends { path: string; mime: string },
>(refs: T[], read: (path: string) => Promise<Buffer>) {
  demand(
    refs.length <= 9,
    "Selecciona como máximo nueve referencias visuales por afiche.",
  );
  const reads = new Map<string, Promise<Buffer>>();
  const resources = await Promise.all(
    refs.map(async (ref) => {
      let bytes = reads.get(ref.path);
      if (!bytes) {
        bytes = read(ref.path);
        reads.set(ref.path, bytes);
      }
      return { ...ref, bytes: await bytes };
    }),
  );
  return {
    resources,
    images: resources.map(({ bytes, mime }) => ({ bytes, mime })),
  };
}
