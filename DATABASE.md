# Base de datos

Esquema: `prisma/schema.prisma`. Migración inicial: `prisma/migrations/202610150001_initial/migration.sql`.

Entidades implementadas: User (rol y aprobación), Session, Project, ProjectMember, Category, Subproduct, PromptVersion, Attachment, ProviderConfiguration, GenerationJob, Variation, UsageLedger, AuditEvent y RateLimit.

Relaciones principales: User → Project → Category → Subproduct → Variation. ProjectMember hereda acceso a descendientes. GenerationJob conserva actor, proyecto y snapshot; UsageLedger conserva reserva, consumo y costo real desconocido cuando corresponda. La auditoría no tiene endpoints de escritura o eliminación accesibles directamente a los usuarios.

Eliminación de proyecto = `deletedAt`, con metadatos y relaciones conservados. Los archivos temporales se eliminan independientemente. El seed `cursos-diplomados` es único.

Migraciones: `npm run db:deploy`. El migrador obtiene un advisory lock, verifica SHA-256 de cada SQL y aplica cada migración en una transacción. Se registra en `schema_migrations`. No usar simultáneamente el historial de migraciones de la CLI de Prisma.

Tras la continuación se incorporan carpetas de biblioteca, versiones de diseño, presets oficiales, aprobaciones de variación y límites por usuario/proyecto. Siguen pendientes favoritos compartidos, shares granulares y miniaturas administrativas. No se crean tablas vacías para simular funcionalidades inexistentes.

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
