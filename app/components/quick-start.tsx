"use client";
import { useRef, useState, type FormEvent } from "react";
export function QuickStart() {
  const requestId = useRef(crypto.randomUUID());
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);setError("");
    try {
      const response = await fetch("/api/quick-start", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...data,count:Number(data.count),requestId:requestId.current})});
      const result = await response.json();
      if(!response.ok)throw Error(result.error??"No se pudo preparar el inicio rápido.");
      window.location.assign("?"+new URLSearchParams({view:"projects",category:result.categoryId,subproduct:result.subproductId}));
    } catch(reason) {setError(reason instanceof Error?reason.message:"No se pudo continuar.");setBusy(false);}
  }
  return <form className="panel stack quick-start-form" onSubmit={submit}>
    <h2>Inicia rápido</h2>
    <p className="quick-start-guide">Genera de manera rápida las variaciones de las imágenes que quieras.</p>
    <p className="hint">Preparamos un proyecto y un producto propios para organizar tus imágenes. Continuar te lleva al subproducto para revisar las instrucciones, elegir el modo y autorizar la generación.</p>
    <div className="fields"><label>Tema / nombre del subproducto<input name="name" maxLength={160} required placeholder="Por ejemplo: Terapia infantil" /></label><label>Variaciones<input type="number" name="count" min={1} max={12} defaultValue={1} required /></label></div>
    <label>¿Qué imagen quieres crear?<textarea name="prompt" maxLength={30000} placeholder="Describe el anuncio, el estilo, los textos y los detalles que debe incluir." /></label>
    <button className="primary" disabled={busy}>{busy?"Preparando…":"Continuar al subproducto"}</button>
    {error&&<p role="alert" className="notice">{error}</p>}
  </form>;
}
