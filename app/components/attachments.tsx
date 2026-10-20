"use client";
import { AttachmentFileChip } from "./attachment-file-chip";
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
  { scope, id, deferred = false, onUploaded, purposePrefix = "" },
  ref,
) {
  const [drafts, setDrafts] = useState<Draft[]>([
    { key: "first", purpose: "Material de contexto" },
  ]);
  const [showPC, setShowPC] = useState(false),
    [showSystem, setShowSystem] = useState(false);
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
  const enqueue = (incoming: File[], key?: string) => {
    if (!incoming.length || busy || replacing) return;
    setShowPC(true);
    const previous = draftsRef.current.find((r) => r.key === key);
    const rows = incoming.map((file) => ({
      key: crypto.randomUUID(),
      file,
      purpose: previous?.purpose ?? "Material de contexto",
    }));
    updateDrafts([
      ...draftsRef.current.filter((r) => r.key !== key && (r.file || r.saved)),
      ...rows,
    ]);
  };
  const removeSaved = async (file: Attachment) => {
    if (
      !window.confirm(
        `¿Eliminar ${file.name}? Si está en uso por un afiche o trabajo, se conservará.`,
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      await request(`attachments/${file.id}`, "DELETE");
      await refresh();
      onUploaded?.();
      setMessage("Adjunto eliminado.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const sourceButtons = () => (
    <div className="row attachment-source-buttons">
      <strong>Adjuntar desde:</strong>
      <button
        type="button"
        disabled={busy}
        aria-expanded={showPC || files.some((f) => !f.archivedAt)}
        onClick={() => {
          setShowPC(true);
          if (!draftsRef.current.some((r) => !r.file && !r.saved))
            updateDrafts([
              ...draftsRef.current,
              { key: crypto.randomUUID(), purpose: "Material de contexto" },
            ]);
        }}
      >
        Mi PC
      </button>
      {["project", "category", "subproduct"].includes(scope) && (
        <button
          type="button"
          disabled={busy}
          aria-expanded={showSystem}
          onClick={() => setShowSystem(true)}
        >
          Mi sistema
        </button>
      )}
    </div>
  );
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
    <details className="attachment-references">
      <summary>¿Quieres adjuntar referencias?</summary>
      <div
        className="upload stack"
        tabIndex={0}
        aria-label="Adjuntos: selecciona archivos o pega una captura con Ctrl+V"
        onPaste={(e) => {
          if (
            (e.target as HTMLElement).closest(
              "textarea,input:not([type=file]),select,[contenteditable=true]",
            )
          )
            return;
          const incoming = [...e.clipboardData.items]
            .filter(
              (item) => item.kind === "file" && item.type.startsWith("image/"),
            )
            .flatMap((item) => {
              const file = item.getAsFile();
              return file ? [file] : [];
            });
          if (incoming.length && !busy && !replacing) {
            e.preventDefault();
            enqueue(incoming);
            setMessage("Captura añadida; pendiente de guardar.");
          }
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          if (e.dataTransfer.files.length) {
            e.preventDefault();
            enqueue([...e.dataTransfer.files]);
          }
        }}
      >
        {sourceButtons()}
        {(showPC || active.length > 0) && (
          <div className="stack attachment-pc-fields">
            {active.map((file) => (
              <div className="fields attachment-source-row" key={file.id}>
                <div className="stack">
                  <strong>Archivo de mi PC</strong>
                  <div className="attachment-file-box">
                    <AttachmentFileChip
                      name={file.name}
                      href={`/api/attachments/${file.id}`}
                      disabled={busy}
                      onRemove={() => void removeSaved(file)}
                    />
                  </div>
                </div>
                <label>
                  Uso del archivo de mi PC
                  <input value={file.purpose} readOnly />
                </label>
              </div>
            ))}
            {drafts
              .filter(
                (draft) =>
                  !draft.saved ||
                  !active.some((file) => file.id === draft.saved?.id),
              )
              .map((draft, index) => (
                <div className="fields attachment-source-row" key={draft.key}>
                  <div className="stack">
                    <strong>Archivo de mi PC</strong>
                    <div className="attachment-file-box">
                      {(draft.file || draft.saved) && (
                        <AttachmentFileChip
                          name={draft.file?.name ?? draft.saved!.name}
                          file={draft.file}
                          href={
                            draft.saved
                              ? `/api/attachments/${draft.saved.id}`
                              : undefined
                          }
                          disabled={busy || !!draft.saved}
                          onRemove={() =>
                            updateDrafts(
                              draftsRef.current.filter(
                                (r) => r.key !== draft.key,
                              ),
                            )
                          }
                        />
                      )}
                      {!draft.saved && !draft.file && (
                        <input
                          aria-label={`Adjuntar archivo ${index + 1}`}
                          type="file"
                          multiple
                          accept={accept}
                          disabled={busy || !!replacing}
                          onChange={(e) => {
                            enqueue([...(e.target.files ?? [])], draft.key);
                            e.target.value = "";
                          }}
                        />
                      )}
                    </div>
                    {draft.file && (
                      <small>
                        Pendiente de guardar · puedes pegar capturas con Ctrl+V
                        en esta zona.
                      </small>
                    )}
                  </div>
                  <label>
                    Uso del archivo de mi PC
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
                </div>
              ))}
            <small>
              Puedes seleccionar varios archivos, arrastrarlos o pegar una
              captura con Ctrl+V aquí.
            </small>
          </div>
        )}
        <SystemResourcePicker
          scope={scope}
          id={id}
          onChanged={onUploaded}
          visible={showSystem}
        />
        {(showPC || showSystem || active.length > 0) && sourceButtons()}
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
              afiches y trabajos existentes. El nuevo tendrá el mismo propósito
              y se utilizará en futuras generaciones. No genera imágenes ni
              consume IA.
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
        {active.length > 0 && (
          <details>
            <summary>Reemplazar archivos guardados · {active.length}</summary>
            <div className="attachment-grid">{active.map(card)}</div>
          </details>
        )}
        {archived.length > 0 && (
          <details>
            <summary>
              Adjuntos anteriores conservados · {archived.length}
            </summary>
            <p className="hint">
              Ocultos en próximas generaciones y nuevas configuraciones
              guardadas. Conservan sus archivos para los trabajos y afiches
              existentes, y siguen ocupando almacenamiento. Puedes eliminarlos
              cuando no estén en uso.
            </p>
            <div className="attachment-grid">{archived.map(card)}</div>
          </details>
        )}
        <p className="hint">
          Hasta 1 GB por archivo, según espacio disponible. Los originales
          grandes se conservan en Biblioteca y se adjunta una copia optimizada o
          un extracto. Extraemos texto de TXT, CSV, PDF y DOCX sin consumir IA.
          Las imágenes tienen vistas previas privadas y se envían como
          referencias visuales; revisa su uso antes de generar.
        </p>
        {message && (
          <div className="notice" role="status">
            {message}
          </div>
        )}
      </div>
    </details>
  );
});
