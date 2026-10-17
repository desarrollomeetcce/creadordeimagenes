# Base de datos

Historial legible: sin migración nueva. AuditEvent.detail incorpora _activity versión 1 con actorName, contexts (nombres/IDs de proyecto, producto y subproducto) y texto de búsqueda derivado de esos metadatos. Los campos originales del evento se conservan. Las operaciones por lote registran IDs exactos y cantidades para resolver su selección; no se copia GenerationJob.snapshot ni contenido de adjuntos. Los registros anteriores permanecen intactos y se consultan bajo permisos vigentes al resolver nombres actuales.

Migración 011: VisualAuditPolicy conserva activación, plazo, cuota y revisión; incluye política inicial activa de 30 días/32 MB. AuditThumbnail conserva un registro por ImageVersion nueva, metadatos de contexto, WebP BYTEA nullable de hasta 64 KiB, tamaño/dimensiones, estado y fechas. Sin cascada desde originales/proyectos: borrar o caducar esos recursos no borra la auditoría. Limpieza deja data=null y size=0 con EXPIRED; eliminación OWNER usa REMOVED y falta de espacio NO_SPACE. Los metadatos y eventos permanecen. Auditoría visual y StoredAsset comparten el cálculo de cuota PostgreSQL con bloqueo 440819; política/captura/limpieza usan 885302. No modifica contraseñas, proveedores ni archivos existentes.

Migración 010: Attachment.archivedAt nullable y replacesId nullable. Reemplazar archiva el registro anterior y crea uno nuevo en una transacción; no reescribe el archivo ni IDs usados por snapshots/composiciones. Sin relación cascada por replacesId: el historial de reemplazo no impide borrar un archivo que ya no tiene usos protegidos. Lecturas para nuevas generaciones/copias filtran archivedAt=null; los consumidores de snapshots y versiones conservan lectura por ID. Las miniaturas de adjuntos se calculan bajo demanda sin otra copia persistida.

Migración 009: MailConfiguration singleton conserva host/puerto/buzón/nombre, contraseña cifrada AES-GCM, revisión UUID y revisión/fecha de verificación, error saneado y updatedAt. Sin contraseña en claro, mensajes ni enlaces. La clave maestra se mantiene fuera de la base y el AAD de correo es distinto al de IA. Las respuestas OWNER seleccionan campos seguros sin ciphertext; otros roles no consultan la tabla por API. Cambiar configuración invalida la verificación; borrarla no altera cuentas. PasswordReset sigue almacenando solo hash y fecha de caducidad.

Esquema: `prisma/schema.prisma`. Migración inicial: `prisma/migrations/202610150001_initial/migration.sql`.

Entidades implementadas: User (rol y aprobación), Session, Project, ProjectMember, Category, Subproduct, PromptVersion, Attachment, ProviderConfiguration, GenerationJob, Variation, UsageLedger, AuditEvent y RateLimit.

Relaciones principales: User → Project → Category → Subproduct → Variation. ProjectMember hereda acceso a descendientes. GenerationJob conserva actor, proyecto y snapshot; UsageLedger conserva reserva, consumo y costo real desconocido cuando corresponda. La auditoría no tiene endpoints de escritura o eliminación accesibles directamente a los usuarios.

Eliminación de proyecto = `deletedAt`, con metadatos y relaciones conservados. Los archivos temporales se eliminan independientemente. El seed `cursos-diplomados` es único.

Migraciones: `npm run db:deploy`. El migrador obtiene un advisory lock, verifica SHA-256 de cada SQL y aplica cada migración en una transacción. Se registra en `schema_migrations`. No usar simultáneamente el historial de migraciones de la CLI de Prisma.

Tras la continuación se incorporan carpetas de biblioteca, versiones de diseño, presets oficiales, aprobaciones de variación y límites por usuario/proyecto. Siguen pendientes favoritos compartidos y miniaturas administrativas. No se crean tablas vacías para simular funcionalidades inexistentes.

## Migración de la continuación

`202610150002_design_versions` agrega ImageVersion y materializa los originales preexistentes como versión 1. Variation incorpora revision, reviewStatus y deletedAt. Se añaden LibraryFolder, LibraryItem, SavedPreset y BudgetLimit. La conservación previa se migra a LibraryItem del creador. Esta es una migración aditiva: la migración inicial no se modifica.

ImageVersion es inmutable desde los endpoints; restaurar genera una revisión nueva. SourceJobId vincula las versiones creadas por IA con la operación y su ledger. Las carpetas son privadas por usuario; las imágenes siguen sujetas a autorización del proyecto. Los límites particulares son exclusivos del OWNER.

## Identidad y recuperación

`202610160003_brand_kits` incorpora BrandKit (uno por proyecto, con revisión), BrandLogo (solo adjuntos de imagen del mismo proyecto autorizados como logos) y PasswordReset (token aleatorio de 256 bits almacenado exclusivamente como SHA-256, caducidad de 30 minutos). Las claves foráneas protegen los archivos seleccionados. Los afiches guardan una copia JSON de su identidad en el snapshot del trabajo.

