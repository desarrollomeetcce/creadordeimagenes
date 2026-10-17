"use client";
import { createPortal } from "react-dom";
import { useReusableConfiguration } from "./reusable-configuration";
import { useEffect, useRef, useState } from "react";

import { Attachments, type AttachmentsHandle } from "./attachments";
import { ExpandablePanel } from "./expandable-panel";

type Kit = {
  name: string;
  prompt: string;
  colors: string[];
  font: string | null;
  logoAttachmentIds: string[];
  revision: number;
  sourcePolicy?:Record<string,unknown>;
};
type Logo = { id: string; name: string; mime: string; purpose: string };
const empty: Kit = {
  name: "",
  prompt: "",
  colors: [],
  font: null,
  logoAttachmentIds: [],
  revision: 0,
};
async function api(path: string, data?: unknown) {
  const response = await fetch("/api/" + path, {
    method: data ? "PUT" : "GET",
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "No se pudo cargar la identidad de marca.");
  return result;
}
export function BrandKit({ projectId,selectorHost,onOpen }: { projectId: string;selectorHost?:HTMLElement|null;onOpen?:()=>void }) {
  const attachmentRef = useRef<AttachmentsHandle>(null), customColors = useRef<string[]>([]);
  const [identities,setIdentities]=useState<{projectId:string;name:string;project:{name:string}}[]>([]);
  useEffect(()=>{let active=true;void api("brands").then(rows=>{if(active)setIdentities(rows);}).catch(()=>{});return()=>{active=false;};},[projectId]);
  const [kit, setKit] = useState<Kit>(empty),
    [logos, setLogos] = useState<Logo[]>([]),
    [canEdit, setCanEdit] = useState(false),
    [busy, setBusy] = useState(true),
    [message, setMessage] = useState("");
  const read = async () => {
    const [brand, files] = await Promise.all([
      api(`projects/${projectId}/brand`),
      api(`attachments?scope=project&id=${projectId}`),
    ]);
    setKit(brand.kit?{...brand.kit,sourcePolicy:brand.sourcePolicy}:empty);
    setCanEdit(brand.canEdit);
    setLogos(
      files.filter(
        (f: Logo) => f.mime.startsWith("image/") && /logo/i.test(f.purpose),
      ),
    );
  };
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [brand, files] = await Promise.all([
          api(`projects/${projectId}/brand`),
          api(`attachments?scope=project&id=${projectId}`),
        ]);
        if (!active) return;
        setKit(brand.kit?{...brand.kit,sourcePolicy:brand.sourcePolicy}:empty);
        setCanEdit(brand.canEdit);
        setLogos(
          files.filter(
            (f: Logo) => f.mime.startsWith("image/") && /logo/i.test(f.purpose),
          ),
        );
      } catch (e) {
        if (active)
          setMessage(
            e instanceof Error ? e.message : "No se pudo cargar la marca.",
          );
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [projectId]);
  const persist = async () => {
    setBusy(true);
    try {
      const uploaded=await attachmentRef.current?.flush()??[];
      const logoAttachmentIds=[...new Set([...kit.logoAttachmentIds,...uploaded.filter(f=>/logo/i.test(f.purpose)&&f.mime.startsWith("image/")).map(f=>f.id)])];
      setKit(current=>({...current,logoAttachmentIds}));
      const files=await api(`attachments?scope=project&id=${projectId}`);
      setLogos(files.filter((file:Logo)=>file.mime.startsWith("image/")&&/logo/i.test(file.purpose)));
      const {revision,name,prompt,colors,font}=kit;
      const saved=await api(`projects/${projectId}/brand`,{name,prompt,colors,font,logoAttachmentIds,expectedRevision:revision});setKit({...saved,sourcePolicy:kit.sourcePolicy});setIdentities(await api("brands").catch(()=>identities));return saved as Kit;
    } finally {setBusy(false);}
  };
  const configuration=(value:Kit)=>({id:projectId,name:value.name||"IDENTIDAD DE MARCA",prompt:value.prompt,settings:{brandName:value.name,colors:value.colors,font:value.font},instructionPolicy:value.sourcePolicy});
  const templates=useReusableConfiguration({scope:"brand",editCurrent:onOpen,extraOptions:identities.map(identity=>({id:"project-brand:"+identity.projectId,label:identity.name||"Identidad de "+identity.project.name,detail:"Proyecto: "+identity.project.name})),onExtraSelect:async id=>{const source=id.slice("project-brand:".length);if(source!==projectId){const r=await fetch("/api/brands/"+source+"/apply",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId})});const b=await r.json();if(!r.ok)throw Error(b.error);setKit(b.kit);await read();}onOpen?.();},current:configuration(kit),saveCurrent:async()=>configuration(await persist()),onApplied:async()=>{await read();onOpen?.();},createNew:()=>{setKit({...empty,revision:kit.revision});onOpen?.();}});
  return (
    <>{selectorHost&&createPortal(templates.picker,selectorHost)}<ExpandablePanel title="Identidad de marca">
      <form
        className="inside stack"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          void persist()
            .then((saved) => {
              setKit(saved);
              setMessage(
                "Identidad guardada. Se aplicará a nuevas generaciones de este proyecto.",
              );
            })
            .catch((error: Error) => setMessage(error.message))
            .finally(() => setBusy(false));
        }}
      >
        <p className="muted">
          Se utiliza en los productos y subproductos de este proyecto. Las
          instrucciones específicas de cada nivel tienen prioridad. Los afiches
          existentes conservan su configuración original.
        </p>
        <fieldset disabled={busy || !canEdit} className="stack">
          <label>
            Nombre de la marca (opcional)
            <input
              maxLength={200}
              value={kit.name}
              onChange={(e) => setKit({ ...kit, name: e.target.value })}
            />
          </label>
          <label>
            Instrucciones de identidad (opcional)
            <textarea
              rows={4}
              maxLength={12000}
              value={kit.prompt}
              placeholder="Tono de comunicación, estilo visual y reglas de uso de marca…"
              onChange={(e) => setKit({ ...kit, prompt: e.target.value })}
            />
          </label>
          <fieldset className="brand-color-mode">
            <legend>Colores de la marca</legend>
            <label className="row"><input type="radio" name="brand-color-mode" checked={!kit.colors.length} onChange={() => { customColors.current = kit.colors; setKit({ ...kit, colors:[] }); }} />Que la IA elija los colores</label>
            <label className="row"><input type="radio" name="brand-color-mode" checked={kit.colors.length > 0} onChange={() => setKit({ ...kit, colors:customColors.current.length ? customColors.current : ["#176b58"] })} />Usar mis colores</label>
            <p className="hint">La opción automática deja que la IA elija una paleta al generar; seleccionarla no consume IA. Tus logos y referencias siguen aplicándose.</p>
          </fieldset>
          {kit.colors.length > 0 && <div className="row">
            <strong>Colores preferidos</strong>
            {kit.colors.map((color, i) => (
              <div className="row" key={i}>
                <input
                  type="color"
                  aria-label={`Color ${i + 1}`}
                  value={color}
                  onChange={(e) =>
                    setKit({
                      ...kit,
                      colors: kit.colors.map((c, n) =>
                        n === i ? e.target.value : c,
                      ),
                    })
                  }
                />
                <span>{color}</span>
                <button
                  type="button"
                  aria-label={`Quitar color ${i + 1}`}
                  onClick={() =>
                    setKit({
                      ...kit,
                      colors: kit.colors.filter((_, n) => n !== i),
                    })
                  }
                >
                  Quitar
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={kit.colors.length >= 8}
              onClick={() =>
                setKit({ ...kit, colors: [...kit.colors, "#176b58"] })
              }
            >
              ＋ Color
            </button>
          </div>}
          <label>
            Tipografía preferida disponible
            <select
              value={kit.font ?? ""}
              onChange={(e) => setKit({ ...kit, font: e.target.value || null })}
            >
              <option value="">Elegir según las instrucciones</option>
              <option>DejaVu Sans</option>
              <option>DejaVu Serif</option>
              <option>DejaVu Sans Mono</option>
            </select>
          </label>
          <strong>Logos autorizados de la marca</strong>
          <p className="muted">
            Puedes subir logos, imágenes y documentos aquí, con un uso para cada archivo.
            Los logos nuevos se seleccionan al guardar. Solo los logos
            del proyecto seleccionados estarán disponibles para las nuevas
            generaciones; se conservarán las referencias y logos adicionales de
            cada producto o subproducto.
          </p>
          <div className="grid">
            {logos.map((logo) => (
              <label className="card" key={logo.id}>
                <img
                  src={`/api/attachments/${logo.id}`}
                  alt={logo.name}
                  loading="lazy"
                  style={{ width: 100, height: 70, objectFit: "contain" }}
                />
                <span>
                  <input
                    type="checkbox"
                    checked={kit.logoAttachmentIds.includes(logo.id)}
                    onChange={(e) =>
                      setKit({
                        ...kit,
                        logoAttachmentIds: e.target.checked
                          ? [...kit.logoAttachmentIds, logo.id]
                          : kit.logoAttachmentIds.filter(
                              (id) => id !== logo.id,
                            ),
                      })
                    }
                  />{" "}
                  {logo.name}
                </span>
              </label>
            ))}
          </div>
          <Attachments ref={attachmentRef} scope="project" id={projectId} deferred addLabel="＋ Subir otro archivo" purposePrefix="Marca · " />
          <button type="submit" className="primary">
            Guardar identidad
          </button>
        </fieldset>
        {!canEdit && !busy && (
          <p className="muted">
            Tu acceso permite consultar esta identidad. Se necesita permiso de
            edición para modificarla.
          </p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void read()
              .then(() =>
                setMessage(
                  "Identidad y logos actualizados desde el servidor. Los archivos pendientes todavía no se han subido.",
                ),
              )
              .catch((e: Error) => setMessage(e.message))
              .finally(() => setBusy(false));
          }}
        >
          Actualizar identidad y logos
        </button>
        {canEdit&&templates.saver}
        {message && (
          <div role="status" className="notice">
            {message}
          </div>
        )}
      </form>
    </ExpandablePanel></>
  );
}
