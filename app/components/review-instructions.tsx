"use client";
import {useEffect,useState} from "react";
import {InstructionEditor} from "./instruction-editor";
import type {InstructionPolicy} from "../../lib/instruction-policy";
type Layer={scope:"project"|"category"|"subproduct";id:string;name:string;prompt:string|null;policy:InstructionPolicy;canEdit:boolean;revision:string|null};
export function ReviewInstructions({id,onSaved,onDirty}:{id:string;onSaved:(data:{layers:Layer[]})=>Promise<void>;onDirty:()=>void}){
 const [layers,setLayers]=useState<Layer[]>([]),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(true),[message,setMessage]=useState(""),[productApplies,setProductApplies]=useState(true);
 useEffect(()=>{const c=new AbortController();void fetch('/api/subproducts/'+id+'/review',{signal:c.signal,cache:'no-store'}).then(async r=>{const b=await r.json();if(!r.ok)throw Error(b.error);if(!c.signal.aborted){setLayers(b.layers);setProductApplies(b.productApplies);}}).catch(e=>{if(!c.signal.aborted)setMessage(e.message);}).finally(()=>{if(!c.signal.aborted)setBusy(false);});return()=>c.abort();},[id]);
 const change=(scope:Layer["scope"],prompt:string)=>{setLayers(rows=>rows.map(l=>l.scope===scope?{...l,prompt}:l));setDirty(true);onDirty();};
 const toggle=(scope:Layer["scope"],include:boolean)=>{const key=scope==="project"?"includeProject":scope==="category"?"includeProduct":"includeSelf";setLayers(rows=>rows.map(l=>l.scope==='subproduct'?{...l,policy:{...l.policy,[key]:include}}:l));setDirty(true);onDirty();};
 const sub=layers.find(l=>l.scope==='subproduct');
 const globallyActive=(layer:Layer)=>layer.scope==='project'?layer.policy.includeSelf!==false&&layers.find(l=>l.scope==='category')?.policy.includeProject!==false:layer.scope==='category'?layer.policy.includeSelf!==false&&productApplies:true;
 return <section className="review-instructions stack" aria-label="Instrucciones por nivel">
  <p className="hint">Revisa los tres niveles. Editar proyecto o producto afecta a sus otros subproductos; Guarda todos los cambios juntos. Los niveles sin permiso de edición se conservan.</p>
  {layers.map(layer=><details key={layer.scope} id={'review-'+id+'-'+layer.scope}><summary>{({project:'Proyecto',category:'Producto',subproduct:'Subproducto'}[layer.scope])}: {layer.name}</summary><div className="inside stack">
   <label>Considerar instrucciones de este nivel<select disabled={!sub?.canEdit||busy||!globallyActive(layer)} value={!globallyActive(layer)?'no':sub?.policy[layer.scope==='project'?'includeProject':layer.scope==='category'?'includeProduct':'includeSelf']===false?'no':'yes'} onChange={e=>toggle(layer.scope,e.target.value==='yes')}><option value="yes">Sí considerar</option><option value="no">No considerar</option></select></label>
   {!globallyActive(layer)&&<p className="notice">Las instrucciones están desactivadas en su origen o en la herencia del producto. <a target="_blank" rel="noopener" href={"?view=projects&"+(layer.scope==='project'?'project=':'category=')+layer.id}>Abrir el nivel de origen</a></p>}
   {layer.prompt===null?<p className="muted">Se aplica la herencia activa. No tienes acceso al texto privado de este nivel.</p>:<InstructionEditor label={'Instrucciones del '+({project:'proyecto',category:'producto',subproduct:'subproducto'}[layer.scope])} value={layer.prompt} readOnly={!layer.canEdit||busy} onValueChange={value=>change(layer.scope,value)} />}
  </div></details>)}
  <button type="button" className="primary" disabled={busy||!dirty} onClick={()=>{setBusy(true);setMessage('');void(async()=>{const r=await fetch('/api/subproducts/'+id+'/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({layers:layers.filter(l=>l.canEdit).map(l=>({scope:l.scope,id:l.id,prompt:l.prompt,policy:l.policy,revision:l.revision}))})});const b=await r.json();if(!r.ok)throw Error(b.error);setLayers(b.layers);setProductApplies(b.productApplies);setDirty(false);await onSaved(b);setMessage('Todos los cambios guardados. Vuelve a revisar el resultado antes de autorizar la generación.');})().catch(e=>setMessage(e.message)).finally(()=>setBusy(false));}}>Guardar todos los cambios</button>
  {message&&<p role="status" className="notice">{message}</p>}
  <button type="button" disabled={busy} onClick={()=>{setBusy(true);void fetch('/api/subproducts/'+id+'/review',{cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error);setLayers(data.layers);setProductApplies(data.productApplies);setDirty(false);await onSaved(data);setMessage('Revisión recargada desde el servidor.');}).catch(error=>setMessage(error.message)).finally(()=>setBusy(false));}}>Descartar cambios y recargar revisión</button>
 </section>;
}
