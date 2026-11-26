"use client";

import { useEffect, useId, useRef, useState } from "react";
import { modules, readMenuVisibility, type Module } from "@/lib/pulpo-menu-model";

const roles = [
  ["advisor", "Asesor"], ["supervisor", "Supervisor"], ["observer", "Observador"],
  ["user", "Usuario"], ["admin", "Administrador"], ["superadmin", "Superadministrador"],
] as const;

export type MenuRoleTarget = { label: string; pages: readonly Module[] };
export type MenuRoleApi = { endpoint: string; uppercase?: boolean };
type Selection = Record<string, Module[] | null>;

function RoleCheckbox({ name, count, total, automatic, disabled, onChange }: {
  name: string; count: number; total: number; automatic: boolean; disabled: boolean; onChange: (checked: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input.current) input.current.indeterminate = count > 0 && count < total;
  }, [count, total]);
  return <label className="pulpo-role-choice">
    <input ref={input} type="checkbox" checked={count === total} disabled={disabled}
      aria-label={name} onChange={(event) => onChange(event.currentTarget.checked)} />
    <span>{name}</span>
    <small>{automatic ? "Automático" : total > 1 ? `${count} de ${total}` : count ? "Visible" : "Oculto"}</small>
  </label>;
}

export function MenuRoleShortcut({ target, api, onClose }: { target: MenuRoleTarget; api: MenuRoleApi; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const titleId = useId();
  const [original, setOriginal] = useState<Selection | null>(null);
  const [draft, setDraft] = useState<Selection>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const endpoint = api.endpoint;
  const uppercase = api.uppercase;
  const roleKey = (role: string) => uppercase ? role.toUpperCase() : role;

  useEffect(() => {
    const dialog = ref.current;
    const controller = new AbortController();
    dialog?.showModal();
    void fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw Error("No se pudo cargar la visibilidad por rol.");
      const { menus } = await response.json();
      if (controller.signal.aborted) return;
      const saved = Object.fromEntries(roles.map(([role]) => {
        const key = uppercase ? role.toUpperCase() : role;
        return [key, readMenuVisibility(menus?.[key] ?? null) ?? null];
      }));
      setOriginal(saved);
      setDraft(saved);
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause.message); });
    return () => { controller.abort(); dialog?.close(); };
  }, [endpoint, uppercase]);

  function toggle(role: string, checked: boolean) {
    setNotice("");
    setDraft((current) => {
      const pages = current[role] ?? [];
      const menu = checked ? [...new Set([...pages, ...target.pages])] : pages.filter((page) => !target.pages.includes(page));
      const next = readMenuVisibility(menu) ?? [];
      return { ...current, [role]: original?.[role] === null && !next.length ? null : next };
    });
  }

  const changed = original ? Object.keys(draft).filter((role) => JSON.stringify(draft[role]) !== JSON.stringify(original[role])) : [];
  async function save() {
    if (saving.current || !original || !changed.length) return;
    saving.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const results = await Promise.allSettled(changed.map(async (role) => {
      const response = await fetch(endpoint, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, menu: draft[role], expected: original[role] }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error ?? "No se pudo guardar la visibilidad.");
      return { role, menu: readMenuVisibility(result.menu) ?? null, peer: result.peer === true };
    }));
    const saved = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const savedMenus = Object.fromEntries(saved.map(({ role, menu }) => [role, menu]));
    setOriginal({ ...original, ...savedMenus });
    setDraft({ ...draft, ...savedMenus });
    const failure = results.find((result) => result.status === "rejected");
    if (saved.length) setNotice(saved.every(({ peer }) => peer)
      ? "Visibilidad guardada en ambos sistemas."
      : "Visibilidad guardada aquí. El otro sistema no confirmó todos los cambios.");
    if (failure?.status === "rejected") setError(failure.reason instanceof Error ? failure.reason.message : "Algunos cambios quedaron pendientes.");
    saving.current = false;
    setBusy(false);
  }

  return <dialog ref={ref} className="pulpo-role-dialog" aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); if (!saving.current) onClose(); }}>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <h2 id={titleId}>Visibilidad de {target.label}</h2>
      <p>Elige qué roles verán {target.pages.length > 1 ? "estas páginas" : "este enlace"}. Cada página aplica sus propios permisos.</p>
      {target.pages.length > 1 && <p className="pulpo-role-pages">{target.pages.map((page) => modules[page][0]).join(", ")}</p>}
      {original ? <fieldset>
        <legend>Roles</legend>
        {roles.map(([role, name]) => {
          const key = roleKey(role);
          const selected = draft[key];
          return <RoleCheckbox key={role} name={name} total={target.pages.length} automatic={selected === null}
            count={target.pages.filter((page) => selected?.includes(page)).length}
            disabled={busy} onChange={(checked) => toggle(key, checked)} />;
        })}
      </fieldset> : !error && <p role="status">Cargando roles…</p>}
      {original && changed.some((role) => original[role] === null) &&
        <p className="pulpo-role-pages">Los roles que estaban en Automático pasarán a un menú personalizado que empieza con esta selección.</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      <footer>
        <button type="button" disabled={busy} onClick={onClose}>Cerrar</button>
        <button type="submit" className="primary" disabled={busy || !changed.length}>{busy ? "Guardando…" : "Guardar visibilidad"}</button>
      </footer>
    </form>
  </dialog>;
}
