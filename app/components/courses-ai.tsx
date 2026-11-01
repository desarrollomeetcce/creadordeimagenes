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
import { PasswordInput } from "./password-input";
import "./courses-ai.css";
const CoursePlayer = dynamic(
  () => import("./course-player").then((m) => m.CoursePlayer),
  { loading: () => <p role="status">Preparando presentación…</p> },
);
type Provider = {
  provider: string;
  maskedKey: string;
  verifiedAt: string | null;
  models: { id: string; name: string; kind: string }[];
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
  id: string;
  title: string;
  kind: string;
  prompt: string;
  revision: number;
  settings: CourseSettings;
  modules: Module[];
  tasks: { id: string; kind: string; status: string; error: string | null }[];
};
type Summary = {
  id: string;
  title: string;
  kind: string;
  _count: { modules: number };
};
const labels: Record<string, string> = {
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
function CourseForm({
  course,
  providers,
  busy,
  submit,
}: {
  course?: Course;
  providers: Provider[];
  busy: boolean;
  submit: (b: unknown) => void;
}) {
  const s = course?.settings ?? settingsSchema.parse({}),
    [provider, setProvider] = useState(s.provider),
    [voice, setVoice] = useState(s.voiceProvider),
    textModels =
      providers
        .find((p) => p.provider === provider)
        ?.models.filter((m) => m.kind === "text") ?? [],
    voiceConfig = providers.find((p) => p.provider === voice),
    imageModels =
      providers
        .find((p) => p.provider === "openai")
        ?.models.filter((m) => m.kind === "image") ?? [];
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const fields = [
      "audience",
      "level",
      "approach",
      "style",
      "language",
      "model",
      "tone",
      "voiceId",
      "voiceModel",
      "imageModel",
    ];
    const settings: Record<string, unknown> = {
      provider,
      voiceProvider: voice,
      moduleCount: Number(f.get("moduleCount")),
      minutes: Number(f.get("minutes")),
    };
    fields.forEach((k) => (settings[k] = f.get(k) ?? ""));
    submit({
      title: f.get("title"),
      kind: f.get("kind"),
      prompt: f.get("prompt"),
      settings,
    });
  }
  return (
    <form onSubmit={save} className="course-form">
      <div className="course-grid">
        <label>
          Nombre
          <input
            required
            name="title"
            maxLength={200}
            defaultValue={course?.title ?? ""}
            placeholder="Ej. Diplomado práctico de Python"
          />
        </label>
        <Select
          name="kind"
          label="Programa"
          value={course?.kind ?? "course"}
          options={[
            { value: "course", label: "Curso" },
            { value: "diploma", label: "Diplomado" },
          ]}
        />
      </div>
      <label>
        ¿Qué quieres enseñar?
        <textarea
          required
          minLength={10}
          maxLength={20000}
          name="prompt"
          rows={5}
          defaultValue={course?.prompt ?? ""}
          placeholder="Explica el tema, a quién va dirigido, qué debe aprender y practicar. Puedes indicar edad, colegio, casos, tono y conocimientos previos."
        />
      </label>
      <div className="course-grid">
        <Select
          name="audience"
          label="Público"
          value={s.audience}
          options={[
            { value: "professionals", label: "Profesionales / técnicos" },
            { value: "children", label: "Niños" },
            { value: "families", label: "Padres y familias" },
          ]}
        />
        <Select
          name="level"
          label="Nivel"
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
          Módulos iniciales
          <input
            name="moduleCount"
            type="number"
            min={1}
            max={24}
            required
            defaultValue={s.moduleCount}
          />
        </label>
        <label>
          Minutos objetivo por módulo
          <input
            name="minutes"
            type="number"
            min={1}
            max={60}
            required
            defaultValue={s.minutes}
          />
        </label>
        <label>
          Idioma
          <input
            name="language"
            maxLength={60}
            required
            defaultValue={s.language}
          />
        </label>
        <label>
          Tono docente
          <input name="tone" maxLength={300} defaultValue={s.tone} />
        </label>
      </div>
      <details open={!s.model}>
        <summary>IA y voz</summary>
        <p className="muted">
          Primero guarda tus claves y consulta los modelos en Conexiones. Se
          genera únicamente al solicitarlo; cada proveedor cobra su API.
        </p>
        <div className="course-grid">
          <label>
            IA de contenido
            <select
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
            label="Modelo disponible"
            value={s.provider === provider ? s.model : ""}
            options={[
              { value: "", label: "Seleccionar modelo" },
              ...textModels.map((m) => ({ value: m.id, label: m.name })),
            ]}
          />
          <label>
            Proveedor de voz
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value as typeof voice)}
            >
              <option value="elevenlabs">ElevenLabs · voces y clonación</option>
              <option value="openai">OpenAI · voces naturales</option>
            </select>
          </label>
          <Select
            key={voice + "model"}
            name="voiceModel"
            label="Modelo de voz"
            value={s.voiceProvider === voice ? s.voiceModel : ""}
            options={[
              { value: "", label: "Seleccionar modelo" },
              ...(
                voiceConfig?.models.filter((m) => m.kind === "speech") ?? []
              ).map((m) => ({ value: m.id, label: m.name })),
            ]}
          />
          <Select
            key={voice + "voice"}
            name="voiceId"
            label="Voz"
            value={s.voiceProvider === voice ? s.voiceId : ""}
            options={[
              { value: "", label: "Seleccionar voz" },
              ...(voiceConfig?.voices ?? []).map((m) => ({
                value: m.id,
                label: m.name,
              })),
            ]}
          />
          <Select
            name="imageModel"
            label="Ilustración opcional · OpenAI"
            value={s.imageModel}
            options={[
              { value: "", label: "Sin imágenes generadas" },
              ...imageModels.map((m) => ({ value: m.id, label: m.name })),
            ]}
          />
        </div>
      </details>
      <div className="course-toolbar">
        <button className="course-primary" disabled={busy} type="submit">
          {busy
            ? "Guardando…"
            : course
              ? "Guardar configuración"
              : "Crear curso"}
        </button>
        <span className="muted">Guardar no consume IA.</span>
      </div>
    </form>
  );
}
function Connections({
  providers,
  busy,
  run,
  refresh,
}: {
  providers: Provider[];
  busy: boolean;
  run: (fn: () => Promise<void>) => void;
  refresh: () => Promise<void>;
}) {
  const [keys, setKeys] = useState<Record<string, string>>({}),
    [cloned, setCloned] = useState("");
  return (
    <div className="course-connections">
      <p>
        Para comenzar:{" "}
        <strong>OpenAI o Gemini para contenido y ElevenLabs para voz</strong>.
        Claude es otra opción para textos extensos. La naturalidad depende de la
        voz, el idioma y la muestra; revisa una escena antes de producir el
        resto.
      </p>
      <p className="muted">
        Estas claves son independientes de los otros módulos. ChatGPT, Gemini
        web y sus suscripciones no sustituyen una clave API.
      </p>
      {["openai", "gemini", "anthropic", "elevenlabs"].map((id) => {
        const p = providers.find((p) => p.provider === id);
        return (
          <form
            key={id}
            className="course-provider"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await request("/providers", { provider: id, key: keys[id] });
                setKeys((k) => ({ ...k, [id]: "" }));
                await refresh();
              });
            }}
          >
            <div>
              <strong>
                {
                  {
                    openai: "OpenAI",
                    gemini: "Google Gemini",
                    anthropic: "Anthropic Claude",
                    elevenlabs: "ElevenLabs",
                  }[id]
                }
              </strong>
              <span className="course-tag">
                {p ? p.maskedKey : "Sin configurar"}
              </span>
            </div>
            <label>
              Clave API
              <PasswordInput
                secretLabel={"clave de " + id}
                value={keys[id] ?? ""}
                autoComplete="off"
                onChange={(e) =>
                  setKeys((k) => ({ ...k, [id]: e.target.value }))
                }
              />
            </label>
            <div className="course-toolbar">
              <button disabled={busy || !keys[id]} type="submit">
                Guardar clave
              </button>
              <button
                disabled={busy || !p}
                type="button"
                onClick={() =>
                  run(async () => {
                    await request("/providers/" + id + "/discover", {});
                    await refresh();
                  })
                }
              >
                Consultar modelos y voces
              </button>
              <span className="muted">
                {p?.verifiedAt
                  ? p.models.length + " modelos disponibles"
                  : "Pendiente de consulta"}
              </span>
            </div>
          </form>
        );
      })}
      <details>
        <summary>Clonar una voz con ElevenLabs</summary>
        <p>
          Usa una muestra limpia de tu voz o de una persona que te autorizó. La
          disponibilidad y verificación dependen del plan de ElevenLabs. No se
          requiere mostrar el rostro.
        </p>
        <form
          className="course-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget,
              fd = new FormData(form);
            run(async () => {
              const r = await fetch("/api/courses-ai/voices/clone", {
                method: "POST",
                body: fd,
                signal: AbortSignal.timeout(150000),
              });
              const result = await r.json();
              if (!r.ok) throw Error(result.error);
              setCloned(
                result.requiresVerification
                  ? "Voz creada; completa la verificación en ElevenLabs antes de usarla."
                  : "Voz creada. Ya puedes seleccionarla en la configuración del curso.",
              );
              form.reset();
              await refresh();
            });
          }}
        >
          <label>
            Nombre de voz
            <input name="name" required maxLength={100} />
          </label>
          <label>
            Muestra de audio
            <input
              type="file"
              name="file"
              accept="audio/mpeg,audio/wav,audio/mp4,audio/webm,audio/ogg"
              required
            />
          </label>
          <label className="course-check">
            <input type="checkbox" name="consent" value="yes" required /> Es mi
            voz o tengo autorización expresa para clonarla.
          </label>
          <button
            disabled={
              busy || !providers.some((p) => p.provider === "elevenlabs")
            }
            className="course-primary"
          >
            Crear voz · consume servicio de ElevenLabs
          </button>
        </form>
        <p role="status">{cloned}</p>
      </details>
    </div>
  );
}
export function CoursesAI() {
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
    ]).then((results) => {
      if (!mounted.current) return;
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          if (i === 0) setList(r.value);
          else setProviders(r.value);
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
    course?.tasks.some((t) => ["PENDING", "RUNNING"].includes(t.status)) ??
    false;
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
          <button type="button" onClick={() => setWindow("connections")}>
            ⚙ Conexiones
          </button>
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
              <strong>{c.title}</strong>
              <span>
                {c.kind === "diploma" ? "Diplomado" : "Curso"} ·{" "}
                {c._count.modules} módulos
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
                    {course.kind === "diploma" ? "Diplomado" : "Curso"}
                  </span>
                  <h2>{course.title}</h2>
                  <p className="muted">
                    {course.modules.length} módulos · Duración objetivo{" "}
                    {course.modules.reduce((a, m) => a + m.minutes, 0)} min
                  </p>
                </div>
                <div className="course-toolbar">
                  <button
                    type="button"
                    disabled={busy || working}
                    onClick={() => setWindow("settings")}
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
                      disabled={busy || working || !course.settings.model}
                      onClick={() => void batch("LESSON")}
                    >
                      ✦ Desarrollar módulos pendientes
                    </button>
                  )}
                </div>
              </div>
              {!course.modules.length && (
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
                    disabled={busy || working || !course.settings.model}
                    onClick={() => void task("OUTLINE")}
                  >
                    ✦ Generar temario
                  </button>
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
          <CourseForm
            providers={providers}
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
      {window === "settings" && course && (
        <Window title="Configurar curso" onClose={() => setWindow(null)}>
          <CourseForm
            course={course}
            providers={providers}
            busy={busy || working}
            submit={(b) =>
              void run(async () => {
                await request("/" + course.id + "/save", {
                  revision: course.revision,
                  data: b,
                });
                setWindow(null);
                await refresh();
              })
            }
          />
        </Window>
      )}
      {window === "connections" && (
        <Window title="Conexiones de Cursos IA" onClose={() => setWindow(null)}>
          <Connections
            providers={providers}
            busy={busy}
            run={(fn) => void run(fn)}
            refresh={refreshProviders}
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
