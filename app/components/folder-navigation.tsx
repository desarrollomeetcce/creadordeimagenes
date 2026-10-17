"use client";
import { useEffect, useState } from "react";
import type { HierarchyValue } from "./hierarchy-filters";
export type FolderNode = {
  id: string;
  parentId: string | null;
  name: string;
  kind: string;
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
    node = nodes.find((n) => n.id === node!.parentId);
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
}: {
  nodes: FolderNode[];
  current: string;
  onOpen: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    const parents: string[] = [];
    let n = nodes.find((n) => n.id === current);
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
  const branch = (parent: string | null) => (
    <ul>
      {(children.get(parent) ?? []).map((n) => {
        const has = children.has(n.id),
          open = expanded.has(n.id);
        return (
          <li key={n.id}>
            <div
              className={
                "folder-tree-row" + (current === n.id ? " active" : "")
              }
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
              <button type="button" onClick={() => onOpen(n.id)} title={n.name}>
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
      <button type="button" onClick={() => onOpen("")}>
        📂 Todas las carpetas
      </button>
      {branch(null)}
    </aside>
  );
}
