import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { crmDestination } from "./pulpo-crm-destinations";
import { readMenuVisibility, readMove, type Module, type Move } from "./pulpo-menu-model";
export type RoleMenuChange = { role: string; menu: Module[] | null; expected: Module[] | null };
type Grant = {
  sub: string;
  email: string;
  exp: number;
  move?: Move;
  module?: string;
  nonce?: string;
  linkedId?: string;
  roleMenu?: RoleMenuChange;
};
type Audience = "preferences" | "access" | "open-crm" | "session-access" | "messaging-session-access" | "pull-generator-users" | "merge-pulpo-users" | "role-menu-to-generator" | "role-menu-to-messaging";
const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const directoryAudience = (audience: Audience) => audience === "pull-generator-users" || audience === "merge-pulpo-users";
const roleMenuAudience = (audience: Audience) => audience === "role-menu-to-generator" || audience === "role-menu-to-messaging";
function key() {
  const value = process.env.PULPO_GENERATOR_SSO_KEY;
  return value && /^[a-f\d]{64}$/i.test(value)
    ? Buffer.from(value, "hex")
    : null;
}
export function signMenu(
  audience: Audience,
  sub: string,
  email: string,
  move?: Move,
  module?: string,
  linkedId?: string,
  roleMenu?: RoleMenuChange,
) {
  const secret = key();
  if (!secret) return null;
  const encoded = Buffer.from(
    JSON.stringify({
      sub,
      email,
      move,
      module,
      linkedId,
      roleMenu,
      ...(module || directoryAudience(audience) ? { nonce: randomBytes(18).toString("base64url") } : {}),
      exp: Math.floor(Date.now() / 1000) + 20,
    }),
  ).toString("base64url");
  return "Bearer " + encoded + "." + digest(secret, audience, encoded);
}
function digest(secret: Buffer, audience: Audience, encoded: string) {
  return createHmac("sha256", secret)
    .update(`pulpo-menu:v1:${audience}:${encoded}`)
    .digest("base64url");
}
export function verifyMenu(
  audience: Audience,
  header: string | null,
): Grant | null {
  const secret = key();
  const match =
    header &&
    header.length < (roleMenuAudience(audience) ? 4096 : 2048) &&
    /^Bearer ([\w-]+)\.([\w-]{43})$/.exec(header);
  if (
    !secret ||
    !match ||
    !timingSafeEqual(
      Buffer.from(match[2]),
      Buffer.from(digest(secret, audience, match[1])),
    )
  )
    return null;
  try {
    const data = JSON.parse(Buffer.from(match[1], "base64url").toString());
    const now = Math.floor(Date.now() / 1000);
    if (
      typeof data.sub !== "string" ||
      !(audience === "messaging-session-access" ? /^[\w-]{1,100}$/ : uuid).test(data.sub) ||
      typeof data.email !== "string" ||
      !/^[^\s@]+@[^\s@]+$/.test(data.email) ||
      !Number.isSafeInteger(data.exp) ||
      data.exp <= now ||
      data.exp > now + 30
    )
      return null;
    if (roleMenuAudience(audience)) {
      const role = data.roleMenu?.role;
      const menu = readMenuVisibility(data.roleMenu?.menu);
      const expected = readMenuVisibility(data.roleMenu?.expected);
      if (!["advisor", "admin", "superadmin", "supervisor", "user", "observer"].includes(role) ||
          menu === undefined || expected === undefined) return null;
      return { sub: data.sub, email: data.email, exp: data.exp, roleMenu: { role, menu, expected } };
    }
    if (directoryAudience(audience)) {
      if (typeof data.nonce !== "string" || !/^[\w-]{24}$/.test(data.nonce)) return null;
      return { sub: data.sub, email: data.email, exp: data.exp, nonce: data.nonce };
    }
    if (audience === "messaging-session-access") {
      if (data.linkedId !== undefined && (typeof data.linkedId !== "string" || !uuid.test(data.linkedId))) return null;
      return { sub: data.sub, email: data.email, exp: data.exp, linkedId: data.linkedId };
    }
    if (audience === "open-crm") {
      if (
        typeof data.module !== "string" ||
        !crmDestination(data.module) ||
        typeof data.nonce !== "string" ||
        !/^[\w-]{24}$/.test(data.nonce)
      )
        return null;
      return {
        sub: data.sub,
        email: data.email,
        exp: data.exp,
        module: data.module,
        nonce: data.nonce,
      };
    }
    if (data.move !== undefined) {
      const move = readMove(data.move);
      if (!move || audience !== "preferences") return null;
      return { sub: data.sub, email: data.email, exp: data.exp, move };
    }
    return { sub: data.sub, email: data.email, exp: data.exp };
  } catch {
    return null;
  }
}

export async function readMenuBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return Buffer.concat(chunks).toString("utf8");
    size += value.byteLength;
    if (size > 2048) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
}

export async function requestMove(request: Request) {
  const body = await readMenuBody(request);
  try {
    return body ? readMove(JSON.parse(body)) : null;
  } catch {
    return null;
  }
}
