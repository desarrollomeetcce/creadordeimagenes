"use client";

import {
  resourceKinds,
  resourceLabels,
  updateResourceSelection,
  resourceSelectionState,
  type ResourceChoice,
} from "@/lib/courses/resources";
export function CourseResources({
  modules,
  value,
  selection,
  onChange,
  disabled,
  build,
  onStop,
  onRefresh,
}: {
  modules: { id: string; title: string }[];
  value: ResourceChoice[];
  selection: "all" | string[];
  onChange: (p: ResourceChoice[]) => void;
  disabled: boolean;
  build?: {
    status: string;
    moduleIndex: number;
    totalModules: number;
    completed: number;
    error: string | null;
  } | null;
  onStop: () => void;
  onRefresh: () => void;
}) {
  function patch(kind: ResourceChoice["kind"], data: Partial<ResourceChoice>) {
    onChange(value.map((r) => (r.kind === kind ? { ...r, ...data } : r)));
  }
  return (
    <aside className="course-resources-column">
      <h2>Recursos del curso</h2>
      <p className="muted">
        Selecciona módulos en el centro y elige sus recursos. Los demás módulos
        conservan sus opciones.
      </p>
      <p className="course-resource-target">
        Aplicar a:{" "}
        {selection === "all"
          ? "todos los módulos"
          : selection.length + " módulos seleccionados"}
      </p>
      <div className="course-resource-options">
        {resourceKinds.map((kind) => {
          const r = value.find((r) => r.kind === kind);
          const state = resourceSelectionState(r, modules, selection);
          return (
            <div
              className={
                "course-resource-option" + (state !== "none" ? " selected" : "")
              }
              key={kind}
            >
              <label className="course-resource-toggle">
                <input
                  type="checkbox"
                  checked={state === "all"}
                  ref={(node) => {
                    if (node) node.indeterminate = state === "some";
                  }}
                  disabled={
                    disabled || (selection !== "all" && !selection.length)
                  }
                  onChange={(e) => {
                    onChange(
                      updateResourceSelection(
                        value,
                        kind,
                        modules,
                        selection,
                        e.target.checked,
                      ),
                    );
                  }}
                />
                <strong>{resourceLabels[kind]}</strong>
              </label>
              {r &&
                ["guide", "workshop", "exam", "book", "infographic"].includes(
                  kind,
                ) && (
                  <details>
                    <summary>
                      {state === "some"
                        ? "Algunos seleccionados · opciones"
                        : "Opciones del recurso"}
                    </summary>
                    {["guide", "workshop", "exam", "book"].includes(kind) && (
                      <label>
                        Cantidad por módulo
                        <input
                          type="number"
                          min={1}
                          max={5}
                          value={r.count}
                          disabled={disabled}
                          onChange={(e) =>
                            patch(kind, { count: Number(e.target.value) })
                          }
                        />
                      </label>
                    )}
                    <label>
                      Indicaciones opcionales
                      <textarea
                        rows={2}
                        maxLength={2000}
                        value={r.instructions}
                        disabled={disabled}
                        onChange={(e) =>
                          patch(kind, { instructions: e.target.value })
                        }
                      />
                    </label>
                  </details>
                )}
            </div>
          );
        })}
      </div>
      <p className="course-resource-note">
        La videoclase grabada usa voz con diapositivas, pizarra animada o demostración. Podrás
        verla y exportarla. Las ilustraciones y escenas de video IA son
        adicionales y pueden generar cargos por escena.
      </p>
      <button
        type="submit"
        form="course-settings-form"
        data-action="develop"
        className="course-primary course-build-button"
        disabled={
          disabled ||
          !value.length ||
          (selection !== "all" && !selection.length)
        }
      >
        {modules.length
          ? selection === "all"
            ? "✦ Desarrollar curso completo"
            : "✦ Desarrollar selección"
          : "✦ Generar temario y desarrollar curso"}
      </button>
      <small>
        Usa el prompt general y conserva lo ya generado. Guardar configuración
        no consume IA; desarrollar sí puede consumir las APIs seleccionadas.
      </small>
      {build && (
        <section
          className="course-build-status"
          aria-label="Desarrollo del curso"
        >
          <strong>
            {(
              {
                PENDING: "En cola",
                RUNNING: "Desarrollando curso",
                STOPPING: "Deteniendo al finalizar la solicitud",
                COMPLETED: "Curso desarrollado",
                CANCELLED: "Desarrollo detenido",
                NEEDS_REVIEW: "Revisar desarrollo",
                DISPATCH_UNCERTAIN: "Inicio sin confirmar",
              } as Record<string, string>
            )[build.status] ?? build.status}
          </strong>
          <p>
            {build.moduleIndex} de {build.totalModules} módulos completos ·{" "}
            {build.completed} tareas terminadas
          </p>
          {build.error && <p role="alert">{build.error}</p>}
          {["PENDING", "RUNNING", "STOPPING"].includes(build.status) && (
            <button
              type="button"
              onClick={onStop}
              disabled={build.status === "STOPPING"}
            >
              Detener después de esta solicitud
            </button>
          )}
          <button type="button" onClick={onRefresh}>
            Actualizar estado
          </button>
        </section>
      )}
    </aside>
  );
}
