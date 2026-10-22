export const focusedLabels = [
  "Campañas con entrega reciente",
  "Conjuntos con entrega reciente",
  "Anuncios con entrega reciente",
  "Campañas activas",
  "Conjuntos activos",
  "Anuncios activos",
  "Detalles de campañas",
  "Detalles de conjuntos",
  "Detalles de anuncios",
  "Comparativos de hoy, 7, 15 y 30 días",
  "Histórico acumulado de los elementos seleccionados",
];

// The selection window of a new run is not proof that its reports are ready.
export function focusedReportDay(raw:unknown):string|undefined {
  const s=(raw && typeof raw === "object" ? raw : {}) as {plan?:string;recentReady?:boolean;lastReportUntil?:string;until?:string;lastRun?:{plan?:string;until?:string}};
  if(s.plan!=="focus" && s.lastRun?.plan!=="focus")return undefined;
  return (s.recentReady?s.until:s.lastRun?.until)??s.lastReportUntil;
}
