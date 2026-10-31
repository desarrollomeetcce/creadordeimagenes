"use client";
export function AdvisorMetaNotice({
  updatedAt,
  partial,
  hasMetaSource = true,
}: {
  updatedAt: string | null;
  partial: boolean;
  hasMetaSource?: boolean;
}) {
  return (
    <div
      className="advisor-analysis-note advisor-compact-note"
      role="note"
      data-advisor-meta-notice
    >
      <strong>Datos Meta</strong>
      <span>
        {updatedAt
          ? `Último informe: ${new Date(updatedAt).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" })} · Lima.`
          : hasMetaSource
            ? "Sin informes para estas fechas."
            : "Sin base Meta asignada en estas fechas."}{" "}
        {partial ? "Cobertura parcial." : "Verifica la cobertura del período."}
      </span>
      <a
        href="/?view=metaads&metaTab=sync"
        target="_blank"
        rel="noopener noreferrer"
      >
        Verificar sincronización ↗
      </a>
    </div>
  );
}
