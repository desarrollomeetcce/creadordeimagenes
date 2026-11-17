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

## Actualización · 17/11/2026: subida y miniaturas

La subida múltiple de Proyectos deja de consultar la galería después de cada archivo y otra vez al finalizar. Sube la tanda en secuencia y actualiza una sola vez al terminar, también si hubo éxitos parciales. Un error de esa lectura no interrumpe los archivos restantes ni vuelve a subir los guardados. La vista ofrece Actualizar recursos y distingue un guardado confirmado de una vista sin actualizar. El lector de respuesta distingue errores HTTP y respuestas incompletas del intermediario; no reintenta escrituras.

El GET de imágenes carga una sola vez la variación y solo projectId/subproductId del trabajo para autorizarla. No descarga dos veces el snapshot del trabajo. Conserva permisos de Biblioteca, acceso delegado, vigencia, borrado, ETag privado con revalidación y descarga del original. Las miniaturas derivadas se reutilizan en memoria del proceso durante un máximo de cinco minutos, con límite16MB/64 entradas. La clave incluye ID, revisión y ruta: editar invalida la reutilización. El acceso y la vigencia se comprueban en cada petición antes de consultar esa caché o responder304.

Meta Ads reutiliza solo miniaturas derivadas, máximo4MB/64 entradas/cinco minutos, por cuenta, anuncio y URL consultada. Mantiene autorización antes y después de obtener los bytes; la comprobación lee solo el ID de cuenta, sin su estado de sincronización, conexión completa ni grants completos. No cachea cuentas, permisos, importes, resultados ni estados publicitarios. Las lecturas coincidentes comparten el procesamiento; fallos y originales grandes no quedan retenidos.

En Proyectos, las consultas automáticas de progreso coincidentes por foco, BroadcastChannel y temporizador comparten una solicitud por ámbito e IDs. La acción explícita posterior a una mutación conserva su lectura nueva y las respuestas antiguas no reemplazan resultados más recientes ni otra carpeta.

Verificación:380 pruebas generales, TypeScript y build. Prueba HTTP con PostgreSQL delivery_qa: subida idempotente, ocho lecturas de miniatura, original idéntico,304, revisión nueva, permiso concedido/revocado con caché poblada, caducidad y borrado; Meta con bytes mock, reutilización, cambio de URL y revocación. Chromium con tres JPG reales: una lectura de galería por tanda frente a cuatro anteriores, fallo503 simulado al actualizar sin interrumpir las tres subidas, recuperación manual y tres imágenes cargadas; ocho eventos de foco durante una lectura demorada producen una sola consulta. Sin errores JavaScript ni solicitudes externas reales.

Estas son mejoras verificadas en el entorno de prueba, no una medición de latencia del VPS, de la conexión del usuario ni de Meta/IA. No se borraron originales ni cachés productivas y no se ejecutaron llamadas pagadas. La caché nueva es acotada y temporal, sin tablas ni migraciones. Publicar main requiere todavía comprobar el despliegue en el servidor.
