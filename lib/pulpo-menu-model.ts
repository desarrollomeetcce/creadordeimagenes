export const groups = [
  "CRM",
  "Etiquetas",
  "Marketing",
  "Publicidad",
  "Gestión",
] as const;
export type Group = (typeof groups)[number];

export const modules = {
  performance: ["Desempeño", ""],
  accounts: [
    "Subcuentas",
    "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12 M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17",
  ],
  conversations: [
    "Conversaciones",
    "M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1",
  ],
  facebook: ["Facebook", ""],
  calls: [
    "Llamadas",
    "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z",
  ],
  books: [
    "Libros",
    "M12 7v14 M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",
  ],
  contacts: [
    "Contactos y CRM",
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  ],
  "countries-prices": [
    "Países, cuentas y precios",
    "M3 10h18L12 4 3 10Z M5 11v7m5-7v7m4-7v7m5-7v7M3 20h18",
  ],
  "product-labels": [
    "Etiquetas de producto",
    "m12 2 10 5v10l-10 5-10-5V7Z M2 7l10 5 10-5 M12 12v10 M7 4.5l10 5",
  ],
  "funnel-labels": [
    "Etiquetas de embudo",
    "M20 13l-7 7a2 2 0 0 1-3 0l-8-8V3h9l9 8a1.5 1.5 0 0 1 0 2Z M6 7h.01",
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
export type Layout = {
  version?: 2 | 3;
  order: Record<Group, Movable[]>;
  collapsed: Group[];
};
export type Move =
  | { kind: "restore-groups" }
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
  "countries-prices",
  "product-labels",
  "funnel-labels",
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
  version: 3,
  order: {
    CRM: [
      "accounts",
      "conversations",
      "facebook",
      "calls",
      "books",
      "contacts",
    ],
    Etiquetas: ["countries-prices", "product-labels", "funnel-labels"],
    Marketing: ["metaads", "products", "advisors", "inventory"],
    Publicidad: ["projects", "courses-ai", "library", "trash"],
    Gestión: ["fixed-costs"],
  },
  collapsed: [],
};

export const menuModulesByGroup: Readonly<Record<Group, readonly Module[]>> = {
  ...initialLayout.order,
  CRM: ["performance", ...initialLayout.order.CRM],
};

export function readMenuVisibility(value: unknown): Module[] | null | undefined {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length > Object.keys(modules).length ||
      value.some((id) => typeof id !== "string" || !Object.hasOwn(modules, id)))
    return undefined;
  const selected = new Set<Module>(value);
  return groups.flatMap((group) => menuModulesByGroup[group].filter((id) => selected.has(id)));
}

export function readMove(value: unknown): Move | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Move;
  if (v.kind === "restore-groups") return { kind: "restore-groups" };
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

export function upgradeLayout(layout: Layout): Layout {
  if (layout.version === 3) return layout;
  if (layout.version === 2)
    return {
      ...layout,
      order: { ...layout.order, Etiquetas: initialLayout.order.Etiquetas },
      version: 3,
    };
  const order = Object.fromEntries(
    groups.map((group) => {
      const expected = initialLayout.order[group];
      const old = layout.order[group];
      const misplaced =
        !old ||
        old.length !== expected.length ||
        old.some((id) => !expected.includes(id));
      return [group, misplaced ? expected : old];
    }),
  ) as Layout["order"];
  return { ...layout, order, version: 3 };
}

export function changeLayout(layout: Layout, move: Move): Layout {
  layout = upgradeLayout(layout);
  if (move.kind === "restore-groups")
    return { ...layout, order: initialLayout.order };
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
