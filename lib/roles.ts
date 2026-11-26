export const roleLabels: Record<string, string> = {
  OWNER: "OWNER",
  SUPERVISOR: "Supervisor",
  ADVISOR: "Asesor",
  SUPERADMIN: "Superadministrador",
  ADMIN: "Administrador",
  USER: "Usuario",
  OBSERVER: "Observador",
};
export const roleDescriptions: Record<string, string> = {
  OWNER: "Control general de la plataforma, configuración y accesos elevados.",
  SUPERADMIN: "Crea cuentas de Usuario, Observador y Asesor y gestiona sus accesos.",
  ADMIN:
    "Gestiona usuarios básicos existentes y los proyectos de su ámbito.",
  USER: "Crea y trabaja en proyectos propios o asignados, incluida la generación de imágenes.",
  OBSERVER:
    "Consulta y descarga contenido compartido; no edita ni genera imágenes.",
  ADVISOR:
    "Consulta su propio Mi desempeño cuando está vinculado a un asesor. Sin Proyectos ni Biblioteca.",
  SUPERVISOR:
    "Gestiona metas y accesos de asesores y consulta el desempeño del equipo. Sin Proyectos ni Biblioteca.",
};
export const roleAbilities: Record<string, string[]> = {
  SUPERVISOR: [
    "Administrar las metas y cuentas de asesores en Mi desempeño.",
    "Consultar el resumen del equipo y la vista individual de cada asesor.",
  ],
  ADVISOR: [
    "Consultar únicamente tu desempeño y tus metas, sin editarlas.",
    "Cambiar tu propia contraseña.",
  ],
  OWNER: [
    "Ver y administrar todos los proyectos, productos, subproductos y afiches.",
    "Crear cuentas de cualquier rol, aprobarlas, suspenderlas y cambiar contraseñas.",
    "Generar, editar, descargar, compartir y administrar todas las configuraciones guardadas.",
    "Administrar exclusivamente claves de IA, modelos, presupuestos y mantenimiento.",
    "Consultar estadísticas globales de actividad, reservas y costes confirmados por usuario, proyecto, producto, subproducto y modelo.",
  ],
  SUPERADMIN: [
    "Crear y administrar cuentas de Usuarios, Observadores y Asesores.",
    "Consultar y trabajar en los espacios habilitados para su cuenta.",
  ],
  ADMIN: [
    "Ver los proyectos propios, asignados o habilitados por OWNER para todos los administradores; descargar sus afiches.",
    "Crear proyectos y compartir los propios; editar y generar en los asignados o habilitados para todos los administradores.",
    "Administrar cuentas existentes de Usuarios y Observadores y generar enlaces de recuperación.",
    "Consultar todas las configuraciones guardadas y administrar las propias.",
    "Las claves de IA y la administración de cuentas OWNER/Administrador son exclusivas del OWNER.",
  ],
  USER: [
    "Crear proyectos propios y ver, editar, generar y descargar en los propios o asignados.",
    "Compartir tus proyectos y crear configuraciones reutilizables.",
    "Consultar tus configuraciones, las compartidas contigo y las oficiales.",
    "Cambiar tu propia contraseña; no administrar cuentas ni claves de IA.",
  ],
  OBSERVER: [
    "Ver y descargar únicamente los proyectos y afiches compartidos contigo.",
    "Consultar las configuraciones que te compartan y las oficiales.",
    "Cambiar tu propia contraseña.",
    "No crear, editar, generar, eliminar ni administrar usuarios o claves de IA.",
  ],
};
export function managesUsers(role: string) {
  return role === "OWNER" || role === "SUPERADMIN" || role === "ADMIN";
}
export function canCreateUsers(role: string) {
  return role === "OWNER" || role === "SUPERADMIN";
}
export function canManageAccount(actor: string, target: string) {
  return (
    actor === "OWNER" ||
    (actor === "SUPERADMIN" && ["USER", "OBSERVER", "ADVISOR"].includes(target)) ||
    (actor === "ADMIN" && ["USER", "OBSERVER"].includes(target))
  );
}

/** A personal advisor link never overrides an elevated account role. */
export function defaultAccountView(user: {
  role: string;
  advisorLinked?: boolean;
}) {
  return user.role === "OWNER"
    ? "projects"
    : user.advisorLinked || ["SUPERVISOR", "ADVISOR"].includes(user.role)
      ? "performance"
      : "projects";
}

/** OWNER always sees and administers every module; No AI applies to the other roles. */
export function hasAiModuleAccess(user: {
  role: string;
  aiAccessEnabled?: boolean;
}) {
  return user.role === "OWNER" || user.aiAccessEnabled !== false;
}
