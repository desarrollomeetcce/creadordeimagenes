"use client";
import dynamic from "next/dynamic";
import {
  useId,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  settingsSchema,
  lessonSchema,
  styleLabels,
  styles,
  type CourseSettings,
  type Lesson,
} from "@/lib/courses/schema";
import {
  type CourseGroupId,
  audienceLabels,
  courseGroup,
} from "@/lib/courses/teaching";
import { CourseStudioColumns } from "./course-studio-columns";
import { CourseResources } from "./course-resources";
import {
  defaultResources,
  resourceLabels,
  withoutResourceModule,
  type ResourceChoice,
} from "@/lib/courses/resources";
import { CourseLibrary } from "./course-library";
import {
  defaultCategories,
  type LibraryCategory,
  type LibraryHandle,
} from "@/lib/courses/library-shared";
import { parseCourseOutline } from "@/lib/courses/outline";
import "./courses-ai.css";
import "./course-studio.css";
const CoursePlayer = dynamic(
  () => import("./course-player").then((m) => m.CoursePlayer),
  { loading: () => <p role="status">Preparando presentación…</p> },
);
const CourseReferences = dynamic(
  () => import("./course-references").then((m) => m.CourseReferences),
  { loading: () => <p role="status">Abriendo referencias…</p> },
);
type Provider = {
  provider: string;
  maskedKey: string;
  verifiedAt: string | null;
  models: {
    id: string;
    name: string;
    kind: string;
    options?: { resolutions: string[]; durations: number[]; aspects: string[] };
  }[];
  voices: { id: string; name: string }[];
};
type Material = {
  revision: number;
  id: string;
  title: string;
  kind: string;
  instructions: string;
  content: { sections?: { title: string; body: string }[]; answerKey?: string };
};
type Module = {
  lessonReady?: boolean;
  materialCount?: number;
  id: string;
  title: string;
  brief: string;
  minutes: number;
  style: string;
  mixStyles?: boolean | null;
  revision: number;
  lesson: unknown;
  materials: Material[];
  assets: { id: string; revision: number; scene: number; kind: string }[];
};
type Course = {
  description: string;
  id: string;
  title: string;
  kind: string;
  prompt: string;
  revision: number;
  settings: CourseSettings;
  modules: Module[];
  promos?: {
    id: string;
    batchId: string;
    moduleId: string | null;
    scope: string;
    title: string;
    seconds: number;
    status: string;
    error: string | null;
  }[];
  build?: {
    id: string;
    status: string;
    moduleIndex: number;
    totalModules: number;
    completed: number;
    error: string | null;
  };
  tasks: {
    id: string;
    kind: string;
    status: string;
    error: string | null;
    canResume?: boolean;
  }[];
};
const labels: Record<string, string> = {
  VIDEO: "Escena de video",
  PROMO_SCRIPT: "Guion promocional",
  PROMO_SPEECH: "Voz del clip",
  RENDERING: "Procesando video",
  OUTLINE: "Temario",
  LESSON: "Módulo",
  MATERIAL: "Material",
  SPEECH: "Narración",
  IMAGE: "Ilustración",
  PENDING: "En cola",
  RUNNING: "Generando",
  COMPLETED: "Listo",
  NEEDS_REVIEW: "Revisar",
  UNCERTAIN: "Revisar interrupción",
  DISPATCH_UNCERTAIN: "Inicio sin confirmar",
  CANCELLED: "Cancelado",
  bibliography: "Bibliografía",
  guide: "Guía",
  book: "Libro",
  workshop: "Taller",
  exam: "Examen",
  slides: "Diapositivas",
};
async function request(
  path: string,
  body?: unknown,
  method?: string,
  signal?: AbortSignal,
) {
  const r = await fetch("/api/courses-ai" + path, {
    method: method ?? (body ? "POST" : "GET"),
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(25000)])
      : AbortSignal.timeout(25000),
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error ?? "No se pudo completar la operación.");
  return data;
}
function Window({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const headingId = useId();
  const ref = useRef<HTMLDialogElement>(null),
    [max, setMax] = useState(false),
    [min, setMin] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (!min && !d?.open) d?.showModal();
    return () => d?.close();
  }, [min]);
  return (
    <>
      {min && (
        <button className="course-dock" onClick={() => setMin(false)}>
          ▣ {title} · Restaurar
        </button>
      )}
      <dialog
        ref={ref}
        aria-labelledby={headingId}
        className={"course-window" + (max ? " course-window-max" : "")}
        data-expanded={max}
        onCancel={(e) => {
          e.preventDefault();
          onClose();
        }}
      >
        <header>
          <h2 id={headingId}>{title}</h2>
          <div className="course-toolbar">
            <button
              type="button"
              aria-label="Minimizar ventana"
              title="Minimizar"
              onClick={() => setMin(true)}
            >
              —
            </button>
            <button
              type="button"
              aria-label={max ? "Restaurar tamaño" : "Maximizar ventana"}
              title={max ? "Restaurar" : "Maximizar"}
              onClick={() => setMax(!max)}
            >
              □
            </button>
            <button
              type="button"
              className="course-close"
              aria-label="Cerrar ventana"
              title="Cerrar"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </header>
        <div className="course-window-body">{children}</div>
      </dialog>
    </>
  );
}
function Select({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value: string | number;
  options: string[] | { value: string; label: string }[];
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value}>
        {options.map((x) =>
          typeof x === "string" ? (
            <option key={x} value={x}>
              {x}
            </option>
          ) : (
            <option key={x.value} value={x.value}>
              {x.label}
            </option>
          ),
        )}
      </select>
    </label>
  );
}
const programLabels: Record<string, string> = {
  course: "Curso",
  diploma: "Diplomado",
  program: "Programa",
  workshop: "Taller",
  seminar: "Seminario",
};
function InlineCourseField({
  label,
  value,
  display,
  placeholder,
  options,
  multiline = false,
  heading = false,
  disabled,
  save,
}: {
  label: string;
  value: string;
  display?: string;
  placeholder?: string;
  options?: Record<string, string>;
  multiline?: boolean;
  heading?: boolean;
  disabled: boolean;
  save: (value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(value),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    form = useRef<HTMLFormElement>(null),
    pending = useRef(false),
    cancelled = useRef(false);
  useEffect(() => {
    if (editing) {
      const input = form.current?.querySelector<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >("input,textarea,select");
      input?.focus();
      if (input instanceof HTMLInputElement) input.select();
    }
  }, [editing]);
  async function commit() {
    if (cancelled.current || pending.current) return;
    if (draft === value) {
      setEditing(false);
      return;
    }
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      await save(draft);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  function cancel() {
    cancelled.current = true;
    setEditing(false);
    setError("");
  }
  const button = (
    <button
      type="button"
      className={"course-inline-value" + (!value ? " is-empty" : "")}
      disabled={disabled}
      aria-label={"Editar " + label.toLowerCase()}
      title="Haz clic para editar"
      onClick={() => {
        cancelled.current = false;
        setDraft(value);
        setError("");
        setEditing(true);
      }}
    >
      {display || value || placeholder || label}
      <span aria-hidden="true" className="course-inline-pencil">
        ✎
      </span>
    </button>
  );
  if (!editing)
    return heading ? <h2 className="course-inline-title">{button}</h2> : button;
  return (
    <form
      ref={form}
      className={"course-inline-editor" + (heading ? " is-title" : "")}
      aria-label={"Editar " + label.toLowerCase()}
      onSubmit={(e) => {
        e.preventDefault();
        void commit();
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          void commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cancel();
        } else if (multiline && e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          void commit();
        }
      }}
    >
      <label className="course-inline-input">
        {label}
        {options ? (
          <select
            value={draft}
            disabled={disabled || saving}
            onChange={(e) => setDraft(e.target.value)}
          >
            {Object.entries(options).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ) : multiline ? (
          <textarea
            rows={2}
            maxLength={1000}
            value={draft}
            disabled={disabled || saving}
            onChange={(e) => setDraft(e.target.value)}
          />
        ) : (
          <input
            required={heading}
            maxLength={heading ? 200 : 200}
            value={draft}
            disabled={disabled || saving}
            onChange={(e) => setDraft(e.target.value)}
          />
        )}
      </label>
      <div className="course-inline-actions">
        <button
          type="submit"
          disabled={disabled || saving}
          aria-label={"Guardar " + label.toLowerCase()}
          title="Guardar"
        >
          {saving ? "…" : "✓"}
        </button>
        <button
          type="button"
          disabled={saving}
          aria-label={"Cancelar " + label.toLowerCase()}
          title="Cancelar"
          onMouseDown={(e) => e.preventDefault()}
          onClick={cancel}
        >
          ×
        </button>
      </div>
      {error && (
        <p role="alert" className="course-inline-error">
          {error}
        </p>
      )}
    </form>
  );
}
function CourseHeading({
  course,
  groups,
  disabled,
  save,
}: {
  course: Course;
  groups: LibraryCategory[];
  disabled: boolean;
  save: (data: Record<string, string>) => Promise<void>;
}) {
  return (
    <div className="course-heading-content">
      <div className="course-heading-summary">
        <InlineCourseField
          label="Carpeta"
          value={courseGroup(course.settings)}
          display={
            groups.find((g) => g.id === courseGroup(course.settings))?.title ??
            "Categoría"
          }
          options={Object.fromEntries(groups.map((g) => [g.id, g.title]))}
          disabled={disabled}
          save={(libraryGroup) => save({ libraryGroup })}
        />
        <InlineCourseField
          label="Tipo de programa"
          value={course.kind}
          display={programLabels[course.kind] ?? course.kind}
          options={programLabels}
          disabled={disabled}
          save={(kind) => save({ kind })}
        />
      </div>
      <InlineCourseField
        heading
        label="Nombre del programa"
        value={course.title}
        disabled={disabled}
        save={(title) => save({ title })}
      />
      <div className="course-heading-description">
        <InlineCourseField
          multiline
          label="Descripción breve"
          value={course.description}
          placeholder="Añadir descripción breve"
          disabled={disabled}
          save={(description) => save({ description })}
        />
      </div>
      <div className="course-heading-audience">
        <InlineCourseField
          label="Público objetivo"
          value={course.settings.audience}
          display={"Dirigido a: " + audienceLabels[course.settings.audience]}
          options={audienceLabels}
          disabled={disabled}
          save={(audience) => save({ audience })}
        />
        <InlineCourseField
          label="Detalle del público"
          value={course.settings.audienceDetail ?? ""}
          placeholder="Añadir detalle del público"
          disabled={disabled}
          save={(audienceDetail) => save({ audienceDetail })}
        />
      </div>
      <p className="muted">
        {course.modules.length} módulos · Duración objetivo{" "}
        {course.modules.reduce((a, m) => a + m.minutes, 0)} min
      </p>
    </div>
  );
}
function CourseForm({
  course,
  providers,
  busy,
  submit,
  initialSettings,
  settingsOnly = false,
  formId,
  externalPrompt = false,
}: {
  course?: Course;
  providers: Provider[];
  busy: boolean;
  submit: (b: any, action?: string | null) => void;
  formId?: string;
  externalPrompt?: boolean;
  initialSettings?: CourseSettings;
  settingsOnly?: boolean;
}) {
  const s = settingsSchema.parse(course?.settings ?? initialSettings ?? {}),
    [provider, setProvider] = useState(s.provider),
    [voice, setVoice] = useState(s.voiceProvider),
    [image, setImage] = useState(s.imageProvider),
    [video, setVideo] = useState(s.videoProvider),
    [videoModel, setVideoModel] = useState(s.videoModel),
    [suite, setSuite] = useState<{
      version: number;
      model: string;
      imageModel: string;
      voiceModel: string;
      voiceId: string;
    } | null>(null),
    [suiteNotice, setSuiteNotice] = useState("");
  const models = (p: string, k: string) =>
      providers
        .find((x) => x.provider === p)
        ?.models.filter((m) => m.kind === k) ?? [],
    v = models(video, "video").find((m) => m.id === videoModel),
    opts = v?.options;
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      settings: Record<string, unknown> = {
        resources: s.resources,
        provider,
        voiceProvider: voice,
        imageProvider: image,
        videoProvider: video,
        videoModel,
      };
    for (const k of [
      "libraryGroup",
      "voiceMode",
      "audience",
      "audienceDetail",
      "level",
      "approach",
      "style",
      "language",
      "model",
      "tone",
      "voiceId",
      "voiceModel",
      "imageModel",
      "imageQuality",
      "videoResolution",
      "videoAspect",
      "exportResolution",
      "exportAspect",
      "promoScope",
      "promoCTA",
    ])
      settings[k] = f.get(k) ?? s[k as keyof CourseSettings];
    for (const k of [
      "moduleCount",
      "minutes",
      "voiceSpeed",
      "videoDuration",
      "promoSeconds",
    ])
      settings[k] = Number(f.get(k) ?? s[k as keyof CourseSettings]);
    settings.mixStyles = f.get("mixStyles") === "on";
    submit(
      settingsOnly
        ? { settings }
        : {
            title: course?.title,
            kind: course?.kind,
            description: course?.description,
            prompt: f.get("prompt"),
            settings,
          },
      (e.nativeEvent as SubmitEvent).submitter?.getAttribute("data-action"),
    );
  }
  const selectModels = (p: string, kind: string) => [
    { value: "", label: "Seleccionar modelo" },
    ...models(p, kind).map((m) => ({ value: m.id, label: m.name })),
  ];
  return (
    <form id={formId} className="course-form" onSubmit={save}>
      {!settingsOnly && !externalPrompt && (
        <label>
          Prompt del curso
          <textarea
            placeholder="Qué deben aprender, conocimientos previos, ejemplos y forma de explicar. El público, nivel, estilo y voz seleccionados también se envían a la IA."
            name="prompt"
            rows={4}
            maxLength={20000}
            defaultValue={course?.prompt ?? ""}
          />
        </label>
      )}
      <label className="course-mix-toggle">
        <input type="checkbox" name="mixStyles" defaultChecked={s.mixStyles} />{" "}
        Combinar formatos de video según el tema
      </label>
      <small className="muted">
        Permite alternar profesor, pizarra, código, tablas o ilustraciones.
        Describe la combinación en el prompt.
      </small>
      <div className="course-grid">
        {settingsOnly && (
          <>
            <Select
              name="audience"
              label="Público objetivo"
              value={s.audience}
              options={Object.entries(audienceLabels).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <label>
              Detalle del público · opcional
              <input
                name="audienceDetail"
                maxLength={200}
                defaultValue={s.audienceDetail}
              />
            </label>
          </>
        )}
        <Select
          name="level"
          label="Dificultad del curso"
          value={s.level}
          options={[
            { value: "basic", label: "Básico" },
            { value: "intermediate", label: "Intermedio" },
            { value: "advanced", label: "Avanzado" },
          ]}
        />
        <Select
          name="approach"
          label="Enfoque"
          value={s.approach}
          options={[
            { value: "theory", label: "Teórico" },
            { value: "practice", label: "Práctico" },
            { value: "mixed", label: "Teoría + práctica" },
          ]}
        />
        <label>
          Cantidad de módulos al generar con IA
          <input
            name="moduleCount"
            type="number"
            required
            min={1}
            max={100}
            defaultValue={s.moduleCount}
          />
        </label>
        <label>
          Minutos objetivo por módulo
          <input
            name="minutes"
            type="number"
            required
            min={1}
            max={60}
            defaultValue={s.minutes}
          />
        </label>
        <Select
          name="style"
          label="Estilo inicial"
          value={s.style}
          options={[
            { value: "per-module", label: "Se decidirá en cada módulo" },
            ...styles.map((value) => ({ value, label: styleLabels[value] })),
          ]}
        />
        <label>
          Idioma
          <select name="language" defaultValue={s.language}>
            {[
              "Español latinoamericano",
              "Español de España",
              "English",
              "Português",
              "Français",
              "Deutsch",
              "Italiano",
              "中文",
              "日本語",
              "العربية",
              ...(![
                "Español latinoamericano",
                "Español de España",
                "English",
                "Português",
                "Français",
                "Deutsch",
                "Italiano",
                "中文",
                "日本語",
                "العربية",
              ].includes(s.language)
                ? [s.language]
                : []),
            ].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          const g = providers.find((p) => p.provider === "gemini");
          const pick = (kind: string) =>
            g?.models
              .filter((m) => m.kind === kind)
              .sort(
                (a, b) =>
                  Number(/lite|fast/i.test(b.id)) -
                  Number(/lite|fast/i.test(a.id)),
              )[0]?.id ?? "";
          if (
            !pick("text") ||
            !pick("speech") ||
            !pick("image") ||
            !pick("video") ||
            !g?.voices.length
          ) {
            setSuiteNotice(
              "Consulta los modelos y voces de Google en Ajustes IA para usar la suite completa.",
            );
            return;
          }
          setProvider("gemini");
          setVoice("gemini");
          setImage("gemini");
          setVideo("gemini");
          setVideoModel(pick("video"));
          setSuite({
            version: Date.now(),
            model: pick("text"),
            imageModel: pick("image"),
            voiceModel: pick("speech"),
            voiceId: g.voices[0].id,
          });
          setSuiteNotice(
            "Google seleccionado para texto, voz, imagen y video. Revisa los modelos y guarda la configuración.",
          );
        }}
      >
        Usar Google en todo
      </button>
      {suiteNotice && <small role="status">{suiteNotice}</small>}
      <small className="muted">
        Puedes usar una suite o combinar proveedores. Cada parte utiliza el
        modelo y la clave que selecciones.
      </small>
      <details className="course-promo-options">
        <summary>Clips promocionales · opcional</summary>
        <Select
          name="promoScope"
          label="Qué clip quieres preparar"
          value={s.promoScope}
          options={[
            { value: "none", label: "Sin clips promocionales" },
            {
              value: "course",
              label: "Tráiler del diplomado / curso completo",
            },
            { value: "modules", label: "Avance de cada módulo seleccionado" },
          ]}
        />
        <label>
          Duración objetivo del clip · segundos
          <input
            type="number"
            name="promoSeconds"
            min={15}
            max={90}
            defaultValue={s.promoSeconds}
          />
        </label>
        <label>
          Llamada a la acción
          <input name="promoCTA" maxLength={300} defaultValue={s.promoCTA} />
        </label>
        <small className="muted">
          Usa los temas, el público y la voz seleccionada. El formato final se
          elige en Video. Generar el clip consume texto y voz; guardar esta
          opción no genera nada.
        </small>
        {!settingsOnly && (
          <button type="submit" data-action="promo" disabled={busy}>
            ✦ Generar clips promocionales
          </button>
        )}
      </details>
      <details open={!s.model}>
        <summary>Texto · desarrollar clases y materiales</summary>
        <div className="course-grid">
          <label>
            Proveedor
            <select
              name="contentProvider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as typeof provider)}
            >
              <option value="openai">OpenAI</option>
              <option value="gemini">Google Gemini</option>
              <option value="anthropic">Anthropic Claude</option>
              <option value="mistral">Mistral AI</option>
            </select>
          </label>
          <Select
            key={provider + String(suite?.version ?? "")}
            name="model"
            label="Modelo de texto"
            value={
              suite && provider === "gemini"
                ? suite.model
                : provider === s.provider
                  ? s.model
                  : ""
            }
            options={selectModels(provider, "text")}
          />
        </div>
      </details>
      <details>
        <summary>Voz · narrar las clases</summary>
        <Select
          name="voiceMode"
          label="Forma de narrar"
          value={s.voiceMode}
          options={[
            {
              value: "voiceover",
              label: "Voz en off · narrador fuera de pantalla",
            },
            {
              value: "teacher",
              label: "Voz del profesor · explicación en primera persona",
            },
          ]}
        />
        <p className="muted">
          Ambas opciones usan la voz elegida. Para ver al profesor, selecciona
          Profesor en pantalla y genera sus escenas de video; esta voz no
          sincroniza sus labios.
        </p>
        <div className="course-grid">
          <label>
            Proveedor
            <select
              name="voiceProvider"
              value={voice}
              onChange={(e) => setVoice(e.target.value as typeof voice)}
            >
              <option value="openai">OpenAI</option>
              <option value="gemini">Google Gemini</option>
              <option value="elevenlabs">ElevenLabs</option>
              <option value="cartesia">Cartesia / Sonic</option>
            </select>
          </label>
          <Select
            key={voice + "model" + (suite?.version ?? "")}
            name="voiceModel"
            label="Modelo de voz"
            value={
              suite && voice === "gemini"
                ? suite.voiceModel
                : voice === s.voiceProvider
                  ? s.voiceModel
                  : ""
            }
            options={selectModels(voice, "speech")}
          />
          <Select
            key={voice + "voice" + (suite?.version ?? "")}
            name="voiceId"
            label="Voz"
            value={
              suite && voice === "gemini"
                ? suite.voiceId
                : voice === s.voiceProvider
                  ? s.voiceId
                  : ""
            }
            options={[
              { value: "", label: "Seleccionar voz" },
              ...(
                providers.find((p) => p.provider === voice)?.voices ?? []
              ).map((v) => ({ value: v.id, label: v.name })),
            ]}
          />
          {voice === "openai" && (
            <label>
              Velocidad de voz · OpenAI
              <input
                type="number"
                name="voiceSpeed"
                step={0.05}
                min={0.5}
                max={2}
                defaultValue={s.voiceSpeed}
              />
            </label>
          )}
          <label>
            Tono del profesor
            <input name="tone" maxLength={300} defaultValue={s.tone} />
          </label>
        </div>
      </details>
      <details>
        <summary>Ilustraciones · opcionales</summary>
        <div className="course-grid">
          <label>
            Proveedor
            <select
              name="imageProvider"
              value={image}
              onChange={(e) => setImage(e.target.value as typeof image)}
            >
              <option value="openai">OpenAI</option>
              <option value="gemini">Google Gemini / Nano Banana</option>
              <option value="fal">fal.ai / FLUX y otros</option>
            </select>
          </label>
          <Select
            key={image + String(suite?.version ?? "")}
            name="imageModel"
            label="Modelo de imagen"
            value={
              suite && image === "gemini"
                ? suite.imageModel
                : image === s.imageProvider
                  ? s.imageModel
                  : ""
            }
            options={[
              { value: "", label: "Sin ilustraciones generadas" },
              ...models(image, "image").map((m) => ({
                value: m.id,
                label: m.name,
              })),
            ]}
          />
          {image === "openai" && (
            <Select
              name="imageQuality"
              label="Calidad de ilustración"
              value={s.imageQuality}
              options={[
                { value: "low", label: "Baja · menor costo" },
                { value: "medium", label: "Media" },
                { value: "high", label: "Alta" },
              ]}
            />
          )}
        </div>
      </details>
      <details>
        <summary>Video · escenas generadas y exportación</summary>
        <p className="muted">
          La clase puede usar diapositivas y voz. Opcionalmente puedes añadir
          escenas de video cortas creadas con IA; se generan solo cuando las
          solicitas.
        </p>
        <div className="course-grid">
          <label>
            Proveedor de escenas de video
            <select
              name="videoProvider"
              value={video}
              onChange={(e) => {
                setVideo(e.target.value as typeof video);
                setVideoModel("");
              }}
            >
              <option value="gemini">Google AI · modelos vigentes</option>
              <option value="fal">fal.ai · Wan, Kling, LTX, Veo…</option>
            </select>
          </label>
          <label>
            Modelo de video
            <select
              value={videoModel}
              onChange={(e) => setVideoModel(e.target.value)}
            >
              {selectModels(video, "video").map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <Select
            key={videoModel + "res"}
            name="videoResolution"
            label="Resolución de la escena de video"
            value={s.videoResolution}
            options={
              opts?.resolutions.length
                ? opts.resolutions
                : [{ value: "", label: "Automática del modelo" }]
            }
          />
          <Select
            key={videoModel + "duration"}
            name="videoDuration"
            label="Duración de la escena de video"
            value={s.videoDuration}
            options={
              opts?.durations.length
                ? opts.durations.map((n) => ({
                    value: String(n),
                    label: n + " segundos",
                  }))
                : [
                    {
                      value: String(s.videoDuration),
                      label: "Automática del modelo",
                    },
                  ]
            }
          />
          <Select
            key={videoModel + "aspect"}
            name="videoAspect"
            label="Formato de la escena de video"
            value={s.videoAspect}
            options={
              opts?.aspects.length
                ? opts.aspects
                : [{ value: "16:9", label: "Automático del modelo" }]
            }
          />
          <Select
            name="exportAspect"
            label="Formato de la videoclase"
            value={s.exportAspect}
            options={[
              { value: "16:9", label: "Horizontal · YouTube / cursos" },
              { value: "9:16", label: "Vertical · TikTok / Reels / Shorts" },
            ]}
          />
          <Select
            name="exportResolution"
            label="Exportación de la clase narrada"
            value={s.exportResolution}
            options={[
              { value: "720p", label: "720p · más ligera" },
              { value: "1080p", label: "1080p · más detalle" },
            ]}
          />
        </div>
      </details>
      <p className="muted">
        Las claves y los catálogos se administran en{" "}
        <a href="/?view=ai&aiTab=connections">Ajustes IA → Conexiones</a>. Solo
        se listan modelos compatibles consultados en la cuenta.
      </p>
      <div className="course-toolbar">
        <button className="course-primary" disabled={busy}>
          {busy
            ? "Guardando…"
            : settingsOnly
              ? "Guardar valores para nuevos programas"
              : "Guardar configuración"}
        </button>
        <span className="muted">Guardar no consume IA.</span>
      </div>
    </form>
  );
}
export function CourseConfiguration() {
  const [providers, setProviders] = useState<Provider[]>([]),
    [defaults, setDefaults] = useState<{
      revision: number;
      settings: CourseSettings;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    const c = new AbortController();
    void Promise.all([
      request("/providers", undefined, undefined, c.signal),
      request("/defaults", undefined, undefined, c.signal),
    ])
      .then(([p, d]) => {
        if (!c.signal.aborted) {
          setProviders(p);
          setDefaults(d);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, []);
  return (
    <div className="courses-ai">
      <h2>Parámetros de cursos</h2>
      <p className="muted">
        Valores iniciales para nuevas carpetas. Cada programa conserva su propia
        configuración; guardar aquí no modifica los anteriores.
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {defaults ? (
        <CourseForm
          key={defaults.revision}
          settingsOnly
          initialSettings={defaults.settings}
          providers={providers}
          busy={busy}
          submit={async (b) => {
            setBusy(true);
            setError("");
            try {
              const d = await request("/defaults", {
                revision: defaults.revision,
                ...b,
              });
              setDefaults(d);
              setMessage("Valores guardados para nuevos programas.");
            } catch (e) {
              setError(e instanceof Error ? e.message : "No se pudo guardar.");
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : (
        <p role="status">Cargando parámetros…</p>
      )}
    </div>
  );
}
function CreateFolder({
  defaults,
  group,
  busy,
  submit,
}: {
  defaults: CourseSettings;
  group: CourseGroupId;
  busy: boolean;
  submit: (b: unknown) => void;
}) {
  const [audience, setAudience] = useState<CourseSettings["audience"]>(
    group.startsWith("custom:")
      ? "other"
      : (group as CourseSettings["audience"]),
  );
  return (
    <form
      className="course-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        submit({
          title: f.get("title"),
          kind: f.get("kind"),
          description: f.get("description"),
          prompt: "",
          settings: {
            ...defaults,
            libraryGroup: group,
            audience,
            audienceDetail: String(f.get("audienceDetail") ?? ""),
          },
        });
      }}
    >
      <p className="muted">
        Primero crea la carpeta. Dentro podrás generar o pegar el temario y
        desarrollar cada módulo.
      </p>
      <label>
        Nombre del programa
        <input
          name="title"
          required
          maxLength={200}
          placeholder="Ej. Excel y Power BI"
        />
      </label>
      <Select
        name="kind"
        label="Tipo de programa"
        value="course"
        options={Object.entries(programLabels).map(([value, label]) => ({
          value,
          label,
        }))}
      />
      <label>
        Descripción breve
        <textarea
          name="description"
          rows={3}
          maxLength={1000}
          placeholder="Qué aprenderán y para qué les servirá."
        />
      </label>
      <label>
        Público objetivo
        <select
          value={audience}
          onChange={(e) => setAudience(e.target.value as typeof audience)}
        >
          {Object.entries(audienceLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        {audience === "other"
          ? "¿A quién va dirigido?"
          : "Edad o detalle del público · opcional"}
        <input
          name="audienceDetail"
          required={audience === "other"}
          maxLength={200}
          placeholder="Ej. 8 a 10 años, adolescentes de secundaria o ingenieros"
        />
      </label>
      <p className="muted">
        La carpeta organiza el programa. Puedes cambiar el público aquí y
        después en la cabecera, sin limitar los estilos disponibles.
      </p>
      <button disabled={busy} className="course-primary">
        {busy ? "Creando…" : "Crear carpeta del programa"}
      </button>
    </form>
  );
}
function PasteOutline({
  course,
  busy,
  save,
}: {
  course: Course;
  busy: boolean;
  save: (text: string) => void;
}) {
  const [text, setText] = useState("");
  let modules: { title: string; brief: string }[] = [],
    error = "";
  try {
    if (text.trim()) modules = parseCourseOutline(text);
  } catch (e) {
    error = e instanceof Error ? e.message : "Temario no válido";
  }
  return (
    <div className="course-inline-form">
      <h3>Pegar temario</h3>
      <p className="muted">
        Pega el temario: un módulo por línea o encabezados como «Módulo 1:
        Nombre» seguidos de su descripción. Después pulsa Desarrollar curso
        completo: la IA usará el prompt general para todos. Puedes ajustar un
        módulo si lo necesitas.
      </p>
      <label>
        Módulos
        <textarea
          rows={7}
          maxLength={30000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            "Módulo 1: Fundamentos de Excel\nTablas, fórmulas y ejercicios.\nMódulo 2: Power BI\nImportación y visualización."
          }
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {modules.length > 0 && <p>{modules.length} módulos detectados</p>}
      <button
        disabled={busy || !modules.length || !!error}
        className="course-primary"
        onClick={() => save(text)}
      >
        Usar este temario
      </button>
    </div>
  );
}
export function CoursesAI() {
  const [defaults, setDefaults] = useState<CourseSettings>(() =>
      settingsSchema.parse({}),
    ),
    [referencesShown, setReferencesShown] = useState(false),
    [outlineMode, setOutlineMode] = useState(""),
    [moduleSelection, setModuleSelection] = useState<"all" | string[]>("all"),
    [modulePage, setModulePage] = useState(1),
    [moduleSize, setModuleSize] = useState(25),
    [resources, setResources] = useState<ResourceChoice[]>(defaultResources),
    [sharing, setSharing] = useState(false),
    [owners, setOwners] = useState<
      { id: string; name: string; email: string }[] | null
    >(null),
    [newGroup, setNewGroup] = useState<CourseGroupId>("adults");
  const busyRef = useRef(false);
  const [moduleDetail, setModuleDetail] = useState<Module | null>(null);
  const [groups, setGroups] = useState<LibraryCategory[]>(defaultCategories),
    [libraryOnly, setLibraryOnly] = useState(true),
    [fullGroup, setFullGroup] = useState<CourseGroupId | "">("");
  const libraryRef = useRef<LibraryHandle>(null);
  const [providers, setProviders] = useState<Provider[]>([]),
    [selected, setSelected] = useState(""),
    [course, setCourse] = useState<Course | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [window, setWindow] = useState<
      "new" | "settings" | "connections" | "module" | null
    >(null),
    [moduleId, setModuleId] = useState(""),
    [add, setAdd] = useState(false),
    [preview, setPreview] = useState(false),
    [promoId, setPromoId] = useState("");
  useEffect(() => {
    const open = () => {
      setSharing(true);
      setOwners(null);
      void request("/access")
        .then((d) => setOwners(d.users))
        .catch((e) => setError(e.message));
    };
    globalThis.window.addEventListener("share-courses", open);
    return () => globalThis.window.removeEventListener("share-courses", open);
  }, []);
  useEffect(() => {
    setResources(course?.settings.resources ?? defaultResources);
    setModuleSelection("all");
    setModulePage(1);
  }, [course?.id]);
  const mounted = useRef(true),
    loadId = useRef(0),
    inFlight = useRef(false),
    selectedRef = useRef(selected);
  selectedRef.current = selected;
  const refreshProviders = useCallback(async () => {
    const p = await request("/providers");
    if (mounted.current) setProviders(p);
  }, []);
  const load = useCallback(async (id: string, signal?: AbortSignal) => {
    const seq = ++loadId.current;
    const c = await request("/" + id, undefined, undefined, signal);
    if (mounted.current && seq === loadId.current && selectedRef.current === id)
      setCourse(c);
  }, []);
  const refresh = useCallback(async () => {
    await libraryRef.current?.refresh(selectedRef.current || undefined);
    if (selectedRef.current) await load(selectedRef.current);
  }, [load]);
  useEffect(() => {
    mounted.current = true;
    const ac = new AbortController();
    void Promise.allSettled([
      request("/providers", undefined, undefined, ac.signal),
      request("/defaults", undefined, undefined, ac.signal),
    ]).then((results) => {
      if (!mounted.current) return;
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          if (i === 0) setProviders(r.value);
          else setDefaults(r.value.settings);
        } else
          setError(
            r.reason instanceof Error ? r.reason.message : "No se pudo cargar.",
          );
      });
      setLoading(false);
    });
    return () => {
      mounted.current = false;
      ac.abort();
      ++loadId.current;
    };
  }, []);
  useEffect(() => {
    setCourse(null);
    setPromoId("");
    setWindow(null);
    setReferencesShown(false);
    setOutlineMode("");
    setAdd(false);
    setModuleDetail(null);
    setModuleId("");
    if (!selected) return;
    const ac = new AbortController();
    setLoading(true);
    void load(selected, ac.signal)
      .catch((e) => {
        if (!ac.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [selected, load]);
  const taskState =
    course?.tasks.map((t) => t.id + ":" + t.status).join("|") ?? "";
  const building =
    !!course?.build &&
    ["PENDING", "RUNNING", "STOPPING"].includes(course.build.status);
  const promoActive =
    course?.promos?.some((p) =>
      ["PENDING", "RUNNING", "STOPPING"].includes(p.status),
    ) ?? false;
  const working =
    (building ||
      promoActive ||
      course?.tasks.some((t) =>
        ["PENDING", "RUNNING", "RENDERING"].includes(t.status),
      )) ??
    false;
  useEffect(() => {
    if (!selected || !working) return;
    const ac = new AbortController();
    const tick = async () => {
      if (document.visibilityState !== "visible" || inFlight.current) return;
      inFlight.current = true;
      try {
        const status = await request(
          "/" + selected + (building ? "/build" : "/tasks"),
          undefined,
          undefined,
          ac.signal,
        );
        const tasks = building ? status.tasks : status;
        if (
          building ||
          promoActive ||
          tasks
            .map((t: { id: string; status: string }) => t.id + ":" + t.status)
            .join("|") !== taskState
        )
          await load(selected, ac.signal);
      } catch (e) {
        if (!ac.signal.aborted)
          setError(e instanceof Error ? e.message : "No se pudo actualizar.");
      } finally {
        inFlight.current = false;
      }
    };
    const timer = setInterval(() => void tick(), 5000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      ac.abort();
    };
  }, [selected, working, taskState, load, building, promoActive]);
  async function run(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "No se pudo completar.");
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (window !== "module" || !selected || !moduleId) return;
    const ac = new AbortController();
    setModuleDetail((old) => (old?.id === moduleId ? old : null));
    void request(
      "/" + selected + "/modules/" + moduleId,
      undefined,
      undefined,
      ac.signal,
    )
      .then((m) => {
        if (!ac.signal.aborted) setModuleDetail(m);
      })
      .catch((e) => {
        if (!ac.signal.aborted) setError(e.message);
      });
    return () => ac.abort();
  }, [window, selected, moduleId, course?.revision]);
  const m = moduleDetail?.id === moduleId ? moduleDetail : null,
    parsed = m ? lessonSchema.safeParse(m.lesson) : null,
    lesson = parsed?.success ? parsed.data : null;
  async function task(
    kind: string,
    module?: Module,
    extra: Record<string, unknown> = {},
  ) {
    if (!course) return;
    await run(async () => {
      await request("/" + course.id + "/tasks", {
        requestId: crypto.randomUUID(),
        kind,
        revision: course.revision,
        ...(module ? { moduleId: module.id } : {}),
        ...extra,
      });
      await load(course.id);
    });
  }
  async function batch(kind: "LESSON" | "SPEECH") {
    if (!course) return;
    const targets =
      kind === "LESSON"
        ? course.modules
            .filter((x) => !x.lessonReady)
            .slice(0, 24)
            .map((x) => ({ moduleId: x.id }))
        : lesson && m
          ? lesson.scenes.flatMap((_, i) =>
              m.assets.some(
                (a) =>
                  a.revision === m.revision &&
                  a.scene === i &&
                  a.kind === "SPEECH",
              )
                ? []
                : [{ moduleId: m.id, scene: i }],
            )
          : [];
    if (!targets.length) return;
    if (
      !confirm(
        "¿Autorizar " +
          targets.length +
          " generaciones de " +
          (kind === "LESSON" ? "contenido" : "voz") +
          "? El proveedor puede cobrar cada solicitud.",
      )
    )
      return;
    await run(async () => {
      await request("/" + course.id + "/batch", {
        requestId: crypto.randomUUID(),
        kind,
        revision: course.revision,
        targets,
      });
      await load(course.id);
    });
  }
  function exportURL(format: string, materialId?: string, answers = false) {
    return (
      "/api/courses-ai/" +
      course!.id +
      "/modules/" +
      m!.id +
      "/export?" +
      new URLSearchParams({
        format,
        ...(materialId ? { material: materialId } : {}),
        ...(answers ? { answers: "1" } : {}),
      })
    );
  }
  async function print(materialId?: string, answers = false) {
    const popup = globalThis.window.open("", "_blank");
    if (!popup) {
      setError("Permite abrir la ventana de impresión.");
      return;
    }
    await run(async () => {
      try {
        const r = await fetch(exportURL("html", materialId, answers));
        if (!r.ok) throw Error("No se pudo preparar el documento.");
        const html = await r.text();
        popup.document.open();
        popup.document.write(html);
        popup.document.close();
        popup.focus();
        popup.print();
      } catch (e) {
        popup.close();
        throw e;
      }
    });
  }
  return (
    <section className="courses-ai">
      <CourseLibrary
        ref={libraryRef}
        api={request}
        groupsChanged={setGroups}
        selected={selected}
        disabled={busy}
        fullGroup={fullGroup}
        mode={selected && !libraryOnly ? "editor" : fullGroup ? "full" : "home"}
        select={(id) => {
          setSelected(id);
          setLibraryOnly(false);
          setError("");
        }}
        create={(id) => {
          setNewGroup(id);
          setWindow("new");
        }}
        full={(id) => {
          setFullGroup(id);
          setLibraryOnly(true);
        }}
        back={() => setLibraryOnly(false)}
      />
      {error && (
        <div className="course-error" role="alert">
          {error}
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={() => setError("")}
          >
            ×
          </button>
        </div>
      )}
      <div className="course-editor-shell" hidden={libraryOnly || !selected}>
        <main className="course-main">
          {loading ? (
            <p role="status">Cargando Cursos IA…</p>
          ) : !course ? (
            <div className="course-empty">
              <div aria-hidden="true">✦</div>
              <h2>Enseña a tu manera</h2>
              <p>
                Profesionales, niños o familias. Combina explicaciones, ejemplos
                y práctica, sin empezar desde cero.
              </p>
              <div className="course-style-grid">
                {styles.map((s) => (
                  <span key={s}>{styleLabels[s]}</span>
                ))}
              </div>
              <p className="muted">
                Elige arriba para quién crearás tu próximo programa.
              </p>
            </div>
          ) : (
            <>
              <div className="course-editor-navigation">
                <button
                  type="button"
                  onClick={() => {
                    setFullGroup(courseGroup(course.settings));
                    setLibraryOnly(true);
                  }}
                >
                  ← Biblioteca
                </button>
                <span>
                  {
                    groups.find((g) => g.id === courseGroup(course.settings))
                      ?.title
                  }
                </span>
              </div>
              <CourseStudioColumns>
                <aside className="course-sources-column course-settings-column">
                  <h2>Configuración</h2>
                  <label className="course-global-prompt" key={course.id}>
                    Prompt general del curso
                    <textarea
                      form="course-settings-form"
                      name="prompt"
                      rows={5}
                      maxLength={20000}
                      defaultValue={course.prompt}
                      placeholder="Qué deben aprender, ejemplos y cómo quieres explicarlo."
                    />
                  </label>
                  <details
                    className="course-source-details"
                    onToggle={(e) => {
                      if (e.currentTarget.open) setReferencesShown(true);
                    }}
                  >
                    <summary>Referencias · opcional</summary>
                    {referencesShown && (
                      <CourseReferences
                        key={course.id}
                        courseId={course.id}
                        disabled={busy || working}
                        changed={() => load(course.id)}
                      />
                    )}
                  </details>

                  <div className="course-inline-form">
                    <CourseForm
                      key={course.id}
                      formId="course-settings-form"
                      externalPrompt
                      course={course}
                      providers={providers}
                      busy={busy || working}
                      submit={(b, action) =>
                        void run(async () => {
                          await request("/" + course.id + "/save", {
                            revision: course.revision,
                            data: {
                              ...b,
                              settings: { ...b.settings, resources },
                            },
                          });
                          await refresh();
                          if (action === "promo") {
                            if (b.settings.promoScope === "none")
                              throw Error(
                                "Elige tráiler del curso o avances por módulo.",
                              );
                            const latest = await request("/" + course.id);
                            await request("/" + course.id + "/promos", {
                              requestId: crypto.randomUUID(),
                              revision: latest.revision,
                              scope: b.settings.promoScope,
                              modules: moduleSelection,
                              seconds: b.settings.promoSeconds,
                              cta: b.settings.promoCTA,
                            });
                            await load(course.id);
                          }
                          if (action === "develop" || action === "outline") {
                            const latest = await request("/" + course.id);
                            await request(
                              "/" +
                                course.id +
                                (action === "outline" ? "/tasks" : "/build"),
                              {
                                ...(action === "outline"
                                  ? { kind: "OUTLINE" }
                                  : {}),
                                requestId: crypto.randomUUID(),
                                revision: latest.revision,
                                ...(action === "outline"
                                  ? {}
                                  : { resources, modules: moduleSelection }),
                              },
                            );
                            setOutlineMode("");
                            await load(course.id);
                          }
                        })
                      }
                    />
                  </div>
                </aside>
                <section className="course-configuration-column">
                  <div className="course-heading">
                    <CourseHeading
                      key={course.id}
                      groups={groups}
                      course={course}
                      disabled={busy || working}
                      save={async (data) => {
                        if (busyRef.current)
                          throw Error("Espera a que termine el guardado.");
                        busyRef.current = true;
                        setBusy(true);
                        try {
                          await request("/" + course.id + "/metadata", {
                            revision: course.revision,
                            data,
                          });
                          await refresh();
                        } finally {
                          busyRef.current = false;
                          if (mounted.current) setBusy(false);
                        }
                      }}
                    />
                    <div className="course-toolbar">
                      <button
                        type="button"
                        disabled={busy || working}
                        onClick={() => setAdd(!add)}
                      >
                        ＋ Módulo
                      </button>
                    </div>
                  </div>
                  <section className="course-syllabus">
                    <div className="course-heading">
                      <div>
                        <h3>Temario</h3>
                        <p className="muted">
                          Define los módulos del programa y después desarrolla
                          cada uno.
                        </p>
                      </div>
                      <div className="course-toolbar">
                        <button
                          type="button"
                          aria-pressed={outlineMode === "ai"}
                          onClick={() => {
                            setOutlineMode("ai");
                          }}
                        >
                          ✦ Generar con IA
                        </button>
                        <button
                          type="button"
                          aria-pressed={outlineMode === "paste"}
                          onClick={() => setOutlineMode("paste")}
                        >
                          ≡ Pegar módulos
                        </button>
                      </div>
                    </div>
                    {outlineMode === "paste" && (
                      <Window
                        title="Pegar temario"
                        onClose={() => setOutlineMode("")}
                      >
                        <PasteOutline
                          course={course}
                          busy={busy || working}
                          save={(text) =>
                            void run(async () => {
                              await request(
                                "/" + course.id + "/import-modules",
                                {
                                  revision: course.revision,
                                  data: { text },
                                },
                              );
                              setOutlineMode("");
                              await refresh();
                            })
                          }
                        />
                      </Window>
                    )}
                  </section>
                  {outlineMode === "ai" && (
                    <Window
                      title="Generar temario con IA"
                      onClose={() => setOutlineMode("")}
                    >
                      <div className="course-starter">
                        <h3>Primero, el mapa de aprendizaje</h3>
                        <p>
                          La IA propondrá {course.settings.moduleCount} módulos.
                          Podrás cambiar títulos, orden y enfoque antes de
                          desarrollar el contenido.
                        </p>
                        <button
                          type="submit"
                          className="course-primary"
                          disabled={busy || working || !course.settings.model}
                          form="course-settings-form"
                          data-action="outline"
                        >
                          ✦ Generar temario
                        </button>
                        {!course.settings.model && (
                          <p>
                            Configura un modelo de contenido para generar con
                            IA.
                          </p>
                        )}
                      </div>
                    </Window>
                  )}
                  {add && (
                    <form
                      className="course-inline-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = e.currentTarget,
                          f = new FormData(form);
                        void run(async () => {
                          await request("/" + course.id + "/add-module", {
                            revision: course.revision,
                            data: {
                              title: f.get("title"),
                              brief: f.get("brief"),
                              minutes: Number(f.get("minutes")),
                              style: f.get("style"),
                              mixStyles:
                                f.get("mixStyles") === "inherit"
                                  ? null
                                  : f.get("mixStyles") === "yes",
                            },
                          });
                          setAdd(false);
                          await refresh();
                        });
                      }}
                    >
                      <h3>Añadir módulo independiente</h3>
                      <label>
                        Nombre
                        <input name="title" required maxLength={200} />
                      </label>
                      <label>
                        ¿Qué debe desarrollar?
                        <textarea name="brief" maxLength={12000} />
                      </label>
                      <div className="course-grid">
                        <label>
                          Minutos objetivo
                          <input
                            name="minutes"
                            type="number"
                            defaultValue={course.settings.minutes}
                            min={1}
                            max={60}
                            required
                          />
                        </label>
                        <Select
                          name="style"
                          label="Estilo"
                          value={course.settings.style}
                          options={styles.map((value) => ({
                            value,
                            label: styleLabels[value],
                          }))}
                        />
                      </div>
                      <div className="course-toolbar">
                        <button
                          disabled={busy || working}
                          className="course-primary"
                        >
                          Guardar módulo
                        </button>
                        <button type="button" onClick={() => setAdd(false)}>
                          Cancelar
                        </button>
                      </div>
                    </form>
                  )}
                  <div className="course-module-selection">
                    <label>
                      <input
                        type="checkbox"
                        checked={moduleSelection === "all"}
                        disabled={busy || working}
                        onChange={(e) =>
                          setModuleSelection(e.target.checked ? "all" : [])
                        }
                      />{" "}
                      Todos los módulos
                    </label>
                    <button
                      type="button"
                      disabled={busy || working}
                      onClick={() =>
                        setModuleSelection(
                          course.modules
                            .slice(
                              (modulePage - 1) * moduleSize,
                              modulePage * moduleSize,
                            )
                            .map((m) => m.id),
                        )
                      }
                    >
                      Seleccionar esta página
                    </button>
                    <span>
                      {moduleSelection === "all"
                        ? course.modules.length
                        : moduleSelection.length}{" "}
                      seleccionados
                    </span>
                    <label>
                      Ver por página
                      <select
                        value={moduleSize}
                        onChange={(e) => {
                          setModuleSize(Number(e.target.value));
                          setModulePage(1);
                        }}
                      >
                        {[25, 50, 100, 200].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="course-modules">
                    {course.modules
                      .slice(
                        (modulePage - 1) * moduleSize,
                        modulePage * moduleSize,
                      )
                      .map((mod, pageIndex) => {
                        const i = (modulePage - 1) * moduleSize + pageIndex;
                        const ready = !!mod.lessonReady;
                        return (
                          <article className="course-module-card" key={mod.id}>
                            <label className="course-module-number">
                              <input
                                type="checkbox"
                                aria-label={"Seleccionar módulo " + (i + 1)}
                                disabled={busy || working}
                                checked={
                                  moduleSelection === "all" ||
                                  moduleSelection.includes(mod.id)
                                }
                                onChange={(e) =>
                                  setModuleSelection((prev) => {
                                    const ids =
                                      prev === "all"
                                        ? course.modules.map((m) => m.id)
                                        : prev;
                                    return e.target.checked
                                      ? [...new Set([...ids, mod.id])]
                                      : ids.filter((id) => id !== mod.id);
                                  })
                                }
                              />
                              {String(i + 1).padStart(2, "0")}
                            </label>
                            <div>
                              <span className="course-tag">
                                {mod.style === "inherit"
                                  ? styleLabels[course.settings.style]
                                  : styleLabels[mod.style]}{" "}
                                · {mod.minutes} min objetivo
                              </span>
                              <h3>{mod.title}</h3>
                              <small className="course-module-resource-summary">
                                {resources
                                  .filter(
                                    (r) =>
                                      r.modules === "all" ||
                                      r.modules.includes(mod.id),
                                  )
                                  .map((r) => resourceLabels[r.kind])
                                  .join(" · ") || "Sin recursos seleccionados"}
                              </small>
                              <span
                                className={
                                  ready
                                    ? "course-status ready"
                                    : "course-status"
                                }
                              >
                                {ready
                                  ? "Contenido desarrollado"
                                  : "Por desarrollar"}{" "}
                                · {mod.materialCount ?? 0} materiales
                              </span>
                            </div>
                            <div className="course-module-actions">
                              <button
                                type="button"
                                className="course-primary"
                                onClick={() => {
                                  setModuleId(mod.id);
                                  setPreview(false);
                                  setWindow("module");
                                }}
                              >
                                ✎ Editar / ver
                              </button>
                              <button
                                type="button"
                                disabled={busy || working}
                                aria-label={"Eliminar módulo " + mod.title}
                                onClick={() => {
                                  if (
                                    !confirm(
                                      "¿Eliminar el módulo «" +
                                        mod.title +
                                        "» y sus materiales? Esta acción no se puede deshacer.",
                                    )
                                  )
                                    return;
                                  void run(async () => {
                                    const result = await request(
                                      "/" + course.id + "/modules/" + mod.id,
                                      {
                                        revision: course.revision,
                                        moduleRevision: mod.revision,
                                      },
                                      "DELETE",
                                    );
                                    setResources((prev) =>
                                      withoutResourceModule(prev, mod.id),
                                    );
                                    setModuleSelection((prev) =>
                                      prev === "all"
                                        ? prev
                                        : prev.filter((id) => id !== mod.id),
                                    );
                                    setModulePage((p) =>
                                      Math.min(
                                        p,
                                        Math.max(
                                          1,
                                          Math.ceil(
                                            (course.modules.length - 1) /
                                              moduleSize,
                                          ),
                                        ),
                                      ),
                                    );
                                    await refresh();
                                    if (result.cleanupPending)
                                      setError(
                                        "El módulo se eliminó. Algunos archivos no pudieron liberarse del almacenamiento.",
                                      );
                                  });
                                }}
                              >
                                Eliminar módulo
                              </button>
                              <div className="course-toolbar">
                                {[-1, 1].map((d) => (
                                  <button
                                    key={d}
                                    type="button"
                                    disabled={
                                      busy ||
                                      working ||
                                      i + d < 0 ||
                                      i + d >= course.modules.length
                                    }
                                    aria-label={
                                      (d === -1 ? "Subir " : "Bajar ") +
                                      mod.title
                                    }
                                    onClick={() =>
                                      void run(async () => {
                                        const ids = course.modules.map(
                                          (m) => m.id,
                                        );
                                        [ids[i], ids[i + d]] = [
                                          ids[i + d],
                                          ids[i],
                                        ];
                                        await request(
                                          "/" + course.id + "/reorder",
                                          {
                                            revision: course.revision,
                                            data: ids,
                                          },
                                        );
                                        await load(course.id);
                                      })
                                    }
                                  >
                                    {d === -1 ? "↑" : "↓"}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                  </div>
                  {course.modules.length > moduleSize && (
                    <nav
                      className="library-pagination"
                      aria-label="Páginas de módulos"
                    >
                      <button
                        disabled={modulePage === 1}
                        onClick={() => setModulePage((p) => p - 1)}
                      >
                        Anterior
                      </button>
                      <span>
                        Página {modulePage} de{" "}
                        {Math.ceil(course.modules.length / moduleSize)}
                      </span>
                      <button
                        disabled={
                          modulePage * moduleSize >= course.modules.length
                        }
                        onClick={() => setModulePage((p) => p + 1)}
                      >
                        Siguiente
                      </button>
                    </nav>
                  )}
                  {!!course.promos?.length && (
                    <details
                      className="course-promo-results"
                      open={promoActive}
                    >
                      <summary>
                        Clips promocionales ({course.promos.length})
                      </summary>
                      {course.promos.map((p) => (
                        <div key={p.id} className="course-promo-row">
                          <span>
                            <strong>{p.title}</strong>
                            <small>
                              {p.seconds} s objetivo ·{" "}
                              {labels[p.status] ?? p.status}
                            </small>
                            {p.error && <small role="alert">{p.error}</small>}
                          </span>
                          {["COMPLETED", "CANCELLED", "NEEDS_REVIEW"].includes(
                            p.status,
                          ) && (
                            <button
                              type="button"
                              onClick={() => setPromoId(p.id)}
                            >
                              Ver / exportar clip
                            </button>
                          )}
                          {[
                            "PENDING",
                            "RUNNING",
                            "DISPATCH_UNCERTAIN",
                          ].includes(p.status) && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  await request(
                                    "/" +
                                      course.id +
                                      "/promos/" +
                                      encodeURIComponent(p.batchId),
                                    undefined,
                                    "DELETE",
                                  );
                                  await load(course.id);
                                })
                              }
                            >
                              Detener clips
                            </button>
                          )}
                        </div>
                      ))}
                    </details>
                  )}
                  {course.tasks.length > 0 && (
                    <details className="course-task-list" open={working}>
                      <summary>
                        {working
                          ? "◌ Generación en curso"
                          : "Actividad de generación"}
                      </summary>
                      {course.tasks.slice(0, 12).map((t) => (
                        <div key={t.id} className="course-task">
                          <span>{labels[t.kind]}</span>
                          <strong>{labels[t.status] ?? t.status}</strong>
                          {t.canResume && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  await request(
                                    "/" +
                                      course.id +
                                      "/tasks/" +
                                      t.id +
                                      "/resume",
                                    {},
                                  );
                                  await load(course.id);
                                })
                              }
                            >
                              Recuperar video · sin generar otro
                            </button>
                          )}
                          {t.error && <p role="alert">{t.error}</p>}
                        </div>
                      ))}
                    </details>
                  )}
                  <details className="course-archive">
                    <summary>Administrar curso</summary>
                    <button
                      type="button"
                      disabled={busy || working}
                      onClick={() => {
                        if (
                          !confirm(
                            "¿Archivar «" +
                              course.title +
                              "»? Se conservarán sus módulos y recursos.",
                          )
                        )
                          return;
                        void run(async () => {
                          await request("/" + course.id + "/archive", {
                            revision: course.revision,
                          });
                          setSelected("");
                          setCourse(null);
                          await refresh();
                        });
                      }}
                    >
                      Archivar curso
                    </button>
                  </details>
                </section>
                <CourseResources
                  key={course.id}
                  modules={course.modules}
                  value={resources}
                  selection={moduleSelection}
                  onChange={setResources}
                  disabled={busy || working}
                  build={course.build}
                  onRefresh={() => void run(() => load(course.id))}
                  onStop={() =>
                    void run(async () => {
                      await request(
                        "/" + course.id + "/build",
                        undefined,
                        "DELETE",
                      );
                      await load(course.id);
                    })
                  }
                />
              </CourseStudioColumns>
            </>
          )}
        </main>
      </div>
      {promoId && course && (
        <PromoPreview
          courseId={course.id}
          id={promoId}
          onClose={() => setPromoId("")}
        />
      )}
      {sharing && (
        <Window title="Compartir Cursos IA" onClose={() => setSharing(false)}>
          <p>
            Actualmente solo los OWNER aprobados con acceso a IA pueden ver
            todas las categorías y cursos. Otros roles no tienen acceso.
          </p>
          {owners ? (
            <ul className="courses-owner-list">
              {owners.map((u) => (
                <li key={u.id}>
                  <strong>{u.name}</strong>
                  <span>{u.email}</span>
                  <small>OWNER · acceso completo</small>
                </li>
              ))}
            </ul>
          ) : (
            <p role="status">Consultando accesos…</p>
          )}
        </Window>
      )}
      {window === "new" && (
        <Window
          title={groups.find((g) => g.id === newGroup)?.create ?? "Crear curso"}
          onClose={() => setWindow(null)}
        >
          <CreateFolder
            key={newGroup}
            group={newGroup}
            defaults={defaults}
            busy={busy}
            submit={(b) =>
              void run(async () => {
                const c = await request("", b);
                setWindow(null);
                await libraryRef.current?.refresh(c.id);
                setSelected(c.id);
                setLibraryOnly(false);
              })
            }
          />
        </Window>
      )}
      {window === "module" && m && course && (
        <Window title={m.title} onClose={() => setWindow(null)}>
          <div className="course-workbench">
            <div className="course-workbench-bar">
              <span className="course-tag">
                {styleLabels[m.style] ?? styleLabels[course.settings.style]}
              </span>
              <button
                type="button"
                className="course-primary"
                disabled={busy || working || !course.settings.model}
                onClick={() => {
                  if (
                    lesson &&
                    !confirm(
                      "¿Generar una nueva versión de este módulo? La versión actual será reemplazada; el video necesitará nueva voz.",
                    )
                  )
                    return;
                  void task("LESSON", m);
                }}
              >
                {lesson
                  ? "✦ Nueva versión del contenido"
                  : "✦ Desarrollar módulo"}
              </button>
              {lesson && (
                <button type="button" onClick={() => setPreview(!preview)}>
                  {preview ? "Ocultar presentación" : "▶ Presentación y video"}
                </button>
              )}
            </div>
            <details open={!lesson}>
              <summary>Prompt y ajustes del módulo · opcional</summary>
              <form
                key={m.id + ":" + m.revision}
                className="course-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(async () => {
                    await request(
                      "/" + course.id + "/modules/" + m.id,
                      {
                        revision: m.revision,
                        data: {
                          title: f.get("title"),
                          brief: f.get("brief"),
                          minutes: Number(f.get("minutes")),
                          style: f.get("style"),
                          mixStyles:
                            f.get("mixStyles") === "inherit"
                              ? null
                              : f.get("mixStyles") === "yes",
                        },
                      },
                      "PATCH",
                    );
                    await refresh();
                  });
                }}
              >
                <label>
                  Título
                  <input
                    name="title"
                    required
                    defaultValue={m.title}
                    maxLength={200}
                  />
                </label>
                <label>
                  Prompt del módulo · opcional
                  <textarea
                    name="brief"
                    rows={4}
                    maxLength={12000}
                    defaultValue={m.brief}
                    placeholder="Indicaciones adicionales para este módulo. Si lo dejas vacío, se usa el prompt general del curso."
                  />
                </label>
                <p className="muted">
                  Este prompt añade información específica al prompt general.
                  Los documentos y enlaces se incorporan en Referencias del
                  curso, a la izquierda; los recursos se eligen a la derecha.
                </p>
                <div className="course-grid">
                  <Select
                    name="mixStyles"
                    label="Combinación de formatos"
                    value={
                      m.mixStyles == null
                        ? "inherit"
                        : m.mixStyles
                          ? "yes"
                          : "no"
                    }
                    options={[
                      { value: "inherit", label: "Usar configuración general" },
                      { value: "yes", label: "Combinar según instrucciones" },
                      { value: "no", label: "Mantener el estilo elegido" },
                    ]}
                  />
                  <Select
                    name="style"
                    label="Estilo"
                    value={m.style}
                    options={[
                      { value: "inherit", label: "Usar estilo general" },
                      ...styles.map((value) => ({
                        value,
                        label: styleLabels[value],
                      })),
                    ]}
                  />
                  <label>
                    Minutos objetivo
                    <input
                      type="number"
                      name="minutes"
                      defaultValue={m.minutes}
                      required
                      min={1}
                      max={60}
                    />
                  </label>
                </div>
                <button disabled={busy || working}>Guardar ajustes</button>
                {lesson && (
                  <p className="muted">
                    Cambiar instrucciones prepara una nueva versión; vuelve a
                    desarrollar el contenido para aplicarlas.
                  </p>
                )}
              </form>
            </details>
            {lesson && (
              <>
                {preview && (
                  <CoursePlayer
                    key={m.id + ":" + m.revision}
                    lesson={lesson}
                    assets={m.assets}
                    revision={m.revision}
                    title={m.title}
                    resolution={course.settings.exportResolution ?? "720p"}
                    aspect={course.settings.exportAspect}
                  />
                )}
                <div className="course-toolbar">
                  <button type="button" onClick={() => void print()}>
                    PDF / Imprimir
                  </button>
                  <a href={exportURL("docx")}>↓ Word</a>
                  <a href={exportURL("pptx")}>↓ PowerPoint</a>
                  <a href={exportURL("json")}>↓ Contenido JSON</a>
                  {lesson.scenes.some((s) => s.columns.length > 0) && (
                    <a href={exportURL("csv")}>↓ Tablas CSV</a>
                  )}
                  {lesson.scenes.some((s) => !!s.code) && (
                    <a href={exportURL("code")}>↓ Código</a>
                  )}
                </div>
                <details>
                  <summary>Objetivos y práctica</summary>
                  <ul>
                    {lesson.objectives.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                  <p className="course-pre">{lesson.exercise}</p>
                  <details>
                    <summary>Ver solución docente</summary>
                    <p className="course-pre">{lesson.solution}</p>
                  </details>
                </details>
                <div className="course-scenes">
                  <h3>Escenas · voz e ilustraciones</h3>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      working ||
                      !course.settings.voiceId ||
                      !course.settings.voiceModel ||
                      lesson.scenes.every((_, i) =>
                        m.assets.some(
                          (a) =>
                            a.revision === m.revision &&
                            a.scene === i &&
                            a.kind === "SPEECH",
                        ),
                      )
                    }
                    onClick={() => void batch("SPEECH")}
                  >
                    ♪ Generar voces pendientes
                  </button>
                  <p className="muted">
                    Revisa primero el contenido. Genera una voz por escena para
                    probarla y luego completa las demás. La duración final
                    depende del audio, no de los minutos objetivo. Código y
                    tablas son demostraciones simuladas; no ejecutan programas.
                  </p>
                  {lesson.scenes.map((s, i) => {
                    const audio = m.assets.find(
                        (a) =>
                          a.revision === m.revision &&
                          a.scene === i &&
                          a.kind === "SPEECH",
                      ),
                      image = m.assets.find(
                        (a) =>
                          a.revision === m.revision &&
                          a.scene === i &&
                          a.kind === "IMAGE",
                      );
                    return (
                      <details key={i}>
                        <summary>
                          {i + 1}. {s.title}{" "}
                          <span className="course-tag">
                            {styleLabels[s.kind]}
                          </span>{" "}
                          {audio ? "♪" : ""}
                        </summary>
                        <p className="course-pre">{s.narration}</p>
                        <ol>
                          {s.steps.map((s, j) => (
                            <li key={j}>{s}</li>
                          ))}
                        </ol>
                        <details>
                          <summary>Corregir esta escena sin IA</summary>
                          <form
                            key={m.revision + ":scene:" + i}
                            className="course-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const f = new FormData(e.currentTarget);
                              void run(async () => {
                                const next = {
                                  ...lesson,
                                  scenes: lesson.scenes.map((old, j) =>
                                    j === i
                                      ? {
                                          ...old,
                                          title: String(f.get("title")),
                                          narration: String(f.get("narration")),
                                          steps: String(f.get("steps"))
                                            .split("\n")
                                            .map((x) => x.trim())
                                            .filter(Boolean),
                                          code: String(f.get("code")),
                                        }
                                      : old,
                                  ),
                                };
                                await request(
                                  "/" + course.id + "/modules/" + m.id,
                                  {
                                    revision: m.revision,
                                    data: {
                                      title: m.title,
                                      brief: m.brief,
                                      minutes: m.minutes,
                                      style: m.style,
                                      mixStyles: m.mixStyles ?? null,
                                      lesson: next,
                                    },
                                  },
                                  "PATCH",
                                );
                                await refresh();
                              });
                            }}
                          >
                            <label>
                              Título
                              <input
                                name="title"
                                required
                                maxLength={180}
                                defaultValue={s.title}
                              />
                            </label>
                            <label>
                              Narración
                              <textarea
                                name="narration"
                                rows={5}
                                required
                                maxLength={4000}
                                defaultValue={s.narration}
                              />
                            </label>
                            <label>
                              Pasos · uno por línea
                              <textarea
                                name="steps"
                                rows={5}
                                required
                                defaultValue={s.steps.join("\n")}
                              />
                            </label>
                            <label>
                              Código, si corresponde
                              <textarea
                                name="code"
                                rows={4}
                                maxLength={6000}
                                defaultValue={s.code}
                              />
                            </label>
                            <button disabled={busy || working}>
                              Guardar corrección · requiere nueva voz
                            </button>
                          </form>
                        </details>
                        {s.code && <pre>{s.code}</pre>}
                        {s.columns.length > 0 && (
                          <div className="course-table-scroll">
                            <table>
                              <thead>
                                <tr>
                                  {s.columns.map((c, j) => (
                                    <th key={j}>{c}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {s.rows.map((r, j) => (
                                  <tr key={j}>
                                    {r.map((c, k) => (
                                      <td key={k}>{c}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <div className="course-toolbar">
                          {m.assets.find(
                            (a) =>
                              a.revision === m.revision &&
                              a.scene === i &&
                              a.kind === "VIDEO",
                          ) ? (
                            <video
                              controls
                              preload="none"
                              className="course-generated-video"
                              src={
                                "/api/courses-ai/assets/" +
                                m.assets.find(
                                  (a) =>
                                    a.revision === m.revision &&
                                    a.scene === i &&
                                    a.kind === "VIDEO",
                                )!.id
                              }
                            />
                          ) : (
                            <details className="course-video-action">
                              <summary>
                                Crear una escena de video con IA
                              </summary>
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const f = new FormData(e.currentTarget);
                                  void task("VIDEO", m, {
                                    scene: i,
                                    prompt: String(f.get("prompt")),
                                  });
                                }}
                              >
                                <label>
                                  Escena visual
                                  <textarea
                                    name="prompt"
                                    maxLength={4000}
                                    rows={3}
                                    required
                                    defaultValue={
                                      s.illustrationPrompt ||
                                      s.title + " — " + s.narration
                                    }
                                  />
                                </label>
                                <p className="muted">
                                  Proveedor:{" "}
                                  {course.settings.videoProvider ?? "gemini"} ·{" "}
                                  {course.settings.videoModel ||
                                    "Configura un modelo de video en el programa"}
                                  . Esta solicitud puede generar un cargo.
                                </p>
                                <button
                                  type="submit"
                                  disabled={
                                    busy ||
                                    working ||
                                    !course.settings.videoModel
                                  }
                                >
                                  Generar esta escena de video
                                </button>
                              </form>
                            </details>
                          )}
                          {audio ? (
                            <audio
                              controls
                              preload="none"
                              src={"/api/courses-ai/assets/" + audio.id}
                            />
                          ) : (
                            <button
                              type="button"
                              disabled={
                                busy ||
                                working ||
                                !course.settings.voiceId ||
                                !course.settings.voiceModel
                              }
                              onClick={() =>
                                void task("SPEECH", m, { scene: i })
                              }
                            >
                              ♪ Generar voz
                            </button>
                          )}
                          {s.illustrationPrompt && !image && (
                            <button
                              type="button"
                              disabled={
                                busy || working || !course.settings.imageModel
                              }
                              onClick={() =>
                                void task("IMAGE", m, { scene: i })
                              }
                            >
                              ✦ Generar ilustración
                            </button>
                          )}
                          {image && (
                            <a
                              href={"/api/courses-ai/assets/" + image.id}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Ver ilustración
                            </a>
                          )}
                        </div>
                      </details>
                    );
                  })}
                </div>
                <details>
                  <summary>Editar contenido y narración</summary>
                  <p className="muted">
                    El JSON permite corregir pasos, narración, código y tablas
                    sin consumir IA. Guardar crea una versión y requerirá
                    generar de nuevo su voz.
                  </p>
                  <form
                    key={"lesson:" + m.revision}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void run(async () => {
                        const edited = lessonSchema.parse(
                          JSON.parse(String(f.get("lesson"))),
                        );
                        await request(
                          "/" + course.id + "/modules/" + m.id,
                          {
                            revision: m.revision,
                            data: {
                              title: m.title,
                              brief: m.brief,
                              minutes: m.minutes,
                              style: m.style,
                              mixStyles: m.mixStyles ?? null,
                              lesson: edited,
                            },
                          },
                          "PATCH",
                        );
                        await refresh();
                      });
                    }}
                  >
                    <label>
                      Contenido estructurado
                      <textarea
                        name="lesson"
                        rows={14}
                        defaultValue={JSON.stringify(lesson, null, 2)}
                      />
                    </label>
                    <button disabled={busy || working}>
                      Guardar correcciones
                    </button>
                  </form>
                </details>
              </>
            )}
            {m.materials.length > 0 && (
              <div className="course-materials">
                <h3>Resultados del módulo</h3>
                <p className="muted">
                  Aquí puedes consultar y descargar los materiales creados.
                  Elige los recursos del módulo en la columna derecha del curso.
                </p>
                {m.materials.map((mat) => (
                  <details key={mat.id}>
                    <summary>
                      {labels[mat.kind]} · {mat.title}{" "}
                      <span className="course-tag">
                        {mat.content.sections ? "Listo" : "Por generar"}
                      </span>
                    </summary>
                    <p>{mat.instructions}</p>
                    <details>
                      <summary>Editar instrucciones y contenido</summary>
                      <form
                        key={mat.id + ":" + mat.revision}
                        className="course-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void run(async () => {
                            await request(
                              "/" +
                                course.id +
                                "/modules/" +
                                m.id +
                                "/materials/" +
                                mat.id,
                              {
                                revision: mat.revision,
                                data: {
                                  title: f.get("title"),
                                  kind: f.get("kind"),
                                  instructions: f.get("instructions"),
                                  ...(mat.content.sections
                                    ? {
                                        content: {
                                          sections: mat.content.sections.map(
                                            (old, i) => ({
                                              title: String(
                                                f.get("sectionTitle" + i),
                                              ),
                                              body: String(
                                                f.get("sectionBody" + i),
                                              ),
                                            }),
                                          ),
                                          answerKey: String(
                                            f.get("answerKey") ?? "",
                                          ),
                                        },
                                      }
                                    : {}),
                                },
                              },
                              "PATCH",
                            );
                            await refresh();
                          });
                        }}
                      >
                        <label>
                          Nombre
                          <input
                            name="title"
                            required
                            maxLength={200}
                            defaultValue={mat.title}
                          />
                        </label>
                        <Select
                          name="kind"
                          label="Tipo"
                          value={mat.kind}
                          options={[
                            "guide",
                            "book",
                            "workshop",
                            "exam",
                            "slides",
                          ].map((value) => ({ value, label: labels[value] }))}
                        />
                        <label>
                          Indicaciones del recurso
                          <textarea
                            name="instructions"
                            maxLength={8000}
                            defaultValue={mat.instructions}
                          />
                        </label>
                        {mat.content.sections?.map((s, i) => (
                          <fieldset key={i}>
                            <legend>Sección {i + 1}</legend>
                            <label>
                              Título
                              <input
                                name={"sectionTitle" + i}
                                required
                                maxLength={200}
                                defaultValue={s.title}
                              />
                            </label>
                            <label>
                              Contenido
                              <textarea
                                rows={7}
                                name={"sectionBody" + i}
                                maxLength={16000}
                                defaultValue={s.body}
                              />
                            </label>
                          </fieldset>
                        ))}
                        {mat.content.sections && (
                          <label>
                            Solucionario del docente
                            <textarea
                              name="answerKey"
                              maxLength={16000}
                              rows={4}
                              defaultValue={mat.content.answerKey ?? ""}
                            />
                          </label>
                        )}
                        <button disabled={busy || working}>
                          Guardar material · sin consumir IA
                        </button>
                      </form>
                    </details>
                    <div className="course-toolbar">
                      <button
                        type="button"
                        disabled={busy || working || !course.settings.model}
                        onClick={() => {
                          if (
                            mat.content.sections &&
                            !confirm("¿Volver a generar este material?")
                          )
                            return;
                          void task("MATERIAL", m, { materialId: mat.id });
                        }}
                      >
                        ✦{" "}
                        {mat.content.sections
                          ? "Regenerar"
                          : "Generar material"}
                      </button>
                      {mat.content.sections && (
                        <>
                          <button
                            type="button"
                            onClick={() => void print(mat.id)}
                          >
                            PDF / Imprimir
                          </button>
                          <a href={exportURL("docx", mat.id)}>↓ Word</a>
                          {mat.kind === "slides" && (
                            <a href={exportURL("pptx", mat.id)}>↓ PowerPoint</a>
                          )}
                          {mat.content.answerKey && (
                            <button
                              type="button"
                              onClick={() => void print(mat.id, true)}
                            >
                              PDF con solucionario
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    {mat.content.sections?.map((s, i) => (
                      <section key={i}>
                        <h4>{s.title}</h4>
                        <p className="course-pre">{s.body}</p>
                      </section>
                    ))}
                  </details>
                ))}
              </div>
            )}
            {working && (
              <p role="status" className="course-status">
                ◌ Hay una generación en curso. Puedes minimizar esta ventana.
              </p>
            )}
          </div>
        </Window>
      )}
    </section>
  );
}

function PromoPreview({
  courseId,
  id,
  onClose,
}: {
  courseId: string;
  id: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const ac = new AbortController();
    void request(
      "/" + courseId + "/promos/" + id,
      undefined,
      undefined,
      ac.signal,
    )
      .then(setData)
      .catch((e) => {
        if (!ac.signal.aborted) setError(e.message);
      });
    return () => ac.abort();
  }, [courseId, id]);
  const parsed = lessonSchema.safeParse(data?.lesson);
  return (
    <Window title={data?.title ?? "Clip promocional"} onClose={onClose}>
      {error && <p role="alert">{error}</p>}
      {data && parsed.success ? (
        <CoursePlayer
          title={data.title}
          lesson={parsed.data}
          assets={data.assets}
          revision={data.revision}
          aspect={data.settings.exportAspect}
          resolution={data.settings.exportResolution}
        />
      ) : (
        <p role="status">
          {data
            ? "El guion del clip aún no está disponible. Revisa la actividad del curso."
            : "Abriendo clip…"}
        </p>
      )}
    </Window>
  );
}
