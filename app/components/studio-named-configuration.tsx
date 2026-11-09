"use client";
import { useRef, useState } from "react";
import { SearchSelect } from "./search-select";
import { studioRequest } from "./inventory-meta-picker";
import type { useCampaignPresets } from "./studio-campaign-presets";
import {
  campaignConfigurationSettings,
  adConfigurationSettings,
  configurationMatches,
} from "../../lib/creative-studio/campaign-configuration-settings";

export function useNamedConfiguration({
  kind,
  categoryId,
  form,
  store,
  onApply,
  disabled,
}: {
  kind: "campaign" | "ad";
  categoryId: string;
  form: Record<string, any>;
  store: ReturnType<typeof useCampaignPresets>;
  onApply: (settings: any) => void;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState<any>(null),
    [query, setQuery] = useState(""),
    [name, setName] = useState(""),
    [editing, setEditing] = useState(true),
    [saveOpen, setSaveOpen] = useState(false),
    [saving, setSaving] = useState(false),
    [notice, setNotice] = useState("");
  const pending = useRef<{
      fingerprint: string;
      id: string;
      revision: number;
    } | null>(null),
    inFlight = useRef(false);
  const key =
      kind === "campaign" ? "campaignConfigurations" : "adConfigurations",
    title = kind === "campaign" ? "campaña" : "anuncios";
  const rows = store.data[key] ?? [];
  const clear = () => {
    pending.current = null;
    setSelected(null);
    setQuery("");
    setName("");
    setEditing(true);
    setNotice("");
    setSaveOpen(false);
  };
  async function save() {
    if (inFlight.current || disabled) return;
    if (!name.trim()) {
      setNotice("Escribe un nombre para guardar.");
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setNotice("");
    try {
      const settings =
          kind === "campaign"
            ? campaignConfigurationSettings(form)
            : adConfigurationSettings(form),
        fingerprint = JSON.stringify({ name: name.trim(), settings });
      if (pending.current?.fingerprint !== fingerprint) {
        const update =
          selected && !selected.legacy && name.trim() === selected.name;
        pending.current = {
          fingerprint,
          id: update ? selected.id : crypto.randomUUID(),
          revision: update ? selected.revision : 0,
        };
      }
      const saved = await studioRequest(
        "/" +
          (kind === "campaign"
            ? "campaign-configurations"
            : "ad-configurations") +
          "/" +
          categoryId,
        "POST",
        {
          id: pending.current.id,
          expectedRevision: pending.current.revision,
          name: name.trim(),
          settings,
        },
      );
      store.setData((old: any) => ({
        ...old,
        [key]: [
          ...(old[key] ?? []).filter((p: any) => p.id !== saved.id),
          saved,
        ],
      }));
      setSelected(saved);
      setQuery(saved.name);
      setName(saved.name);
      setEditing(false);
      setSaveOpen(false);
      setNotice("");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }
  const matches =
    !!selected && configurationMatches(kind, selected.settings, form);
  return {
    kind,
    title,
    selected,
    query,
    matches,
    setQuery,
    name,
    setName,
    editing,
    setEditing,
    saveOpen,
    setSaveOpen,
    saving,
    notice,
    clear,
    save,
    collapsed: !!selected && !editing && matches,
    disabled: disabled || saving,
    store,
    rows,
    select: (id: string) => {
      const row = rows.find((r: any) => r.id === id);
      if (!row) return;
      pending.current = null;
      onApply(row.settings);
      setSelected(row);
      setName(row.name);
      setQuery(row.name);
      setEditing(false);
      setSaveOpen(false);
      setNotice("");
    },
  };
}
type Model = ReturnType<typeof useNamedConfiguration>;
export function NamedConfigurationPicker({ model }: { model: Model }) {
  return (
    <div
      className={
        "studio-named-configuration" +
        (model.selected ? " studio-configuration-selected" : "")
      }
      onFocusCapture={() => void model.store.load().catch(() => {})}
    >
      <div className="studio-configuration-line">
        <SearchSelect
          label={"Buscar configuración de " + model.title}
          placeholder={
            model.kind === "campaign"
              ? "Configuración"
              : "Buscar configuración de anuncios"
          }
          value={model.query}
          onChange={model.setQuery}
          onSelect={(o) => model.select(o.id)}
          options={model.rows.map((r: any) => ({
            id: r.id,
            label: r.name,
            detail: "Configuración de " + model.title,
            search: r.name,
          }))}
          disabled={model.disabled}
          loading={model.store.loading}
          browseOnToggle
        />
        {model.selected && (
          <small
            className="studio-configuration-status"
            title={
              model.matches ? "Configuración guardada" : "Cambios sin guardar"
            }
          >
            {model.matches ? "Guardada" : "Modificada"}
          </small>
        )}
        {model.selected && (
          <>
            <button
              type="button"
              disabled={model.disabled}
              aria-label={"Editar configuración de " + model.title}
              onClick={() => model.setEditing(model.collapsed)}
            >
              {model.collapsed ? "Editar" : "Contraer"}
            </button>
            <button
              type="button"
              disabled={model.disabled}
              aria-label={"Quitar configuración de " + model.title}
              onClick={model.clear}
            >
              ×
            </button>
          </>
        )}
      </div>
      {model.store.error && <small role="status">{model.store.error}</small>}
    </div>
  );
}
export function NamedConfigurationSave({ model }: { model: Model }) {
  return (
    <div className="studio-configuration-save" hidden={model.collapsed}>
      {!model.saveOpen ? (
        <button
          type="button"
          disabled={model.disabled}
          onClick={() => model.setSaveOpen(true)}
        >
          Guardar configuración de {model.title}
        </button>
      ) : (
        <div className="studio-configuration-save-line">
          <input
            aria-label={"Nombre de configuración de " + model.title}
            placeholder="Nombre de la configuración"
            maxLength={80}
            value={model.name}
            disabled={model.disabled}
            onChange={(e) => model.setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void model.save();
              }
            }}
          />
          <button
            type="button"
            disabled={model.disabled || !model.name.trim()}
            onClick={() => void model.save()}
          >
            {model.saving ? "Guardando…" : "Guardar"}
          </button>
          <button
            type="button"
            disabled={model.disabled}
            aria-label={"Cancelar guardar configuración de " + model.title}
            onClick={() => model.setSaveOpen(false)}
          >
            ×
          </button>
        </div>
      )}
      {model.notice && <small role="status">{model.notice}</small>}
    </div>
  );
}
