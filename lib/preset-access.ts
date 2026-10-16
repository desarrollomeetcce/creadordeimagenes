import { db } from "./db";
import { demand } from "./errors";

export async function presetAccess(
  user: { id: string; role: string },
  id: string,
  edit = false,
) {
  const preset = await db.savedPreset.findUnique({ where: { id } });
  demand(
    preset &&
      (preset.userId === user.id ||
        user.role === "OWNER" ||
        preset.visibility !== "PERSONAL"),
    "Configuración no encontrada.",
    404,
  );
  if (edit) {
    demand(
      preset.userId === user.id || user.role === "OWNER",
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
