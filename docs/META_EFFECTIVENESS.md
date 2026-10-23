# Efectividad diaria

El módulo lateral Efectividad conserva las tablas/alias existentes (Diplomados inicial). No pertenece a los productos del generador de imágenes. Gestión exclusiva OWNER, igual que el catálogo anterior.

## Identidad y cálculo

Cada fila se identifica por **aliasId + país ISO alpha-2 + moneda de la cuenta**. El país se elige junto al alias en Meta Ads, por objeto o por selección. No se infiere de moneda, segmentación, conexión o nombre de campaña. No hay coincidencias aproximadas ni herencia de alias de un anuncio hacia su campaña. Solo campañas etiquetadas explícitamente participan en Efectividad; las etiquetas de conjuntos/anuncios siguen disponibles en Meta pero no se suman aquí.

Para un día `d`, alias `a`, país `p` y moneda `m`:

- `C = campañas autorizadas con aliasId=a AND aliasCountry=p AND currency=m`.
- `G(d) = Σ spend(c,d)`, para `c ∈ C` con diario importado.
- `B(d) = Σ actions[onsite_conversion.messaging_conversation_started_7d](c,d)` sobre esos mismos diarios. Ausencia de esa acción en un diario válido se interpreta como cero; ausencia del diario es sin dato.
- `V(d)` = número de ventas que escribe el OWNER.
- `CF(d)` = importe de costos fijos manual, en la moneda de la fila.

Se usa exclusivamente el scope `7d_click,1d_view|impression`, igual que el histórico de Meta de la aplicación. No sumar diarios con totales, scopes alternativos, conjuntos o anuncios. Incluye campañas pausadas con histórico. Cuentas diferentes se suman si cumplen ambas etiquetas y usan la misma moneda. Monedas diferentes permanecen separadas; no se inventa conversión. B es conversaciones iniciadas atribuidas por Meta, no personas únicas ni conversaciones recurrentes.

Ejemplo: campaña de cuenta A, alias X+PE con G10/B4 y cuenta B, alias X+PE G20/B6, producen G30/B10. Alias X+AR G99/B9 permanece aparte. Alias Y+PE tampoco participa. Una campaña sin país no entra en ninguna fila nacional.

## Fechas, cobertura y actualización

Rango inicial desde el20 del mes actual hasta hoy (antes del20, desde el1); rango modificable hasta31 días. Fechas de los diarios corresponden a la zona horaria de cada cuenta, no a una conversión horaria reconstruida. El tooltip muestra zonas y hora de recepción en Lima. Hoy puede estar incompleto. Un guion no equivale a cero; `*` indica menos campañas con diario que campañas etiquetadas en la fila.

La vista consulta el endpoint local cada30s cuando está visible. No llama Meta desde GET ni inicia importaciones. Las sincronizaciones existentes actualizan diarios y la siguiente consulta refleja cambios; la cadencia depende del programador, cuota y progreso real de Meta. No prometer gasto en tiempo real. Cambiar alias/país reclasifica el histórico disponible de esa campaña; los manuales se mantienen en su clave alias+país+moneda, sin trasladarse silenciosamente.

## Persistencia y API

Migraciones aditivas005 y006: país nullable en MetaAdObject; MetaEffectivenessRow y MetaEffectivenessDay separados de métricas importadas. Alias existentes conservan ID y asignación, sin país inventado. API antigua que omite country conserva país; quitar alias limpia ambos. La interfaz exige seleccionar país para guardar un alias.

`GET /api/meta-ads/effectiveness?tableId=...&since=YYYY-MM-DD&until=YYYY-MM-DD`: solo OWNER; valida rango y selecciona únicamente campos necesarios, sin credenciales. `PATCH` permite agregar una fila por aliasId/country/currency y guardar day/sales/fixedCost/revision. Rechaza spend/base enviados: B/G son solo lectura. Revisión optimista por fila/día devuelve409 si otra sesión cambió la celda; no reintentar escrituras automáticamente. Guardado bajo lock884411, permiso OWNER aprobado revalidado en transacción y auditoría. No hay operaciones de publicidad ni IA.

Nombre de tabla y diplomado editables conservando IDs y asignaciones; renombrar un alias cambia su etiqueta visible para todos los países. La tabla lógica no es DDL arbitrario. Agregar fila manual no etiqueta ni modifica campañas.
