"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
export function ExpandablePanel({ title, children }: { title: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), previous = useRef<HTMLElement | null>(null), wasExpanded = useRef(false);
  useLayoutEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (expanded) previous.current = document.activeElement as HTMLElement | null;
    node.close();
    if (expanded) node.showModal();
    else { node.show(); if (wasExpanded.current) previous.current?.focus(); }
    wasExpanded.current = expanded;
  }, [expanded]);
  return <dialog open ref={dialog} className={"expandable-panel " + (expanded ? "expanded" : "inline")}
    aria-label={title} aria-modal={expanded || undefined} onCancel={event => { event.preventDefault(); setExpanded(false); }}>
    <div className="row spread expandable-panel-bar">
      <h2>{title}</h2>
      <div className="row"><button type="button" onClick={() => setExpanded(!expanded)}>{expanded ? "Volver a la página" : "Abrir ventana amplia"}</button>{expanded&&<button type="button" className="window-close" aria-label="Cerrar ventana de marca" onClick={()=>setExpanded(false)}>×</button>}</div>
    </div>
    {children}
  </dialog>;
}
