import { isGraphQuota, requiresMetaReconnect } from "../meta-ads/graph-error";
export function campaignPageIssue(error: unknown) {
  const e = error as {
    status?: number;
    retryAt?: Date;
    diagnostic?: { httpStatus: number; code: number | null };
  };
  const retryAt =
    e?.retryAt instanceof Date && Number.isFinite(e.retryAt.valueOf())
      ? e.retryAt.toISOString()
      : null;
  if (
    e?.status === 429 ||
    isGraphQuota(e?.diagnostic?.httpStatus ?? 0, e?.diagnostic?.code ?? null)
  )
    return {
      kind: "RATE_LIMIT" as const,
      retryAt,
      message:
        "Meta limitó las consultas de esta conexión compartida. Se conserva lo guardado; espera al próximo intento. No necesitas volver a autorizar por este aviso.",
    };
  if (requiresMetaReconnect(error))
    return {
      kind: "AUTH" as const,
      retryAt: null,
      message:
        "La credencial de Meta caducó o fue rechazada. Vuelve a autorizar esta conexión.",
    };
  if (e?.status === 403 || [10, 100, 200].includes(e?.diagnostic?.code ?? -1))
    return {
      kind: "PERMISSION" as const,
      retryAt: null,
      message:
        "Meta no permitió consultar las páginas. Revisa pages_show_list y el acceso de esta credencial a la página.",
    };
  return {
    kind: "UNAVAILABLE" as const,
    retryAt: null,
    message:
      "No se pudo completar la consulta de páginas. Se conservan los datos; vuelve a intentarlo cuando la conexión esté disponible.",
  };
}
