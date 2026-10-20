"use client";
import { useCallback, useEffect, useState } from "react";
export type Engine = "ai" | "propiox" | "hybrid";
export type EngineConfig = {
  aiEnabled: boolean;
  propioxEnabled: boolean;
  defaultEngine: Engine;
  quality: string;
  resolution: string;
  revision: number;
};
export async function engineRequest(
  path: string,
  method = "GET",
  data?: unknown,
) {
  const r = await fetch("/api/" + path, {
    method,
    cache: "no-store",
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  const b = await r.json();
  if (!r.ok) throw Error(b.error ?? "No se pudo completar la operación.");
  return b;
}
export function useGenerationEngine() {
  const [config, setConfig] = useState<EngineConfig | null>(null),
    [engine, setEngine] = useState<Engine | undefined>(),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const next = await engineRequest("engines/config");
      setConfig(next);
      setEngine((current) => current ?? next.defaultEngine);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);
  return { config, engine, setEngine, error };
}
export function EngineChoice({
  value,
  onChange,
  config,
  error,
  disabled = false,
}: {
  value: Engine | undefined;
  onChange: (v: Engine) => void;
  config: EngineConfig | null;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <div className="engine-choice">
      <label>
        Motor de generación
        <select
          aria-label="Motor de generación"
          value={value ?? ""}
          disabled={disabled || !config}
          onChange={(e) => onChange(e.target.value as Engine)}
        >
          <option value="" disabled>
            Cargando motores…
          </option>
          <option value="ai" disabled={!config?.aiEnabled}>
            IA · proveedor de Ajustes
          </option>
          <option value="propiox" disabled={!config?.propioxEnabled}>
            PropioX · sin IA
          </option>
          <option
            value="hybrid"
            disabled={!config?.aiEnabled || !config?.propioxEnabled}
          >
            PropioX + IA de apoyo
          </option>
        </select>
      </label>
      <small className="hint">
        {error ||
          (config &&
          ((value !== "propiox" && !config.aiEnabled) ||
            (value !== "ai" && !config.propioxEnabled))
            ? "Este motor está desactivado. Elige otro motor disponible o revisa Ajustes."
            : "") ||
          (!config
            ? "Consultando disponibilidad…"
            : value === "propiox"
              ? "Composición local con tus archivos y texto. Costo de API: $0. El nombre fija el tema; precisa título, oferta y precio en el prompt."
              : value === "hybrid"
                ? "Prioriza tus archivos. Una consulta breve del texto y los nombres de recursos (hasta 384 tokens de salida); sin generar fotografías por IA. Puede tener costo."
                : "Usa los modelos y parámetros de IA de Ajustes. Puede tener costo de API.")}
      </small>
    </div>
  );
}
export function PropioxSettingsFields({
  value,
  onChange,
}: {
  value: EngineConfig;
  onChange: (v: EngineConfig) => void;
}) {
  const change = (patch: Partial<EngineConfig>) =>
    onChange({ ...value, ...patch });
  return (
    <div className="stack propiox-settings">
      <label className="row">
        <input
          type="checkbox"
          checked={value.propioxEnabled}
          disabled={!value.aiEnabled}
          onChange={(e) =>
            change({
              propioxEnabled: e.target.checked,
              defaultEngine:
                !e.target.checked && value.defaultEngine !== "ai"
                  ? "ai"
                  : value.defaultEngine,
            })
          }
        />
        Habilitar PropioX · composición sin IA
      </label>
      <p className="hint">
        Combina fotos, fondos, logos y textos con diseños editables. No necesita
        clave API ni entrena un modelo. Para crear fotografías nuevas utiliza
        IA. Al elegir Sin IA, PropioX permanece habilitado.
      </p>
      {value.propioxEnabled && (
        <div className="fields">
          <label>
            Modelo propio
            <input value="PropioX" readOnly />
          </label>
          <label>
            Calidad PropioX
            <select
              value={value.quality}
              onChange={(e) => change({ quality: e.target.value })}
            >
              <option value="high">Alta · predeterminada</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
            </select>
            <small className="hint">
              Afecta la exportación local; no cambia el consumo de API.
            </small>
          </label>
          <label>
            Resolución base PropioX
            <select
              value={value.resolution}
              onChange={(e) => change({ resolution: e.target.value })}
            >
              <option value="1024x1024">1024 px</option>
              <option value="1536x1536">1536 px</option>
              <option value="2048x2048">2048 px</option>
            </select>
            <small className="hint">
              Lado corto; se adapta al formato del afiche.
            </small>
          </label>
        </div>
      )}
      <label>
        Motor predeterminado
        <select
          value={value.defaultEngine}
          onChange={(e) => change({ defaultEngine: e.target.value as Engine })}
        >
          <option value="ai" disabled={!value.aiEnabled}>
            IA
          </option>
          <option value="propiox" disabled={!value.propioxEnabled}>
            PropioX · sin IA
          </option>
          <option
            value="hybrid"
            disabled={!value.aiEnabled || !value.propioxEnabled}
          >
            PropioX + IA de apoyo
          </option>
        </select>
      </label>
      <p className="hint">
        El híbrido prioriza tus recursos; «90% / 10%» no equivale a un
        porcentaje garantizado de tokens o del precio. Los modos que requieren
        IA se bloquean si eliges Sin IA.
      </p>
    </div>
  );
}
