"use client";
import { SystemResourcePicker } from "./system-resource-picker";
import { uploadResource } from "./resource-upload";
import { maxResourceFileBytes } from "../../lib/large-upload-limits";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

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
export type AttachmentUpload = {
  id: string;
  name: string;
  purpose: string;
  mime: string;
};
export type AttachmentsHandle = { flush: () => Promise<AttachmentUpload[]> };
type Draft = {
  key: string;
  file?: File;
  purpose: string;
  saved?: AttachmentUpload;
};
export const Attachments = forwardRef<
  AttachmentsHandle,
  {
    scope: string;
    id: string;
    deferred?: boolean;
    onUploaded?: () => void;
    addLabel?: string;
    purposePrefix?: string;
  }
>(function Attachments(
  {
    scope,
    id,
    deferred = false,
    onUploaded,
    addLabel = "＋ Subir otro documento",
    purposePrefix = "",
  },
  ref,
) {
  const [drafts, setDrafts] = useState<Draft[]>([
    { key: "first", purpose: "Material de contexto" },
  ]);
  const completedOriginals = useRef(new Map<string, { id: string }>());
  const draftsRef = useRef(drafts),
    flushing = useRef(false);
  draftsRef.current = drafts;
  const updateDrafts = (next: Draft[]) => {
    draftsRef.current = next;
    setDrafts(next);
  };

  const [files, setFiles] = useState<Attachment[]>([]),
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
  async function upload(
    file?: File,
    previous?: Attachment,
    purpose = "Material de contexto",
    refreshAfter = true,
  ): Promise<AttachmentUpload | undefined> {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      if (file.size > maxResourceFileBytes)
        throw Error("El archivo supera 1 GB.");
      if (file.size > uploadLimit) {
        const info = await (await fetch("/api/storage/tree")).json();
        const fileKey = `${file.name}:${file.size}:${file.lastModified}`;
        const document =
          completedOriginals.current.get(fileKey) ??
          (await uploadResource(file, {
            folderId: "",
            purpose: /logo/i.test(previous?.purpose ?? purpose)
              ? "Logo"
              : file.type.startsWith("image/")
                ? "Referencia visual"
                : "Material de contexto",
            userId: info.userId,
            paused: () => false,
            onProgress: (bytes, total) =>
              setMessage(
                `Subiendo ${file.name}: ${(bytes / 1048576).toFixed(1)} de ${(total / 1048576).toFixed(1)} MB`,
              ),
          }));
        completedOriginals.current.set(fileKey, document);
        const response = await fetch("/api/attachments/from-library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope,
            resourceId: id,
            documentId: document.id,
            purpose: previous?.purpose ?? purposePrefix + purpose,
            ...(previous ? { replacesId: previous.id } : {}),
          }),
        });
        const saved = await response.json();
        if (!response.ok) {
          if (response.status === 404)
            completedOriginals.current.delete(fileKey);
          throw Error(
            saved.error ??
              "El original está en Biblioteca; falta su copia optimizada.",
          );
        }
        setReplacing(null);
        if (refreshAfter) {
          await refresh();
          onUploaded?.();
        }
        setMessage(
          "Archivo guardado. El original completo se conserva en Biblioteca.",
        );
        return {
          id: saved.id,
          name: saved.name,
          purpose: saved.purpose,
          mime: saved.mime,
        };
      }
      const form = new FormData();
      form.set("file", file);
      form.set("scope", scope);
      form.set("resourceId", id);
      form.set("purpose", previous?.purpose ?? purposePrefix + purpose);
      const saved = await request(
        previous ? `attachments/${previous.id}/replace` : "attachments",
        "POST",
        form,
      );
      setReplacing(null);
      if (refreshAfter) {
        await refresh().catch(() =>
          setMessage(
            "Archivo subido. Actualiza la lista si no aparece todavía.",
          ),
        );
        onUploaded?.();
      }
      setMessage(
        previous
          ? "Archivo reemplazado para próximas generaciones. El anterior se conserva para el historial y los trabajos ya autorizados."
          : "Archivo guardado.",
      );
      return {
        id: saved.id,
        name: saved.name,
        purpose: previous?.purpose ?? purposePrefix + purpose,
        mime: file.type,
      };
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el archivo.",
      );
      throw error;
    } finally {
      setBusy(false);
    }
  }
  const flush = async () => {
    if (flushing.current)
      throw Error("Espera a que termine la subida de archivos.");
    flushing.current = true;
    try {
      // Validate every selected size before starting; successful rows remain saved on retry.
      for (const row of draftsRef.current)
        if (row.file && row.file.size > maxResourceFileBytes)
          throw Error(`${row.file.name}: supera 1 GB.`);
      for (const row of [...draftsRef.current])
        if (row.file && !row.saved) {
          const saved = await upload(row.file, undefined, row.purpose, false);
          updateDrafts(
            draftsRef.current.map((r) =>
              r.key === row.key ? { ...r, file: undefined, saved } : r,
            ),
          );
        }
      const saved = draftsRef.current.flatMap((r) =>
        r.saved ? [r.saved] : [],
      );
      if (saved.length) {
        await refresh().catch(() => {});
        onUploaded?.();
      }
      updateDrafts([
        { key: crypto.randomUUID(), purpose: "Material de contexto" },
      ]);
      return saved;
    } catch (error) {
      throw Error(
        (error instanceof Error
          ? error.message
          : "No se pudieron subir los archivos.") +
          " Los archivos ya subidos se conservan; vuelve a guardar para continuar con los pendientes.",
      );
    } finally {
      flushing.current = false;
    }
  };
  useImperativeHandle(ref, () => ({ flush }));
  const select = (key: string, file?: File) => {
    updateDrafts(
      draftsRef.current.map((row) =>
        row.key === key ? { ...row, file, saved: undefined } : row,
      ),
    );
  };
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
        if (!replacing && !busy) {
          const files = [...e.dataTransfer.files];
          updateDrafts([
            ...draftsRef.current.filter((r) => r.file || r.saved),
            ...files.map((file) => ({
              key: crypto.randomUUID(),
              file,
              purpose: "Material de contexto",
            })),
          ]);
        }
      }}
    >
      <SystemResourcePicker
        scope={scope}
        id={id}
        onChanged={onUploaded}
        external={
          <div className="stack">
            {" "}
            {drafts.map((draft, index) => (
              <div className="fields attachment-upload-row" key={draft.key}>
                <label>
                  Archivo externo {drafts.length > 1 ? index + 1 : ""}
                  <input
                    aria-label={`Adjuntar archivo ${index + 1}`}
                    type="file"
                    accept={accept}
                    disabled={busy || !!replacing || !!draft.saved}
                    onChange={(e) => select(draft.key, e.target.files?.[0])}
                  />
                  {draft.file && (
                    <small>{draft.file.name} · pendiente de guardar</small>
                  )}
                  {draft.saved && <small>{draft.saved.name} · ya subido</small>}
                </label>
                <label>
                  Uso del archivo {index + 1}
                  <select
                    value={draft.purpose}
                    disabled={busy || !!draft.saved}
                    onChange={(e) =>
                      updateDrafts(
                        draftsRef.current.map((r) =>
                          r.key === draft.key
                            ? { ...r, purpose: e.target.value }
                            : r,
                        ),
                      )
                    }
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
                {(draft.file || drafts.length > 1) && (
                  <button
                    type="button"
                    className="danger"
                    disabled={busy}
                    aria-label={
                      draft.file
                        ? `Quitar archivo ${draft.file.name}`
                        : `Quitar fila ${index + 1}`
                    }
                    onClick={() => {
                      const next = draftsRef.current.filter(
                        (r) => r.key !== draft.key,
                      );
                      updateDrafts(
                        next.length
                          ? next
                          : [
                              {
                                key: crypto.randomUUID(),
                                purpose: "Material de contexto",
                              },
                            ],
                      );
                      setMessage(
                        draft.file
                          ? "Archivo pendiente retirado; no se subió."
                          : "",
                      );
                    }}
                  >
                    {draft.file ? "Quitar archivo" : "Quitar fila"}
                  </button>
                )}
              </div>
            ))}
          </div>
        }
      />
      <div className="row">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            updateDrafts([
              ...draftsRef.current,
              { key: crypto.randomUUID(), purpose: "Material de contexto" },
            ])
          }
        >
          {addLabel}
        </button>
        {!deferred && (
          <button
            type="button"
            className="primary"
            disabled={busy || !drafts.some((r) => r.file || r.saved)}
            onClick={() =>
              void flush().catch((error) => setMessage(error.message))
            }
          >
            Guardar archivos
          </button>
        )}
      </div>
      {deferred && (
        <p className="hint">
          Los archivos seleccionados se subirán al guardar las instrucciones o
          la identidad. Puedes añadir más filas y definir un uso distinto para
          cada archivo.
        </p>
      )}
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
                void upload(e.target.files?.[0], replacing).catch(() => {});
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
        Hasta 1 GB por archivo, según espacio disponible. Los originales grandes
        se conservan en Biblioteca y se adjunta una copia optimizada o un
        extracto. Extraemos texto de TXT, CSV, PDF y DOCX sin consumir IA. Las
        imágenes tienen vistas previas privadas y se envían como referencias
        visuales; revisa su uso antes de generar.
      </p>
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
    </div>
  );
});
