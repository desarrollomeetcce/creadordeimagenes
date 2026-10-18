"use client";
import {
  reasoningLevel,
  type DesignMode,
  type ReasoningLevel,
} from "../../lib/creative-level";
export function CreativeFinish({
  designMode,
  reasoning,
  onChange,
  label = "Acabado del afiche",
}: {
  designMode?: DesignMode;
  reasoning?: ReasoningLevel;
  label?: string;
  onChange: (mode: DesignMode, level: ReasoningLevel) => void;
}) {
  return (
    <label>
      {label}
      <select
        value={
          designMode === "editable" ? "editable" : reasoningLevel(reasoning)
        }
        onChange={(event) => {
          const value = event.target.value;
          onChange(
            value === "editable" ? "editable" : "professional",
            value === "editable" ? "medium" : reasoningLevel(value),
          );
        }}
      >
        <option value="editable">Canva · más editable</option>
        <option value="low">Bajo · bajo razonamiento</option>
        <option value="medium">Medio · mejor razonamiento (recomendado)</option>
        <option value="high">Alto · buen razonamiento</option>
      </select>
      <small>
        {designMode === "editable"
          ? "Canva: fondo, textos y logos por separado para moverlos y editarlos. Si las capas no son utilizables, se conserva el afiche como imagen completa. No conecta con Canva."
          : "Bajo y Medio también generan afiches profesionales. Bajo usa directamente tus instrucciones para reducir consumo. Medio es el acabado habitual: la IA diseña el afiche completo según tu prompt. Alto es opcional: dedica más análisis y puede tardar y consumir más. Si defines el título y los textos comerciales con etiquetas o bloques, se componen como texto nítido y editable. Otros resultados integran los textos en la imagen y permiten edición con IA o elementos añadidos."}{" "}
        El nivel de razonamiento se aplica cuando el modelo lo admite.
      </small>
    </label>
  );
}
