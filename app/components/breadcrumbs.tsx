"use client";
type Node = { id: string; name: string };
export function HierarchyBreadcrumbs({
  project,
  category,
  subproduct,
  navigate,
}: {
  project: Node;
  category?: Node | null;
  subproduct?: Node | null;
  navigate?: (values: Record<string, string>) => void;
}) {
  const nodes: { label: string; values: Record<string, string> }[] = [
    { label: "Proyectos", values: { view: "projects" } },
    {
      label: "Proyecto: " + project.name,
      values: { view: "projects", project: project.id },
    },
    ...(category
      ? [
          {
            label: "Categoría: " + category.name,
            values: { view: "projects", category: category.id },
          },
        ]
      : []),
    ...(subproduct
      ? [
          {
            label: "Subproducto: " + subproduct.name,
            values: { view: "projects", gallery: subproduct.id },
          },
        ]
      : []),
  ];
  return (
    <nav aria-label="Ruta del proyecto" className="hierarchy-path">
      {nodes.map((node, i) => (
        <span key={node.label}>
          {i > 0 && <span aria-hidden="true"> / </span>}
          <a
            href={"?" + new URLSearchParams(node.values)}
            aria-current={i === nodes.length - 1 ? "page" : undefined}
            onClick={(e) => {
              if (
                navigate &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.shiftKey &&
                e.button === 0
              ) {
                e.preventDefault();
                navigate(node.values);
              }
            }}
          >
            {node.label}
          </a>
        </span>
      ))}
    </nav>
  );
}