Consumir un enlace y eliminar los demás enlaces/sesiones del usuario ocurre en una sola transacción bajo bloqueo de la cuenta. Cambiar contraseña, rol o estado también revoca los enlaces pendientes. Ni los hashes de contraseña ni los tokens de recuperación se incorporan a la auditoría. El enlace usa un fragmento URL eliminado al abrirse; el token se envía solamente en el cuerpo de la solicitud de restablecimiento.

## Archivos de prueba en PostgreSQL

`202610160004_stored_assets` agrega StoredAsset con UUID, BYTEA privado, tamaño validado por CHECK y fecha de creación. La suma de tamaños se comprueba bajo advisory lock transaccional antes de guardar. La aplicación conserva referencias `pg:<uuid>`; nunca expone un endpoint de lectura sin autorización del proyecto. Los recursos locales existentes conservan su lectura por UUID sin prefijo. No hay migración automática de archivos de un mecanismo a otro.

Las limpiezas de temporales y versiones liberan también los BYTEA; las copias independientes usan recursos distintos. Una cuota de 128 MiB limita los archivos de la prueba, no toda la base ni sus costes. Para escala de producción se mantiene pendiente un adaptador de almacenamiento de objetos.

## Consulta de colecciones

Las galerías agrupadas y los ZIP reutilizan Variation, GenerationJob, Subproduct y Category; no añaden tablas. Paginación estable por createdAt/id, conteo y página bajo RepeatableRead, proyección de metadatos sin rutas y autorización del recurso padre. Se comprueba expiración por fecha junto con permanent, expired y deletedAt. El límite de exportación se comprueba antes de leer archivos; el esquema no se modifica. La evaluación de índices y cargas a escala queda para la fase de rendimiento.

Migración 005: BackgroundBatch registra iniciador, clave de solicitud idempotente, lista JSON de IDs de trabajos autorizados, ID interno de ejecución, estado, error comprensible y fechas. No almacena claves ni prompts. El SQL incluye un índice único parcial por actorId para estados STARTING/ACTIVE/PAUSING/DISPATCH_UNCERTAIN, mantenido por el migrador versionado; requestKey es único. La migración no altera datos existentes ni neon_auth.

Migración 006: nuevo valor OBSERVER en Role; applyPromptToAll/applySettingsToAll con valor inicial true en Category y SavedPreset; PresetShare con clave compuesta y referencias que se eliminan en cascada. Las asignaciones ProjectMember pasan a ROLE; los valores históricos VIEW/GENERATE/EDIT/MANAGE ya no determinan permisos. Los datos existentes conservan prompts, parámetros y opciones activas; una SHARED requiere destinatarios explícitos para las cuentas normales. OWNER/ADMIN conservan lectura global de configuraciones.

## Productos y accesos por nivel

La interfaz denomina Producto al nivel persistido como Category. Se conservan IDs, rutas y datos anteriores para compatibilidad. La migración aditiva 202610160007_scoped_access añade Project.allAdministrators (false por defecto, incluso en proyectos existentes), CategoryMember, SubproductMember y Subproduct.deletedAt. Los miembros directos heredan acceso a descendientes según su rol. La propiedad y los accesos individuales se conservan al desactivar el grupo ADMIN. OWNER conserva acceso global; ADMIN ya no obtiene lectura global implícita de proyectos.

Una asignación a un descendiente solo habilita metadatos mínimos de ancestros para navegar y filtra hermanos en listados, conteos, galerías y exportaciones. Las autorizaciones de adjuntos y variaciones se validan por su ámbito, y el worker revalida el subproducto antes de consumir IA. Las operaciones ya autorizadas conservan su contexto heredado; ello no concede descarga general de adjuntos del ancestro. La biblioteca vuelve a filtrar permisos vigentes al listar.

Eliminar subproductos establece deletedAt, conserva relaciones, variaciones, versiones y auditoría, y los excluye de nuevos lotes/listados/descargas. Bajo el bloqueo de reclamación del worker, se rechaza RUNNING y se cancelan PENDING liberando sus reservas. Se vuelve a comprobar cuenta y asignación dentro de la transacción. No se destruyen archivos; la retención temporal de archivos sigue su política habitual. La restauración desde la interfaz se incorporó posteriormente.

## Recuperación de espacios

La restauración de subproductos reutiliza deletedAt y no necesita una migración. GET /api/categories/:id/subproducts/trash exige edición del producto; devuelve nombres, fecha y conteos, con búsqueda y paginación de 20. POST /api/subproducts/:id/restore exige ese mismo permiso, revalida cuenta y asignación dentro de la transacción, usa el bloqueo de reclamación de trabajos y compara la fecha eliminada antes de cambiarla a null. Restauraciones concurrentes generan una sola actualización/auditoría y la otra responde 409. El proyecto debe estar activo.

