"use client";
import { useCallback, useEffect, useState } from "react";

type Attachment = {
  id: string;
  name: string;
  mime: string;
  purpose: string;
  size: number;
  archivedAt: string | null;
  replacesId: string | null;
};
async function request(path: string, method = "GET", data?: FormData) {
  const r = await fetch("/api/" + path, {
    method,
    body: data,
    cache: "no-store",
  });
  const b = await r.json();
  if (!r.ok)
    throw Error(b.error ?? "No se pudo completar la operación de adjuntos.");
  return b;
}
const accept = ".txt,.csv,.pdf,.docx,.jpg,.jpeg,.png,.webp,.svg";
export function Attachments({ scope, id }: { scope: string; id: string }) {
  const [files, setFiles] = useState<Attachment[]>([]),
    [purpose, setPurpose] = useState("Material de contexto"),
    [uploadLimit, setUploadLimit] = useState(3000000),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [replacing, setReplacing] = useState<Attachment | null>(null);
  const refresh = useCallback(async () => {
    const [rows, caps] = await Promise.all([
      request(
        `attachments?scope=${scope}&id=${encodeURIComponent(id)}&includeArchived=true`,
      ),
      request("capabilities"),
    ]);
    setFiles(rows);
    setUploadLimit(caps.maxUploadBytes);
  }, [scope, id]);
  useEffect(() => {
    let active = true;
    void Promise.all([
      request(
        `attachments?scope=${scope}&id=${encodeURIComponent(id)}&includeArchived=true`,
      ),
      request("capabilities"),
    ])
      .then(([rows, caps]) => {
        if (active) {
          setFiles(rows);
          setUploadLimit(caps.maxUploadBytes);
        }
      })
      .catch((error: Error) => {
        if (active) setMessage(error.message);
      });
    return () => {
      active = false;
    };
  }, [scope, id]);
  async function upload(file?: File, previous?: Attachment) {
    if (!file || busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (file.size > uploadLimit)
        throw Error(`El archivo supera ${uploadLimit / 1000000} MB.`);
      const form = new FormData();
      form.set("file", file);
      form.set("scope", scope);
      form.set("resourceId", id);
      form.set("purpose", previous?.purpose ?? purpose);
      await request(
        previous ? `attachments/${previous.id}/replace` : "attachments",
        "POST",
        form,
      );
      setReplacing(null);
      await refresh();
      setMessage(
        previous
          ? "Archivo reemplazado para próximas generaciones. El anterior se conserva para el historial y los trabajos ya autorizados."
          : "Archivo guardado.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el archivo.",
      );
    } finally {
      setBusy(false);
    }
  }
  const card = (file: Attachment) => (
    <article key={file.id} className="attachment-card">
      {file.mime.startsWith("image/") ? (
        <a
          href={`/api/attachments/${file.id}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Abrir imagen ${file.name}`}
        >
          {/* Private authenticated thumbnails must use this endpoint, without an image optimizer/cache. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            loading="lazy"
            width={160}
            height={120}
            src={`/api/attachments/${file.id}/thumbnail`}
            alt={`Vista previa de ${file.name}`}
          />
        </a>
      ) : (
        <span className="attachment-document" aria-hidden="true">
          ▤
        </span>
      )}
      <div className="stack attachment-info">
        <a
          href={`/api/attachments/${file.id}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {file.name}
        </a>
        <small>
          {file.purpose} · {Math.ceil(file.size / 1024)} KB
          {file.archivedAt ? " · Reemplazado" : ""}
        </small>
        <div className="row">
          {!file.archivedAt && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setReplacing(file);
                setMessage("");
              }}
            >
              Reemplazar {file.name}
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            className="danger"
            aria-label={`Eliminar ${file.name}`}
            onClick={() => {
              if (
                !window.confirm(
                  `¿Eliminar ${file.name}? Si está en uso por un afiche o trabajo, se conservará.`,
                )
              )
                return;
              setBusy(true);
              setMessage("");
              void request(`attachments/${file.id}`, "DELETE")
                .then(async () => {
                  await refresh();
                  setMessage("Adjunto eliminado.");
                })
                .catch((error: Error) => setMessage(error.message))
                .finally(() => setBusy(false));
            }}
          >
            Eliminar
          </button>
        </div>
      </div>
    </article>
  );
  const active = files.filter((f) => !f.archivedAt),
    archived = files.filter((f) => f.archivedAt);
  return (
    <div
      className="upload stack"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (!replacing) void upload(e.dataTransfer.files[0]);
      }}
    >
      <div className="fields">
        <label>
          Adjuntos · arrastra un archivo
          <input
            aria-label="Adjuntar archivo"
            type="file"
            accept={accept}
            disabled={busy || !!replacing}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <label>
          Uso del archivo
          <select
            value={purpose}
            disabled={busy}
            onChange={(e) => setPurpose(e.target.value)}
          >
            {[
              "Material de contexto",
              "Logo institucional",
              "Referencia visual",
              "Fotografía obligatoria",
              "Información comercial",
              "Manual de marca",
            ].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
      </div>
      {replacing && (
        <section className="panel stack" aria-label="Reemplazar adjunto">
          <strong>Reemplazar: {replacing.name}</strong>
          <p>
            Selecciona el archivo nuevo. Conservaremos el anterior y su uso en
            afiches y trabajos existentes. El nuevo tendrá el mismo propósito y
            se utilizará en futuras generaciones. No genera imágenes ni consume
            IA.
          </p>
          <label>
            Archivo nuevo
            <input
              aria-label={`Archivo nuevo para ${replacing.name}`}
              type="file"
              accept={accept}
              disabled={busy}
              onChange={(e) => {
                void upload(e.target.files?.[0], replacing);
                e.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => setReplacing(null)}
          >
            Cancelar reemplazo
          </button>
        </section>
      )}
      <div className="attachment-grid">{active.map(card)}</div>
      {archived.length > 0 && (
        <details>
          <summary>Adjuntos anteriores conservados · {archived.length}</summary>
          <p className="hint">
            Ocultos en próximas generaciones y nuevas configuraciones guardadas.
            Conservan sus archivos para los trabajos y afiches existentes, y
            siguen ocupando almacenamiento. Puedes eliminarlos cuando no estén
            en uso.
          </p>
          <div className="attachment-grid">{archived.map(card)}</div>
        </details>
      )}
      <p className="hint">
        Hasta {uploadLimit / 1000000} MB. Extraemos texto de TXT, CSV, PDF y
        DOCX sin consumir IA. Las imágenes tienen vistas previas privadas y se
        envían como referencias visuales; revisa su uso antes de generar.
      </p>
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
    </div>
  );
}
