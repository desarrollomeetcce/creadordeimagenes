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
import { parseCourseOutline } from "@/lib/courses/outline";
import "./courses-ai.css";
const CoursePlayer = dynamic(
  () => import("./course-player").then((m) => m.CoursePlayer),
  { loading: () => <p role="status">Preparando presentación…</p> },
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
  tasks: {
    id: string;
    kind: string;
    status: string;
    error: string | null;
    canResume?: boolean;
  }[];
};
type Summary = {
  description: string;
  settings: CourseSettings;
  id: string;
  title: string;
  kind: string;
  _count: { modules: number };
};
const labels: Record<string, string> = {
  VIDEO: "Clip de video",
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
const audienceLabels: Record<string, string> = {
  professionals: "Profesionales y técnicos",
  children: "Niños",
  families: "Padres y familias",
  other: "Otro público",
};
function audienceText(s: CourseSettings) {
  return s.audience === "other"
    ? s.audienceDetail || "Otro público"
    : audienceLabels[s.audience];
}
function CourseForm({
  course,
  providers,
  busy,
  submit,
  initialSettings,
  settingsOnly = false,
}: {
  course?: Course;
  providers: Provider[];
  busy: boolean;
  submit: (b: any) => void;
  initialSettings?: CourseSettings;
  settingsOnly?: boolean;
}) {
  const s = settingsSchema.parse(course?.settings ?? initialSettings ?? {}),
    [provider, setProvider] = useState(s.provider),
    [voice, setVoice] = useState(s.voiceProvider),
    [image, setImage] = useState(s.imageProvider),
    [video, setVideo] = useState(s.videoProvider),
    [videoModel, setVideoModel] = useState(s.videoModel);
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
        provider,
        voiceProvider: voice,
        imageProvider: image,
        videoProvider: video,
        videoModel,
      };
    for (const k of [
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
    ])
      settings[k] = f.get(k) ?? s[k as keyof CourseSettings];
    for (const k of ["moduleCount", "minutes", "voiceSpeed", "videoDuration"])
      settings[k] = Number(f.get(k) ?? s[k as keyof CourseSettings]);
    submit(
      settingsOnly
        ? { settings }
        : {
            title: f.get("title"),
            kind: f.get("kind"),
            description: f.get("description"),
            prompt: f.get("prompt"),
            settings,
          },
    );
  }
  const selectModels = (p: string, kind: string) => [
    { value: "", label: "Seleccionar modelo" },
    ...models(p, kind).map((m) => ({ value: m.id, label: m.name })),
  ];
  return (
    <form className="course-form" onSubmit={save}>
      {!settingsOnly && (
        <details>
          <summary>Datos de la carpeta</summary>
          <div className="course-grid">
            <label>
              Nombre
              <input
                required
                name="title"
                maxLength={200}
                defaultValue={course?.title ?? ""}
              />
            </label>
            <Select
              name="kind"
              label="Tipo de programa"
              value={course?.kind ?? "course"}
              options={Object.entries(programLabels).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </div>
          <label>
            Descripción breve
            <textarea
              name="description"
              rows={2}
              maxLength={1000}
              defaultValue={course?.description ?? ""}
            />
          </label>
        </details>
      )}
      {!settingsOnly && (
        <label>
          Objetivo o instrucciones del temario
          <textarea
            name="prompt"
            rows={4}
            maxLength={20000}
            defaultValue={course?.prompt ?? ""}
            placeholder="¿Qué deben aprender y practicar? También puedes pegar tus módulos más abajo."
          />
        </label>
      )}
      <div className="course-grid">
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
            placeholder="Edad, especialidad o público personalizado"
          />
        </label>
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
            max={24}
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
          options={styles.map((value) => ({
            value,
            label: styleLabels[value],
          }))}
        />
        <label>
          Idioma
          <input
            name="language"
            required
            maxLength={60}
            defaultValue={s.language}
          />
        </label>
      </div>
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
            </select>
          </label>
          <Select
            key={provider}
            name="model"
            label="Modelo de texto"
            value={provider === s.provider ? s.model : ""}
            options={selectModels(provider, "text")}
          />
        </div>
      </details>
      <details>
        <summary>Voz · narrar las clases</summary>
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
            </select>
          </label>
          <Select
            key={voice + "model"}
            name="voiceModel"
            label="Modelo de voz"
            value={voice === s.voiceProvider ? s.voiceModel : ""}
            options={selectModels(voice, "speech")}
          />
          <Select
            key={voice + "voice"}
            name="voiceId"
            label="Voz"
            value={voice === s.voiceProvider ? s.voiceId : ""}
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
            </select>
          </label>
          <Select
            key={image}
            name="imageModel"
            label="Modelo de imagen"
            value={image === s.imageProvider ? s.imageModel : ""}
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
        <summary>Video · clips generados y exportación</summary>
        <p className="muted">
          La presentación narrada funciona sin un modelo de video. Los clips con
          IA se generan por escena, solo al solicitarlos. Los modelos de
          imágenes no aparecen aquí.
        </p>
        <div className="course-grid">
          <label>
            Proveedor de clips
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
            label="Resolución del clip"
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
            label="Duración objetivo del clip"
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
            label="Formato del clip"
            value={s.videoAspect}
            options={
              opts?.aspects.length
                ? opts.aspects
                : [{ value: "16:9", label: "Automático del modelo" }]
            }
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
              : "Guardar objetivo y parámetros"}
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
  busy,
  submit,
}: {
  defaults: CourseSettings;
  busy: boolean;
  submit: (b: unknown) => void;
}) {
  const [audience, setAudience] = useState(defaults.audience);
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
      {audience === "other" && (
        <label>
          ¿A quién va dirigido?
          <input
            name="audienceDetail"
            required
            maxLength={200}
            placeholder="Describe tu público"
          />
        </label>
      )}
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
        Un módulo por línea, o encabezados como «Módulo 1: Nombre» seguidos de
        su descripción. Se añaden al programa; no reemplazan los existentes.
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
        Crear módulos del temario · sin IA
      </button>
    </div>
  );
}
export function CoursesAI() {
  const [defaults, setDefaults] = useState<CourseSettings>(() =>
      settingsSchema.parse({}),
    ),
    [settingsShown, setSettingsShown] = useState(false),
    [outlineMode, setOutlineMode] = useState("ai");
  const busyRef = useRef(false);
  const [moduleDetail, setModuleDetail] = useState<Module | null>(null);
  const [list, setList] = useState<Summary[]>([]),
    [providers, setProviders] = useState<Provider[]>([]),
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
    [material, setMaterial] = useState(false),
    [preview, setPreview] = useState(false);
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
    const rows = await request("");
    if (mounted.current) setList(rows);
    if (selectedRef.current) await load(selectedRef.current);
  }, [load]);
  useEffect(() => {
    mounted.current = true;
    const ac = new AbortController();
    void Promise.allSettled([
      request("", undefined, undefined, ac.signal),
      request("/providers", undefined, undefined, ac.signal),
      request("/defaults", undefined, undefined, ac.signal),
    ]).then((results) => {
      if (!mounted.current) return;
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          if (i === 0) setList(r.value);
          else if (i === 1) setProviders(r.value);
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
    setWindow(null);
    setSettingsShown(false);
    setOutlineMode("ai");
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
  const working =
    course?.tasks.some((t) =>
      ["PENDING", "RUNNING", "RENDERING"].includes(t.status),
    ) ?? false;
  useEffect(() => {
    if (!selected || !working) return;
    const ac = new AbortController();
    const tick = async () => {
      if (document.visibilityState !== "visible" || inFlight.current) return;
      inFlight.current = true;
      try {
        const tasks = await request(
          "/" + selected + "/tasks",
          undefined,
          undefined,
          ac.signal,
        );
        if (
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
  }, [selected, working, taskState, load]);
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
      <div className="course-hero">
        <div>
          <span className="course-eyebrow">ESTUDIO EDUCATIVO · OWNER</span>
          <h1>
            Cursos IA <span>✦</span>
          </h1>
          <p>De tu idea a una experiencia para aprender.</p>
        </div>
        <div className="course-toolbar">
          <a
            className="course-settings-link"
            href="/?view=ai&aiTab=connections"
          >
            ⚙ Ajustes IA
          </a>
          <button
            type="button"
            className="course-primary"
            onClick={() => setWindow("new")}
          >
            ＋ Crear curso
          </button>
        </div>
      </div>
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
      <div className="course-layout">
        <aside className="course-directory">
          <div className="course-toolbar">
            <h2>Mis cursos</h2>
            <button
              type="button"
              aria-label="Actualizar cursos"
              disabled={busy}
              onClick={() => void run(refresh)}
            >
              ↻
            </button>
          </div>
          {list.map((c) => (
            <button
              type="button"
              key={c.id}
              className={
                selected === c.id ? "course-course selected" : "course-course"
              }
              aria-pressed={selected === c.id}
              onClick={() => {
                setSelected(c.id);
                setError("");
              }}
            >
              <strong>
                <span aria-hidden="true">📁 </span>
                {c.title}
              </strong>
              <small className="course-folder-description">
                {c.description}
              </small>
              <span className="course-audience">
                {audienceText(c.settings)}
              </span>
              <span>
                {programLabels[c.kind] ?? c.kind} · {c._count.modules} módulos
              </span>
            </button>
          ))}
          {!list.length && !loading && (
            <p className="muted">Tu próximo curso empieza con una idea.</p>
          )}
        </aside>
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
              <button
                className="course-primary"
                type="button"
                onClick={() => setWindow("new")}
              >
                Crear mi primer curso
              </button>
            </div>
          ) : (
            <>
              <div className="course-heading">
                <div>
                  <span className="course-tag">
                    {programLabels[course.kind] ?? course.kind}
                  </span>
                  <h2>{course.title}</h2>
                  <p>{course.description}</p>
                  <span className="course-tag">
                    Dirigido a: {audienceText(course.settings)}
                  </span>
                  <p className="muted">
                    {course.modules.length} módulos · Duración objetivo{" "}
                    {course.modules.reduce((a, m) => a + m.minutes, 0)} min
                  </p>
                </div>
                <div className="course-toolbar">
                  <button
                    type="button"
                    disabled={busy || working}
                    onClick={() => setSettingsShown(!settingsShown)}
                  >
                    Configurar
                  </button>
                  <button
                    type="button"
                    disabled={busy || working}
                    onClick={() => setAdd(!add)}
                  >
                    ＋ Módulo
                  </button>
                  {course.modules.some((x) => !x.lessonReady) && (
                    <button
                      type="button"
                      className="course-primary"
                      disabled={
                        busy ||
                        working ||
                        settingsShown ||
                        !course.settings.model
                      }
                      title="Procesar hasta 24 módulos pendientes por lote"
                      onClick={() => void batch("LESSON")}
                    >
                      ✦ Desarrollar módulos pendientes
                    </button>
                  )}
                </div>
              </div>
              <section className="course-syllabus">
                <div className="course-heading">
                  <div>
                    <h3>Temario</h3>
                    <p className="muted">
                      Define los módulos del programa y después desarrolla cada
                      uno.
                    </p>
                  </div>
                  <div className="course-toolbar">
                    <button
                      type="button"
                      aria-pressed={outlineMode === "ai"}
                      onClick={() => {
                        setOutlineMode("ai");
                        setSettingsShown(true);
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
                {settingsShown && (
                  <div className="course-inline-form">
                    <CourseForm
                      key={course.id + ":" + course.revision}
                      course={course}
                      providers={providers}
                      busy={busy || working}
                      submit={(b) =>
                        void run(async () => {
                          await request("/" + course.id + "/save", {
                            revision: course.revision,
                            data: b,
                          });
                          setSettingsShown(false);
                          await refresh();
                        })
                      }
                    />
                  </div>
                )}
                {outlineMode === "paste" && (
                  <PasteOutline
                    course={course}
                    busy={busy || working}
                    save={(text) =>
                      void run(async () => {
                        await request("/" + course.id + "/import-modules", {
                          revision: course.revision,
                          data: { text },
                        });
                        setOutlineMode("ai");
                        await refresh();
                      })
                    }
                  />
                )}
              </section>
              {!course.modules.length && outlineMode === "ai" && (
                <div className="course-starter">
                  <h3>Primero, el mapa de aprendizaje</h3>
                  <p>
                    La IA propondrá {course.settings.moduleCount} módulos.
                    Podrás cambiar títulos, orden y enfoque antes de desarrollar
                    el contenido.
                  </p>
                  <button
                    type="button"
                    className="course-primary"
                    disabled={
                      busy || working || settingsShown || !course.settings.model
                    }
                    onClick={() => void task("OUTLINE")}
                  >
                    ✦ Generar temario
                  </button>
                  {settingsShown && (
                    <p className="muted">
                      Guarda primero el objetivo y los parámetros que estás
                      editando.
                    </p>
                  )}
                  {!course.settings.model && (
                    <p>Configura un modelo de contenido para generar con IA.</p>
                  )}
                </div>
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
              <div className="course-modules">
                {course.modules.map((mod, i) => {
                  const ready = !!mod.lessonReady;
                  return (
                    <article className="course-module-card" key={mod.id}>
                      <span className="course-module-number">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <span className="course-tag">
                          {styleLabels[mod.style]} · {mod.minutes} min objetivo
                        </span>
                        <h3>{mod.title}</h3>
                        <p>{mod.brief}</p>
                        <span
                          className={
                            ready ? "course-status ready" : "course-status"
                          }
                        >
                          {ready ? "Contenido desarrollado" : "Por desarrollar"}{" "}
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
                            setMaterial(false);
                            setWindow("module");
                          }}
                        >
                          Abrir módulo →
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
                                (d === -1 ? "Subir " : "Bajar ") + mod.title
                              }
                              onClick={() =>
                                void run(async () => {
                                  const ids = course.modules.map((m) => m.id);
                                  [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
                                  await request("/" + course.id + "/reorder", {
                                    revision: course.revision,
                                    data: ids,
                                  });
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
                                "/" + course.id + "/tasks/" + t.id + "/resume",
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
            </>
          )}
        </main>
      </div>
      {window === "new" && (
        <Window title="Crear curso" onClose={() => setWindow(null)}>
          <CreateFolder
            defaults={defaults}
            busy={busy}
            submit={(b) =>
              void run(async () => {
                const c = await request("", b);
                setWindow(null);
                await refresh();
                setSelected(c.id);
              })
            }
          />
        </Window>
      )}
      {window === "module" && m && course && (
        <Window title={m.title} onClose={() => setWindow(null)}>
          <div className="course-workbench">
            <div className="course-workbench-bar">
              <span className="course-tag">{styleLabels[m.style]}</span>
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
              <summary>Instrucciones del módulo</summary>
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
                  Instrucciones
                  <textarea
                    name="brief"
                    rows={4}
                    maxLength={12000}
                    defaultValue={m.brief}
                  />
                </label>
                <div className="course-grid">
                  <Select
                    name="style"
                    label="Estilo"
                    value={m.style}
                    options={styles.map((value) => ({
                      value,
                      label: styleLabels[value],
                    }))}
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
                <button disabled={busy || working}>
                  Guardar instrucciones
                </button>
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
                              <summary>Crear clip de video con IA</summary>
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
                                  Generar este clip
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
            <div className="course-materials">
              <div className="course-heading">
                <div>
                  <h3>Material complementario</h3>
                  <p className="muted">
                    Añade tantos recursos independientes como necesites.
                  </p>
                </div>
                <button type="button" onClick={() => setMaterial(!material)}>
                  ＋ Material
                </button>
              </div>
              {material && (
                <form
                  className="course-inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void run(async () => {
                      await request(
                        "/" + course.id + "/modules/" + m.id + "/materials",
                        {
                          title: f.get("title"),
                          kind: f.get("kind"),
                          instructions: f.get("instructions"),
                        },
                      );
                      setMaterial(false);
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
                      placeholder="Ej. Taller 1 · Resolución de problemas"
                    />
                  </label>
                  <Select
                    name="kind"
                    label="Tipo"
                    value="workshop"
                    options={[
                      "guide",
                      "book",
                      "workshop",
                      "exam",
                      "slides",
                    ].map((value) => ({ value, label: labels[value] }))}
                  />
                  <label>
                    Instrucciones
                    <textarea
                      name="instructions"
                      maxLength={8000}
                      placeholder="Cantidad de ejercicios, capítulos, edad y objetivo…"
                    />
                  </label>
                  <button disabled={busy}>Añadir material</button>
                </form>
              )}
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
                        Instrucciones
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
                      {mat.content.sections ? "Regenerar" : "Generar material"}
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
