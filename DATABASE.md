# Base de datos

Esquema: `prisma/schema.prisma`. Migración inicial: `prisma/migrations/202610150001_initial/migration.sql`.

Entidades implementadas: User (rol y aprobación), Session, Project, ProjectMember, Category, Subproduct, PromptVersion, Attachment, ProviderConfiguration, GenerationJob, Variation, UsageLedger, AuditEvent y RateLimit.

Relaciones principales: User → Project → Category → Subproduct → Variation. ProjectMember hereda acceso a descendientes. GenerationJob conserva actor, proyecto y snapshot; UsageLedger conserva reserva, consumo y costo real desconocido cuando corresponda. La auditoría no tiene endpoints de escritura o eliminación accesibles directamente a los usuarios.

Eliminación de proyecto = `deletedAt`, con metadatos y relaciones conservados. Los archivos temporales se eliminan independientemente. El seed `cursos-diplomados` es único.

Migraciones: `npm run db:deploy`. El migrador obtiene un advisory lock, verifica SHA-256 de cada SQL y aplica cada migración en una transacción. Se registra en `schema_migrations`. No usar simultáneamente el historial de migraciones de la CLI de Prisma.

Tras la continuación se incorporan carpetas de biblioteca, versiones de diseño, presets oficiales, aprobaciones de variación y límites por usuario/proyecto. Siguen pendientes brand kits, favoritos compartidos, shares granulares y miniaturas administrativas. No se crean tablas vacías para simular funcionalidades inexistentes.

## Migración de la continuación

`202610150002_design_versions` agrega ImageVersion y materializa los originales preexistentes como versión 1. Variation incorpora revision, reviewStatus y deletedAt. Se añaden LibraryFolder, LibraryItem, SavedPreset y BudgetLimit. La conservación previa se migra a LibraryItem del creador. Esta es una migración aditiva: la migración inicial no se modifica.

ImageVersion es inmutable desde los endpoints; restaurar genera una revisión nueva. SourceJobId vincula las versiones creadas por IA con la operación y su ledger. Las carpetas son privadas por usuario; las imágenes siguen sujetas a autorización del proyecto. Los límites particulares son exclusivos del OWNER.
