export const roleLabels: Record<string, string> = {
  OWNER: "OWNER",
  SUPERVISOR: "Supervisor",
  ADVISOR: "Asesor",
  ADMIN: "Administrador",
  USER: "Usuario",
  OBSERVER: "Observador",
};
export const roleAbilities: Record<string, string[]> = {
  SUPERVISOR: ["Administrar las metas y cuentas de asesores en Mi desempeño.", "Consultar el resumen del equipo y la vista individual de cada asesor."],
  ADVISOR: ["Consultar únicamente tu desempeño y tus metas, sin editarlas.", "Cambiar tu propia contraseña."],
  OWNER: [
    "Ver y administrar todos los proyectos, productos, subproductos y afiches.",
    "Crear cuentas de cualquier rol, aprobarlas, suspenderlas y cambiar contraseñas.",
    "Generar, editar, descargar, compartir y administrar todas las configuraciones guardadas.",
    "Administrar exclusivamente claves de IA, modelos, presupuestos y mantenimiento.",
    "Consultar estadísticas globales de actividad, reservas y costes confirmados por usuario, proyecto, producto, subproducto y modelo.",
  ],
  ADMIN: [
    "Ver los proyectos propios, asignados o habilitados por OWNER para todos los administradores; descargar sus afiches.",
    "Crear proyectos y compartir los propios; editar y generar en los asignados o habilitados para todos los administradores.",
    "Crear y administrar cuentas de Usuarios y Observadores; generar enlaces de recuperación para ellas.",
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
  return role === "OWNER" || role === "ADMIN";
}
export function canManageAccount(actor: string, target: string) {
  return (
    actor === "OWNER" ||
    (actor === "ADMIN" && ["USER", "OBSERVER"].includes(target))
  );
}
