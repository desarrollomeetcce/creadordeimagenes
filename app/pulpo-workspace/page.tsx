import { actor } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasAiModuleAccess } from "@/lib/roles";
import { PulpoWorkspace } from "./workspace";

export const dynamic = "force-dynamic";

export default async function EmbeddedWorkspace({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  if (view === "products") {
    return (
      <p>
        Ventas está disponible en{" "}
        <a href="/?view=products" target="_blank" rel="noopener noreferrer">Pulpo Generador</a>.
      </p>
    );
  }
  if (view !== "metaads" && view !== "advisors")
    return <p role="alert">Este módulo no está disponible en Pulpo.</p>;

  const user = await actor().catch(() => null);
  if (!user)
    return (
      <p role="alert">
        La sesión de Generador no está disponible. Vuelve a abrir el módulo
        desde Mensajería.
      </p>
    );

  const grant =
    user.role === "OWNER" ||
    (view === "metaads"
      ? await db.metaWorkspaceGrant.findFirst({
          where: { userId: user.id },
          select: { userId: true },
        })
      : await db.effectivenessGrant.findFirst({
          where: { userId: user.id },
          select: { userId: true },
        }));
  if (!grant)
    return (
      <p role="alert">Tu cuenta no tiene acceso a este módulo en Generador.</p>
    );

  return (
    <PulpoWorkspace
      view={view}
      userId={user.id}
      role={user.role}
      canCreateCampaign={hasAiModuleAccess(user) && user.role !== "OBSERVER"}
    />
  );
}
