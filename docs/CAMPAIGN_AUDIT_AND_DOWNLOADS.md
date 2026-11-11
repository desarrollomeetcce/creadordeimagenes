# Descargas por producto y auditoría de campañas

En Proyectos, la columna central ofrece Descargar todo del producto/diplomado activo y Descargar seleccionados. La selección mantiene su alcance por pestaña y entre páginas. La descarga explícita de IDs incluye el subproducto esperado: el servidor rechaza una mezcla de productos antes de leer bytes.

En Biblioteca/Carpetas, Seleccionar permite elegir la página, todas las imágenes y videos, todas las carpetas o todo el contenido visible por lotes. La descarga resuelve los IDs de otras páginas, las copias y los descendientes autorizados de las carpetas. Deduplica los originales y reutiliza exportCollection: máximo 200 recursos y 100 MB por ZIP, caducidad y autorización de todos los archivos antes de leerlos, videos con su extensión original. Los ZIP se construyen para responder; no se almacenan como copias permanentes.

POST /api/library/export acepta selection con los identificadores v:, c:, n: y d:, y format png/jpg. El ZIP contiene imágenes y videos; documentos no se incluyen. Los documentos conservan su descarga individual. Observador puede descargar recursos autorizados y no recibe nuevas acciones de edición. Eliminar usa el flujo y la confirmación existentes de organización de Biblioteca; no cambia su conservación de originales.

## Auditoría de campañas

Auditoría → Campañas y GET /api/campaign-audit son exclusivos de OWNER vigente/aprobado/no archivado. La página carga solo al abrirse y por actualización explícita, con 25 publicaciones por página. Lee CreativeMetaLaunch con status PUBLISHED; no consulta ni modifica Graph, campañas o anuncios.

Los nombres nuevos usan la misma sustitución de variables del publicador y sus datos guardados. Para campañas existentes se conserva el nombre registrado de la campaña seleccionada. Los conteos distinguen conjuntos/anuncios nuevos de los ya existentes, usan comprobantes DONE con IDs válidos y deduplican IDs dentro de cada publicación. Una misma campaña puede figurar en varias publicaciones históricas si recibió anuncios en fechas diferentes.

La respuesta solo incluye nombre final, país, cantidades, fechas, IDs públicos y enlace seguro al nivel campaña de Ads Manager. No serializa textos de anuncios, imágenes, segmentaciones, errores privados, credenciales ni comprobantes completos. La auditoría no afirma el estado actual de entrega/aprobación de Meta ni incorpora campañas creadas fuera del publicador de la plataforma.

No se crea otra tabla histórica ni se duplican publicaciones. La migración 202611110001_campaign_audit_index añade únicamente un índice concurrente por status/updatedAt a la tabla existente. Debe aplicarse durante el despliegue con el proceso habitual de migraciones.

## Verificación

- npm test: 360 pruebas, incluidos nombres con variables/literales, campañas existentes, recibos duplicados e inciertos y enlaces seguros.
- tests/campaign-downloads.integration.test.ts: PostgreSQL exclusivo localhost:55439/delivery_qa, esquema QA actual y respuestas sin APIs externas; selección fuera de página, carpetas anidadas/copias, ZIP real, bloqueo de mezcla de productos, permisos y auditoría sin borradores/fallos ni datos privados.
- Chromium sobre servidor local de producción: descargas de producto completo (27), individual (1), selección de dos páginas (27) y carpetas anidadas deduplicadas (28). Auditoría en escritorio y móvil de 390 px sin desbordamiento del documento ni errores de JavaScript. API real local devolvió 200 para descarga autorizada de Observador y 403 para su acceso a auditoría.
- Índice creado correctamente en PostgreSQL QA. Esta comprobación no valida otras migraciones históricas, la conexión real de Meta ni el despliegue del VPS.
