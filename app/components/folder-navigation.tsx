"use client";
import { useEffect, useState } from "react";
import type { HierarchyValue } from "./hierarchy-filters";
export type FolderNode = {
  id: string;
  parentId: string | null;
  name: string;
  kind: string;
  sourceDeleted?: boolean;
  sourceParentId?: string | null;
};
export function folderScope(
  nodes: FolderNode[],
  key: string,
  value: HierarchyValue,
): HierarchyValue {
  const out = { ...value, project: "", product: "", subproduct: "" };
  if (key.startsWith("folder:")) return out;
  let node = nodes.find((n) => n.id === key);
  const seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    const id = node.id.slice(node.id.indexOf(":") + 1);
    if (node.kind === "project") out.project = id;
    if (node.kind === "product") out.product = id;
    if (node.kind === "subproduct") out.subproduct = id;
    if (node.kind === "tests") out.project = "none";
    node = nodes.find(
      (n) =>
        n.id ===
        (node!.sourceParentId === undefined
          ? node!.parentId
          : node!.sourceParentId),
    );
  }
  return out;
}
export function hierarchyFolder(value: HierarchyValue) {
  return value.subproduct
    ? "subproduct:" + value.subproduct
    : value.product
      ? "product:" + value.product
      : value.project === "none"
        ? "tests:connection-test"
        : value.project
          ? "project:" + value.project
          : "";
}
export function FolderBreadcrumbs({
  nodes,
  current,
  onOpen,
  root = "Biblioteca",
}: {
  nodes: FolderNode[];
  current: string;
  onOpen: (id: string) => void;
  root?: string;
}) {
  const path: FolderNode[] = [];
  let node = nodes.find((n) => n.id === current);
  const seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    path.unshift(node);
    node = nodes.find((n) => n.id === node!.parentId);
  }
  return (
    <nav className="folder-breadcrumbs" aria-label="Ruta de carpetas">
      <button type="button" onClick={() => onOpen("")}>
        {root}
      </button>
      {path.map((n) => (
        <span key={n.id}>
          {" "}
          /{" "}
          <button
            type="button"
            aria-current={n.id === current ? "location" : undefined}
            onClick={() => onOpen(n.id)}
          >
            {n.name}
          </button>
        </span>
      ))}
    </nav>
  );
}
export function FolderTree({
  nodes,
  current,
  onOpen,
  grouped = false,
  dropTarget,
  onContext,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  nodes: FolderNode[];
  current: string;
  onOpen: (id: string) => void;
  grouped?: boolean;
  dropTarget?: string;
  onContext?: (e: React.MouseEvent, id: string) => void;
  onDragStart?: (e: React.DragEvent, id: string) => void;
  onDragOver?: (e: React.DragEvent, id: string) => void;
  onDrop?: (e: React.DragEvent, id: string) => void;
  onDragEnd?: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    const parents: string[] = [];
    let n = nodes.find((n) => n.id === current);
    if (n) parents.push(n.id);
    const visited = new Set<string>();
    while (n?.parentId && !visited.has(n.id)) {
      visited.add(n.id);
      parents.push(n.parentId);
      n = nodes.find((x) => x.id === n!.parentId);
    }
    setExpanded((old) => new Set([...old, ...parents]));
  }, [current, nodes]);
  const children = new Map<string | null, FolderNode[]>();
  const all = new Set(nodes.map((n) => n.id));
  for (const n of nodes) {
    const parent = n.parentId && all.has(n.parentId) ? n.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), n]);
  }
  const branch = (parent: string | null, personal?: boolean) => (
    <ul>
      {(children.get(parent) ?? [])
        .filter(
          (n) => personal === undefined || (n.kind === "folder") === personal,
        )
        .map((n) => {
          const has = children.has(n.id),
            open = expanded.has(n.id);
          return (
            <li key={n.id}>
              <div
                className={
                  "folder-tree-row" +
                  (current === n.id ? " active" : "") +
                  (dropTarget === n.id ? " library-drop-target" : "")
                }
                data-folder-key={n.id}
                draggable={!!onDragStart && n.kind !== "loose"}
                onDragStart={(e) => onDragStart?.(e, n.id)}
                onDragEnd={onDragEnd}
                onDragOver={(e) => onDragOver?.(e, n.id)}
                onDrop={(e) => onDrop?.(e, n.id)}
                onContextMenu={(e) => {
                  if (onContext) {
                    e.stopPropagation();
                    onContext(e, n.kind === "loose" ? "" : "n:" + n.id);
                  }
                }}
              >
                {has ? (
                  <button
                    type="button"
                    className="folder-toggle"
                    aria-label={(open ? "Contraer " : "Expandir ") + n.name}
                    aria-expanded={open}
                    onClick={() =>
                      setExpanded((old) => {
                        const next = new Set(old);
                        next.has(n.id) ? next.delete(n.id) : next.add(n.id);
                        return next;
                      })
                    }
                  >
                    {open ? "−" : "+"}
                  </button>
                ) : (
                  <span className="folder-toggle" />
                )}
                <button
                  type="button"
                  onClick={() => onOpen(n.id)}
                  title={
                    n.name +
                    (grouped && n.kind !== "folder" && n.kind !== "loose"
                      ? " · Evita modificar o mover las carpetas de proyectos; utiliza preferentemente carpetas personales."
                      : "") +
                    (n.sourceDeleted
                      ? " · origen eliminado; carpeta conservada"
                      : "")
                  }
                >
                  📁 {n.name}
                </button>
              </div>
              {has && open && branch(n.id)}
            </li>
          );
        })}
    </ul>
  );
  return (
    <aside className="folder-tree" aria-label="Carpetas">
      <button
        type="button"
        onClick={() => onOpen("")}
        onDragOver={(e) => onDragOver?.(e, "loose:root")}
        onDrop={(e) => onDrop?.(e, "loose:root")}
        onContextMenu={(e) => onContext?.(e, "")}
      >
        📂 Todas las carpetas
      </button>
      {grouped ? (
        <>
          <h3 className="folder-group-label">Carpetas de proyectos</h3>
          {branch(null, false)}
          <h3 className="folder-group-label">Carpetas personales</h3>
          {branch(null, true)}
        </>
      ) : (
        branch(null)
      )}
    </aside>
  );
}
