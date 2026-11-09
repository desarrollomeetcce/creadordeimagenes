# Rendimiento y conservación · 09/11/2026

Meta Ads conserva sus filtros, permisos y cifras. Las lecturas de cuentas, progreso e informes proyectan únicamente los campos de sincronización necesarios en PostgreSQL: las colas y cursores privados siguen almacenados para reanudar trabajos, pero no viajan al proceso de la API. La autorización de los IDs precede a esa proyección. El informe limita también la consulta inicial a las cuentas solicitadas y autorizadas.

La revisión de datos recientes consulta el último `updatedAt` de hoy y ayer por cuenta y zona horaria mediante dos búsquedas indexadas, en lugar de agrupar todos los diarios de esos días. Las actualizaciones de fondo se agrupan mientras un informe está cargando: al terminar se solicita una actualización pendiente. Cambiar filtros manualmente continúa cancelando el informe anterior. No se prolongan plazos ni se presentan datos antiguos como actuales.

La galería de Proyectos conserva páginas de 24 recursos, orden, permisos, vigencia y formatos. Calcula `isSample` en SQL sin descargar el prompt y las referencias del trabajo. Mantiene la comprobación estricta `previewFirst === true && index === 0`. La preparación temporal de recursos propios deja de consultar órdenes de generación IA.

## Auditoría y mantenimiento

El plazo predeterminado y la política instalada pasan a **siete días**. La migración acorta también el vencimiento de miniaturas anteriores sin extender ninguna caducidad previa. Las vencidas pierden sus bytes y tamaño, conservando el registro histórico mínimo. La vista de Auditoría visual muestra únicamente la ventana de conservación, incluidos los avisos textuales de recursos propios. No se borran imágenes originales, campañas ni registros de actividad.

El mantenimiento existente del worker, cada cinco minutos cuando está ejecutándose, retira miniaturas vencidas y archivos temporales elegibles. Se añade limpieza acotada a 250 filas por tabla de cachés derivados con más de siete días (`MetaInsightCache` y `CreativeMetaPageDirectory`), usando `SKIP LOCKED` y revalidando antigüedad. Se conserva la caché vigente para no encarecer nuevas consultas. No se borran diarios, totales, credenciales, cursores ni configuraciones.

Las 24 horas de recursos propios temporales siguen siendo un máximo: el flujo existente adelanta el vencimiento después de una publicación confirmada y verificada cuando no existe otro intento pendiente que los necesite. Los recursos guardados en Biblioteca permanecen; los originales IA conservan su política propia. El borrado en esta plataforma no elimina la copia que Meta necesita para servir el anuncio. No se promete ausencia total de registros.

## Migraciones

`202611090003` y `004` añaden índices de revisión diaria y galería; `005` aplica siete días a la auditoría; `006` indexa la limpieza de resúmenes. Los índices se crean con `CREATE INDEX CONCURRENTLY`, evitando bloquear escrituras durante su construcción. El migrador reconoce el encabezado `-- @online-index`, admite una sola instrucción de índice validada y repara un índice inválido de un intento interrumpido antes de repetirlo. Conserva el bloqueo de migraciones, checksums y transacciones de las migraciones normales.

## Verificación

`RUN_PLATFORM_PERF_QA=1 DATABASE_URL=postgresql://…/delivery_qa npx tsx --test tests/platform-read-performance.integration.test.ts` exige esa base exclusiva y crea/retira datos sintéticos. Bloquea llamadas externas. Comprueba equivalencia de progreso y fechas, estado durable intacto, 45.000 diarios, índice utilizado, paginación y flags de muestra, política y vista de siete días, borrado de bytes, originales y actividad preservados y eliminación exclusiva de caché vieja.

En la prueba local, la lectura de estados pasó de 6.007.111 a 6.679 bytes y la galería evitó unos 4,8 MB de snapshots por página. No son mediciones del servidor de producción. Chromium verificó un informe real con respuesta demorada artificialmente 12,5 segundos mientras el progreso cambiaba cada cinco: las lecturas terminaron sin abortos por esas actualizaciones. Se verificó ausencia de consultas de órdenes IA durante preparación manual temporal y de errores del cliente. La regresión de entrega y las 321 pruebas generales pasan.

La publicación del código no acredita que el VPS haya aplicado las migraciones o ejecutado la limpieza. Requiere el despliegue y worker/cron operativos habituales; desde este entorno no hay acceso al Hostinger de producción para comprobarlos.
