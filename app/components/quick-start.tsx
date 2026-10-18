"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { SearchSelect } from "./search-select";
type Project = {id:string;name:string;canCreateProduct:boolean;categories:{id:string;name:string}[]};
export function QuickStart() {
  const requestId = useRef(crypto.randomUUID());
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [projects,setProjects]=useState<Project[]>([]),[loading,setLoading]=useState(true);
  const [projectId,setProjectId]=useState(""),[projectName,setProjectName]=useState("");
  const [categoryId,setCategoryId]=useState(""),[productName,setProductName]=useState("");
  const project=projects.find(p=>p.id===projectId);
  useEffect(()=>{let active=true;fetch("/api/quick-start",{cache:"no-store"}).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error);if(active)setProjects(data);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);setError("");
    try {
      const response = await fetch("/api/quick-start", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...data,count:Number(data.count),requestId:requestId.current,...(projectId?{projectId}:{projectName:projectName.trim()}),...(categoryId?{categoryId}:{productName:productName.trim()})})});
      const result = await response.json();
      if(!response.ok)throw Error(result.error??"No se pudo preparar el inicio rápido.");
      window.location.assign("?"+new URLSearchParams({view:"projects",category:result.categoryId,subproduct:result.subproductId}));
    } catch(reason) {setError(reason instanceof Error?reason.message:"No se pudo continuar.");setBusy(false);}
  }
  return <form className="panel stack quick-start-form" onSubmit={submit}>
    <h2>Inicia rápido</h2>
    <p className="quick-start-guide">Genera de manera rápida las variaciones de las imágenes que quieras.</p>
    <div className="fields quick-start-destinations">
      <div><SearchSelect label="Proyecto · elige o escribe un nombre nuevo" value={projectName} required disabled={busy||loading} loading={loading} browseOnToggle options={projects.map(p=>({id:p.id,label:p.name}))} onChange={value=>{setProjectName(value);setProjectId("");setCategoryId("");setProductName("");}} onSelect={option=>{setProjectId(option.id);setProjectName(option.label);setCategoryId("");setProductName("");}} /><small className="hint">{projectId?"Proyecto existente: se conservará su configuración.":"Se creará un proyecto con este nombre."}</small></div>
      <div><SearchSelect label="Producto · elige o escribe un nombre nuevo" value={productName} required disabled={busy||loading} browseOnToggle options={(project?.categories??[]).map(p=>({id:p.id,label:p.name}))} onChange={value=>{setProductName(value);setCategoryId("");}} onSelect={option=>{setCategoryId(option.id);setProductName(option.label);}} /><small className="hint">{categoryId?"El subproducto nuevo se añadirá al final de este producto.":project&&!project.canCreateProduct?"En este proyecto elige un producto compartido de la lista.":"Se creará un producto con este nombre."}</small></div>
    </div>
    <div className="fields"><label>Tema / nombre del subproducto nuevo<input name="name" maxLength={160} required placeholder="Por ejemplo: Terapia infantil" /></label><label>Variaciones<input type="number" name="count" min={1} max={12} defaultValue={1} required /></label></div>
    <label>¿Qué imagen quieres crear?<textarea name="prompt" maxLength={30000} placeholder="Describe el anuncio, el estilo, los textos y los detalles que debe incluir." /></label>
    <p className="hint">Solo necesitas los nombres. El subproducto siempre será nuevo; después puedes generar directamente o revisar sus instrucciones.</p>
    <button className="primary" disabled={busy||loading||!!(project&&!project.canCreateProduct&&!categoryId)}>{busy?"Preparando…":"Continuar al subproducto"}</button>
    {error&&<p role="alert" className="notice">{error}</p>}
  </form>;
}
