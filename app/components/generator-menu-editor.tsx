"use client";

import { useEffect, useRef, useState } from "react";
import "./generator-menu-editor.css";
import { groups, menuModulesByGroup, modules, type Group, type Module } from "@/lib/pulpo-menu-model";

type Selection = Module[] | null;

function GroupCheckbox({
  group,
  selected,
  onChange,
}: {
  group: Group;
  selected: Module[];
  onChange: (checked: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const pages = menuModulesByGroup[group];
  const count = pages.filter((id) => selected.includes(id)).length;
  useEffect(() => {
    if (input.current) input.current.indeterminate = count > 0 && count < pages.length;
  }, [count, pages]);
  return (
    <label>
      <input
        ref={input}
        type="checkbox"
        checked={count === pages.length}
        onChange={(event) => onChange(event.target.checked)}
      />
      Todo {group}
    </label>
  );
}

export function GeneratorMenuEditor({
  name,
  original,
  rolePicker,
  automaticLabel,
  onSave,
  onClose,
}: {
  name: string;
  original: Selection;
  rolePicker?: React.ReactNode;
  automaticLabel?: string;
  onSave: (selection: Selection) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const [custom, setCustom] = useState(original !== null);
  const [selected, setSelected] = useState<Module[]>(original ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  function setPages(pages: readonly Module[], checked: boolean) {
    setSelected((current) => checked
      ? [...new Set([...current, ...pages])]
      : current.filter((id) => !pages.includes(id)));
  }

  return (
    <dialog
      ref={dialog}
      className="generator-menu-editor"
      aria-label={"Menú de Generador de " + name}
      onCancel={(event) => {
        event.preventDefault();
        if (!saving.current) onClose();
      }}
    >
      <form onSubmit={async (event) => {
        event.preventDefault();
        if (saving.current) return;
        saving.current = true;
        setBusy(true);
        setError("");
        try {
          await onSave(custom ? selected : null);
          onClose();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "No se pudo guardar el menú.");
        } finally {
          saving.current = false;
          setBusy(false);
        }
      }}>
        <header>
          <h2>Menú de Generador</h2>
          <p>{name}</p>
        </header>
        <p>Elige los enlaces que verá esta persona. Cada aplicación sigue validando sus permisos de Lector o Editor al abrir la página.</p>
        {rolePicker}
        <label className="generator-menu-mode">
          Mostrar
          <select value={custom ? "custom" : "automatic"} disabled={busy} onChange={(event) => setCustom(event.target.value === "custom")}>
            <option value="automatic">{automaticLabel ?? "Menú automático según sus permisos"}</option>
            <option value="custom">Elegir grupos y páginas</option>
          </select>
        </label>
        {custom && (
          <div className="generator-menu-groups">
            {groups.map((group) => (
              <fieldset key={group} disabled={busy}>
                <legend>{group}</legend>
                <GroupCheckbox group={group} selected={selected} onChange={(checked) => setPages(menuModulesByGroup[group], checked)} />
                {menuModulesByGroup[group].map((id) => (
                  <label key={id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(id)}
                      onChange={(event) => setPages([id], event.target.checked)}
                    />
                    {modules[id][0]}
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>Cancelar</button>
          <button className="primary" disabled={busy}>Guardar menú</button>
        </footer>
      </form>
    </dialog>
  );
}
