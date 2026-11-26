export const groups = ["CRM", "Marketing", "Publicidad", "Gestión"] as const;
export type Group = (typeof groups)[number];

export const modules = {
  performance: ["Desempeño", "M3 3v18h18 M7 14l4-4 4 2 5-6"],
  accounts: [
    "Subcuentas",
    "m12 2 10 5-10 5L2 7l10-5 M2 12l10 5 10-5 M2 17l10 5 10-5",
  ],
  conversations: [
    "Conversaciones",
    "M21 11a8 8 0 0 1-8 8H7l-4 3v-6a8 8 0 0 1 7-13h3a8 8 0 0 1 8 8",
  ],
  facebook: [
    "Facebook",
    "M14 21v-8h3l1-4h-4V7c0-1 1-2 3-2h1V2h-3c-4 0-5 2-5 5v2H7v4h3v8",
  ],
  calls: [
    "Llamadas",
    "M5 3h4l2 5-3 2c1 3 3 5 6 6l2-3 5 2v4c0 2-2 2-4 2C10 21 3 14 3 7c0-2 0-4 2-4Z",
  ],
  books: ["Libros", "M2 4h8l2 2 2-2h8v15h-8l-2 2-2-2H2Z M12 6v15"],
  contacts: [
    "Contactos y CRM",
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M18 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-4-4",
  ],
  metaads: ["Meta Ads", "m3 10 17-6v14L3 13v-3Z M6 14l2 7h4l-2-6 M20 9h2"],
  products: ["Ventas", "M3 3v18h18 M7 16v-4 M12 16V8 M17 16V5"],
  advisors: [
    "Asesores",
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M17 10l2 2 4-4",
  ],
  inventory: [
    "Inventario",
    "m12 2 10 5v10l-10 5-10-5V7Z M2 7l10 5 10-5 M12 12v10",
  ],
  projects: ["Proyectos", "M2 20V5h7l2 3h11v12Z"],
  "courses-ai": [
    "Cursos IA",
    "m2 8 10-5 10 5-10 5Z M6 10v7c4 4 8 4 12 0v-7 M22 8v8",
  ],
  library: ["Biblioteca", "M3 4h4v16H3Z M10 4h4v16h-4Z M17 4l4-1 3 16-4 1Z"],
  trash: ["Papelera", "M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7"],
  "fixed-costs": [
    "Costos fijos",
    "M4 2h16v20l-4-3-4 3-4-3-4 3Z M8 8h8 M8 12h8",
  ],
} as const;
export type Module = keyof typeof modules;
export type Movable = Exclude<Module, "performance">;
export type Layout = { order: Record<Group, Movable[]>; collapsed: Group[] };
export type Move =
  | { kind: "move"; id: Movable; group: Group; before?: Movable }
  | { kind: "toggle"; group: Group; collapsed: boolean };

export const crmModules = [
  "performance",
  "accounts",
  "conversations",
  "facebook",
  "calls",
  "books",
  "contacts",
] as const;
export const generatorModules = [
  "performance",
  "metaads",
  "products",
  "advisors",
  "inventory",
  "projects",
  "courses-ai",
  "library",
  "trash",
  "fixed-costs",
] as const;
export const initialLayout: Layout = {
  order: {
    CRM: [
      "accounts",
      "conversations",
      "facebook",
      "calls",
      "books",
      "contacts",
    ],
    Marketing: ["metaads", "products", "advisors", "inventory"],
    Publicidad: ["projects", "courses-ai", "library", "trash"],
    Gestión: ["fixed-costs"],
  },
  collapsed: [],
};

export function readMove(value: unknown): Move | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Move;
  if (!groups.includes(v.group)) return null;
  const valid = (id: string) =>
    typeof id === "string" &&
    id !== "performance" &&
    Object.hasOwn(modules, id);
  if (v.kind === "toggle" && typeof v.collapsed === "boolean")
    return { kind: "toggle", group: v.group, collapsed: v.collapsed };
  if (
    v.kind === "move" &&
    valid(v.id) &&
    (v.before === undefined || valid(v.before))
  )
    return { kind: "move", id: v.id, group: v.group, before: v.before };
  return null;
}

export function changeLayout(layout: Layout, move: Move): Layout {
  if (move.kind === "toggle")
    return {
      ...layout,
      collapsed: move.collapsed
        ? [...new Set([...layout.collapsed, move.group])]
        : layout.collapsed.filter((g) => g !== move.group),
    };
  if (move.id === move.before) return layout;
  const order = Object.fromEntries(
    groups.map((group) => [
      group,
      layout.order[group].filter((id) => id !== move.id),
    ]),
  ) as Layout["order"];
  const items = order[move.group];
  const index = move.before ? items.indexOf(move.before) : -1;
  items.splice(index === -1 ? items.length : index, 0, move.id);
  return { ...layout, order };
}
