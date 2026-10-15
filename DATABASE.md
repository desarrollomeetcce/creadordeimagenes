# Base de datos

Esquema: `prisma/schema.prisma`. Migración inicial: `prisma/migrations/202610150001_initial/migration.sql`.

Entidades implementadas: User (rol y aprobación), Session, Project, ProjectMember, Category, Subproduct, PromptVersion, Attachment, ProviderConfiguration, GenerationJob, Variation, UsageLedger, AuditEvent y RateLimit.

Relaciones principales: User → Project → Category → Subproduct → Variation. ProjectMember hereda acceso a descendientes. GenerationJob conserva actor, proyecto y snapshot; UsageLedger conserva reserva, consumo y costo real desconocido cuando corresponda. La auditoría no tiene endpoints de escritura o eliminación accesibles directamente a los usuarios.

Eliminación de proyecto = `deletedAt`, con metadatos y relaciones conservados. Los archivos temporales se eliminan independientemente. El seed `cursos-diplomados` es único.

Migraciones: `npm run db:deploy`. El migrador obtiene un advisory lock, verifica SHA-256 de cada SQL y aplica cada migración en una transacción. Se registra en `schema_migrations`. No usar simultáneamente el historial de migraciones de la CLI de Prisma.

Pendientes del modelo maestro: bibliotecas con carpetas, versiones de imagen/diseño, planes estructurados completos, brand kits, presets oficiales, favoritos compartidos, aprobaciones de variación, shares granulares, miniaturas administrativas y límites por usuario/proyecto. No se crean tablas vacías para simular funcionalidades inexistentes.
