import { signMenu, type RoleMenuChange } from "./pulpo-menu-token";

export async function mirrorRoleMenu(id: string, email: string, change: RoleMenuChange) {
  const authorization = signMenu("role-menu-to-messaging", id, email.trim().toLowerCase(), undefined, undefined, undefined, change);
  if (!authorization) return false;
  const response = await fetch("https://pulpo.agenciamagneto.org/api/integrations/role-menu", {
    method: "POST", headers: { Authorization: authorization }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(4000),
  }).catch(() => null);
  return response?.ok === true;
}
