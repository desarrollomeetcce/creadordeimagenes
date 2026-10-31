"use client";
export function AdvisorMetaNotice({
  updatedAt,
  partial,
}: {
  updatedAt: string | null;
  partial: boolean;
}) {
  return (
    <div className="advisor-analysis-note" role="note" data-advisor-meta-notice>
      <strong>Datos Meta · verifica la sincronización</strong>
      <span>
        Puedes cambiar fechas y diplomado.{" "}
        {updatedAt
          ? `Último informe recibido: ${new Date(updatedAt).toLocaleString("es-PE", { timeZone: "America/Lima" })} · Lima.`
          : "Aún no hay informes para este ámbito."}{" "}
        Esa hora no garantiza cobertura completa.{" "}
        {partial
          ? "Hay datos pendientes o parciales."
          : "Revisa que las cuentas hayan completado el período."}
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
