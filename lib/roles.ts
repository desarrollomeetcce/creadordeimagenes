export const roleLabels: Record<string, string> = {
  OWNER: "OWNER",
  ADMIN: "Administrador",
  USER: "Usuario",
  OBSERVER: "Observador",
};
export const roleAbilities: Record<string, string[]> = {
  OWNER: [
    "Ver y administrar todos los proyectos, categorías, subproductos y afiches.",
    "Crear cuentas de cualquier rol, aprobarlas, suspenderlas y cambiar contraseñas.",
    "Generar, editar, descargar, compartir y administrar todas las configuraciones guardadas.",
    "Administrar exclusivamente claves de IA, modelos, presupuestos y mantenimiento.",
  ],
  ADMIN: [
    "Ver y descargar todos los proyectos y sus afiches.",
    "Crear proyectos y generar, editar y compartir los propios; generar y editar los que te asignen.",
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
