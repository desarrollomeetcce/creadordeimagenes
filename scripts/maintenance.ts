import { runMaintenance } from "../lib/maintenance";
import { db } from "../lib/db";
try {
  console.log(JSON.stringify(await runMaintenance("CLI")));
} catch {
  console.error(
    "No se pudo completar el mantenimiento. Revisa el panel OWNER; no se realizaron llamadas de IA.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
