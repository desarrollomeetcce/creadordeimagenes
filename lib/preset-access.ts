import { db } from "./db";
import { demand } from "./errors";
import type { Prisma } from "@prisma/client";

export function canEditPreset(
  user: { id: string; role: string },
  preset: { userId: string; visibility: string },
) {
  return (
    user.role !== "OBSERVER" &&
    (user.role === "OWNER" ||
      (preset.visibility !== "OFFICIAL" && preset.userId === user.id))
  );
}
export async function presetFilter(user: {
  id: string;
  role: string;
}): Promise<Prisma.SavedPresetWhereInput> {
  if (["OWNER", "ADMIN"].includes(user.role)) return {};
  const shares = await db.presetShare.findMany({
    where: { userId: user.id },
    select: { presetId: true },
  });
  return {
    OR: [
      ...(user.role !== "OBSERVER" ? [{ userId: user.id }] : []),
      { visibility: "OFFICIAL" },
      { visibility: "SHARED", id: { in: shares.map((s) => s.presetId) } },
    ],
  };
}

export async function presetAccess(
  user: { id: string; role: string },
  id: string,
  edit = false,
) {
  const preset = await db.savedPreset.findFirst({
    where: { id, ...(await presetFilter(user)) },
  });
  demand(preset, "Configuración no encontrada.", 404);
  if (edit) {
    demand(
      canEditPreset(user, preset),
      "Solo el autor o el OWNER pueden modificar esta configuración.",
      403,
    );
    demand(
      preset.visibility !== "OFFICIAL" || user.role === "OWNER",
      "Solo el OWNER administra configuraciones oficiales.",
      403,
    );
  }
  return preset;
}