Se conservan prompt, settings, relaciones, versiones y miembros directos; las cuentas recuperan únicamente los permisos que su rol y asignaciones vigentes permiten. No se recrean archivos caducados, no se crean trabajos/ledgers y no se reactivan trabajos cancelados ni reservas liberadas. Un usuario asignado únicamente al subproducto, sin edición del producto padre, no administra la papelera.

## Código de emergencia OWNER

La migración aditiva 008 añade OwnerRecovery, una fila por cuenta: userId como PK/FK, tokenHash único, createdAt/expiresAt. El código aleatorio de 256 bits se devuelve una vez, con prefijo OWNER-, y se persiste SHA-256 con separación de propósito. No se descifra ni se obtiene desde GET; estado devuelve solo fechas/activación. Cambios de contraseña, rol/estado y recuperación ordinaria borran la fila.

Generar/revocar requiere OWNER aprobado, contraseña actual y revalidación de hash/rol bajo bloqueo de la cuenta. El consumo público exige correo OWNER aprobado, hash vigente y fecha; se bloquea la cuenta, se consume la fila y se cambian contraseña/sesiones/enlaces en una transacción. Errores genéricos y límites globales/por cuenta; dos usos concurrentes producen un único éxito. No cambia claves de IA ni su clave maestra.


## Migración 012 · mantenimiento

Variation.filesQueuedAt marca encolado duradero de todos sus archivos tras caducar; la operación bloquea la fila y excluye permanentes. AssetDeletion conserva únicamente rutas privadas, intentos y próxima fecha; un borrado solo retira la fila después de confirmar archivo ausente. No se expone su contenido en APIs. MaintenanceRun registra ejecuciones acotadas, fuente, estado, conteos y error saneado. Las dos tablas comienzan vacías; migrar no limpia imágenes ni cambia conservación o credenciales. Índices para pendientes/caducidad/fecha.

## Migración 013 · retirada del listado de generaciones

GenerationJob.archivedAt nullable e índice por archivedAt/createdAt. No elimina trabajos, resultados, reservas ni historial. Listados de Generaciones actuales excluyen retirados y ofrecen vista explícita de retiradas; informes de consumo, cuotas y mantenimiento siguen incluyendo esos registros. Escritura transaccional bajo bloqueo 728291, solo estados terminales y acceso vigente. Restaurar no reencola ni llama al proveedor. Migración aditiva aplicada con checksum en local y copia antes de rama conectada.

Conciliación manual de costes: sin migración adicional. UsageLedger.actualMicros se actualiza con control de concurrencia y cada cambio añade AuditEvent COSTE_IA_CONCILIADO (resourceId = ledger, importes anterior/nuevo como cadenas microUSD, referencia y jobIds para contexto). Último evento proporciona token de concurrencia y procedencia manual; eventos anteriores son inmutables. No modifica status ni reservedMicros y no expone referencias por consultas de usuarios normales.


## Actividad de ejecución y acceso financiero

202610160014_job_lease añade GenerationJob.leaseToken y heartbeatAt opcionales e índice status/heartbeatAt. startedAt conserva el inicio original. Nuevos trabajos reclamados usan token único, heartbeat cada30s, expiración15min y publicación condicionada; anteriores permanecen compatibles.

202610160015_billing_credentials añade ProviderBillingCredential por proveedor: encryptedKey, maskedKey y updatedAt. Cifrado contextual separado de generación, sin migración de secretos existentes. Ambas son aditivas y se aplican con scripts/migrate.mjs/checksum/bloqueo; no editar migraciones aplicadas.

## Migración016 · conexiones independientes

202610170016_provider_connections añade creativeProvider nullable a ProviderConfiguration y ProviderConnection por proveedor con encryptedKey/maskedKey, revision/verifiedRevision, verifiedAt, status/error y catálogo JSON. El backfill conserva cifrado y estado del proveedor global; no descifra credenciales ni crea claves de otros proveedores. Scripts versionados con checksum; aplicada en local/copia y rama conectada, verificando igualdad interna de clave cifrada/modelos sin devolver sus valores.

## Migraciones017/018 · planes y pagos

MembershipPlan con precios en centavos y presupuesto IA en microUSD; null en cuotas significa Ilimitado interno. User.planId/planValidUntil nullable conserva cuentas previas sin asignación. Índice UsageLedger(actorId,createdAt) para cuotas mensuales. PaymentConnection guarda credenciales cifradas por contexto payments:provider:credentials, máscaras, entorno, moneda/tasa, vendedor y revisión/verificación. PlanPurchase fija importe/moneda/plan/proveedor/revisión/entorno, referencias externas únicas, solicitud idempotente y estado/fechas. No contiene secretos de pago. Migraciones versionadas/checksum, aditivas y probadas en copia antes de producción.
