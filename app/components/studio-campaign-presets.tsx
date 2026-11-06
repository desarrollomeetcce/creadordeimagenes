"use client";
import { useEffect, useRef, useState } from "react";
import { studioRequest } from "./inventory-meta-picker";
import {
  reusableCampaignSettings,
  type CampaignPresetSettings,
  type ConversationTemplate,
} from "../../lib/creative-studio/campaign-workbench-policy";

export function useCampaignPresets(categoryId: string) {
  const [data, setData] = useState<any>({ presets: [], conversations: [] }),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const request = useRef<Promise<any> | null>(null),
    loaded = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function load(force = false) {
    if (request.current) return request.current;
    if (loaded.current && !force) return data;
    setLoading(true);
    setError("");
    const work = studioRequest("/campaign-presets/" + categoryId)
      .then((value) => {
        if (alive.current) {
          setData(value);
          loaded.current = true;
        }
        return value;
      })
      .catch((e) => {
        if (alive.current) setError(e.message);
        throw e;
      })
      .finally(() => {
        request.current = null;
        if (alive.current) setLoading(false);
      });
    request.current = work;
    return work;
  }
  return { data, setData, loading, error, load };
}
export function StudioCampaignPresetPicker({
  categoryId,
  form,
  onApply,
  store,
  disabled = false,
}: {
  categoryId: string;
  form: Record<string, any>;
  onApply: (settings: CampaignPresetSettings) => void;
  store: ReturnType<typeof useCampaignPresets>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [selected, setSelected] = useState(""),
    [saving, setSaving] = useState(false),
    [notice, setNotice] = useState("");
  const operation = useRef<{ fingerprint: string; id: string } | null>(null);
  async function save() {
    if (saving) return;
    setNotice("");
    if (!name.trim()) {
      setNotice("Escribe un nombre para guardar la configuración.");
      return;
    }
    try {
      const settings = reusableCampaignSettings(form),
        fingerprint = JSON.stringify({ name: name.trim(), settings });
      if (operation.current?.fingerprint !== fingerprint)
        operation.current = { fingerprint, id: crypto.randomUUID() };
      setSaving(true);
      const saved = await studioRequest(
        "/campaign-presets/" + categoryId,
        "POST",
        { id: operation.current.id, name: name.trim(), settings },
      );
      store.setData((old: any) => ({
        ...old,
        presets: [...old.presets.filter((p: any) => p.id !== saved.id), saved],
      }));
      setSelected(saved.id);
      setNotice("Configuración guardada: " + saved.name);
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "No se pudo guardar la configuración.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="studio-reusable-config">
      <button
        type="button"
        className="studio-reusable-toggle"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void store.load().catch(() => {});
        }}
      >
        <span>▧ Configuración guardada</span>
        <span>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="studio-reusable-body">
          <small>
            Objetivo, plataformas, ubicaciones, textos y controles de anuncios.
            El país, presupuesto y cantidades se conservan.
          </small>
          <label>
            Usar una configuración
            <select
              aria-label="Configuración de campaña guardada"
              value={selected}
              disabled={disabled || saving}
              onChange={(e) => {
                setSelected(e.target.value);
                setNotice("");
              }}
            >
              <option value="">
                {store.loading
                  ? "Cargando configuraciones…"
                  : "Selecciona por nombre"}
              </option>
              {store.data.presets.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={disabled || saving || !selected}
            onClick={() => {
              const preset = store.data.presets.find(
                (p: any) => p.id === selected,
              );
              if (preset) {
                onApply(preset.settings);
                setNotice("Configuración aplicada: " + preset.name);
              }
            }}
          >
            Aplicar configuración
          </button>
          <div className="studio-preset-save">
            <label>
              Nombre de la configuración
              <input
                aria-label="Nombre de la configuración"
                value={name}
                maxLength={80}
                placeholder="Ej. WhatsApp · Facebook e Instagram"
                disabled={disabled || saving}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="primary"
              disabled={disabled || saving}
              onClick={() => void save()}
            >
              {saving ? "Guardando…" : "Guardar configuración"}
            </button>
          </div>
          {(notice || store.error) && (
            <small role="status">{notice || store.error}</small>
          )}
        </div>
      )}
    </section>
  );
}
export function StudioConversationEditor({
  categoryId,
  value,
  onChange,
  store,
  disabled = false,
}: {
  categoryId: string;
  value?: ConversationTemplate;
  onChange: (v: ConversationTemplate | undefined) => void;
  store: ReturnType<typeof useCampaignPresets>;
  disabled?: boolean;
}) {
  const [saving, setSaving] = useState(false),
    [notice, setNotice] = useState("");
  const pending = useRef<{ fingerprint: string; id: string } | null>(null);
  const edit = (key: keyof ConversationTemplate, text: string) =>
    onChange({
      ...(value ?? {
        name: "",
        greeting: "Hola, gracias por escribirnos.",
        autofill: "Quiero información sobre {diplomado}.",
      }),
      [key]: text,
    });
  async function save() {
    if (!value || saving) return;
    setSaving(true);
    setNotice("");
    try {
      const fingerprint = JSON.stringify(value);
      if (pending.current?.fingerprint !== fingerprint)
        pending.current = { fingerprint, id: crypto.randomUUID() };
      const saved = await studioRequest(
        "/conversation-presets/" + categoryId,
        "POST",
        {
          id: pending.current.id,
          name: value.name,
          settings: { greeting: value.greeting, autofill: value.autofill },
        },
      );
      store.setData((old: any) => ({
        ...old,
        conversations: [
          ...old.conversations.filter((p: any) => p.id !== saved.id),
          saved,
        ],
      }));
      setNotice("Guardada en esta plataforma: " + saved.name);
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "No se pudo guardar la plantilla.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="studio-conversation-editor">
      <div className="studio-inline-heading">
        <strong>Plantilla de conversación</strong>
        <button
          type="button"
          disabled={disabled || store.loading}
          onClick={() => void store.load(true).catch(() => {})}
        >
          {store.loading ? "Cargando…" : "Buscar en plataforma"}
        </button>
      </div>
      <select
        aria-label="Plantilla de conversación"
        disabled={disabled}
        value={
          value
            ? (store.data.conversations.find(
                (p: any) =>
                  p.name === value.name &&
                  p.greeting === value.greeting &&
                  p.autofill === value.autofill,
              )?.id ?? "custom")
            : ""
        }
        onFocus={() => {
          void store.load().catch(() => {});
        }}
        onChange={(e) => {
          if (!e.target.value) onChange(undefined);
          else if (e.target.value === "custom")
            onChange({
              name: "Nueva plantilla",
              greeting: "Hola, gracias por escribirnos.",
              autofill: "Quiero información sobre {diplomado}.",
            });
          else {
            const v = store.data.conversations.find(
              (p: any) => p.id === e.target.value,
            );
            if (v)
              onChange({
                name: v.name,
                greeting: v.greeting,
                autofill: v.autofill,
              });
          }
        }}
      >
        <option value="">Sin plantilla personalizada</option>
        <option value="custom">＋ Crear o editar plantilla</option>
        <optgroup label="Guardadas en esta plataforma">
          {store.data.conversations.map((p: any) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
      </select>
      <small className="hint">
        Guardadas aquí · No se sincronizan con la biblioteca de Meta.
      </small>
      {value && (
        <div className="studio-conversation-fields">
          <label>
            Nombre de la plantilla
            <input
              aria-label="Nombre de la plantilla"
              value={value.name}
              maxLength={80}
              disabled={disabled}
              onChange={(e) => edit("name", e.target.value)}
            />
          </label>
          <label>
            Saludo de tu negocio
            <textarea
              aria-label="Saludo de la conversación"
              value={value.greeting}
              maxLength={1024}
              disabled={disabled}
              onChange={(e) => edit("greeting", e.target.value)}
            />
          </label>
          <label>
            Mensaje inicial del interesado
            <textarea
              aria-label="Mensaje inicial del interesado"
              value={value.autofill}
              maxLength={80}
              disabled={disabled}
              onChange={(e) => edit("autofill", e.target.value)}
            />
            <small>
              {value.autofill.length}/80 · Puedes usar [diplomado] y [pais].
            </small>
          </label>
          <button
            type="button"
            disabled={
              disabled ||
              saving ||
              !value.name.trim() ||
              !value.greeting.trim() ||
              !value.autofill.trim()
            }
            onClick={() => void save()}
          >
            {saving ? "Guardando…" : "Guardar en plataforma"}
          </button>
          <div className="studio-conversation-preview">
            <span>{value.greeting || "Saludo del negocio"}</span>
            <span>{value.autofill || "Mensaje del interesado"}</span>
          </div>
        </div>
      )}
      <small>Bienvenida para tus anuncios de WhatsApp.</small>
      {(notice || store.error) && (
        <small role="status">{notice || store.error}</small>
      )}
    </section>
  );
}
