# Arquitectura

## Aplicación y persistencia

Next.js App Router sirve una interfaz React en español y una API Node en `/api/*`. Zod valida entradas. Las operaciones mutantes exigen un Origin exacto; las sesiones usan cookies HttpOnly, SameSite Strict y Secure en producción. Solo se almacena el hash SHA-256 de un token aleatorio de 256 bits; las contraseñas usan Argon2id. El estado de la cuenta se vuelve a comprobar en cada petición. El rate limiting de autenticación es persistente.

`lib/auth.ts` centraliza autorización por proyecto y descendientes. OWNER tiene acceso global. Por instrucción vigente del usuario, ADMIN consulta todos los proyectos y no puede alterar cuentas elevadas ni claves de IA. USER y ADMIN editan/generan en sus proyectos propios o asignados. OBSERVER solo ve y descarga recursos compartidos. Compartir por correo concede asignación; las acciones derivan del rol vigente en cada petición, sin selector por proyecto. La cuenta OWNER final activa está protegida con bloqueo transaccional.

Prisma 7.6 usa `PrismaPg` y compilador WASM, sin motor de consultas nativo. Las migraciones SQL versionadas se aplican con `scripts/migrate.mjs`, `pg`, bloqueo advisory, transacción y checksum. No mezclar este historial `schema_migrations` con `prisma migrate deploy`.

## Instrucciones

El prompt completo inicial de Cursos y Diplomados está precargado y es editable en la base. El seed usa una clave única y una transacción para evitar duplicados. Los proyectos nuevos empiezan con su propio prompt, sin herencia del proyecto educativo.

El motor convencional aplica prioridades Proyecto → Categoría → Subproducto. Detecta precios y un conjunto inicial de países, elimina cláusulas heredadas que contradicen los valores más específicos y marca ambigüedades básicas. No representa comprensión semántica general: requiere revisar y autorizar la vista final. Las sustituciones y las ambigüedades se muestran. Ampliar el motor para preservar de forma más fina instrucciones combinadas dentro de una sola frase, exclusiones visuales y otros mercados.

Adjuntos privados con nombres de almacenamiento aleatorios; validación de formato, tamaño y límite de píxeles. PDF/DOCX se procesan convencionalmente para texto, sin IA ni OCR de pago. El contenido es contexto no confiable y jamás controla roles o presupuestos. Se envían referencias visuales al endpoint de edición de imágenes; se indica su propósito. Falta validar fidelidad gráfica de logos y exclusiones con un proveedor real.

## Configuración de IA

`ProviderAdapter` define descubrimiento, dirección creativa e imágenes. Primer adaptador: OpenAI, con destino fijo `api.openai.com`; no hay URL arbitraria susceptible de SSRF. Para agregar un proveedor, implementar y registrar un adaptador independiente. No se muestran proveedores sin adaptador.

AES-256-GCM usa nonce aleatorio de 12 bytes, etiqueta de autenticación y contexto AAD. La clave maestra de 32 bytes vive fuera de PostgreSQL. El cifrado es versionado; la API devuelve una proyección explícita sin ciphertext, con máscara final. Solo OWNER puede leer o modificar configuración, comprobar conexión o autorizar prueba.

`GET /v1/models` verifica acceso al catálogo. La intersección con capacidades documentadas habilita opciones; no demuestra saldo, acceso efectivo de generación ni calidad de resultados. La verificación caduca en 24 horas y cualquier cambio de configuración la invalida. Las credenciales eliminadas bloquean trabajos pendientes. Una petición ya enviada al proveedor no puede revocarse retroactivamente.

## Generación y costos

Las instrucciones revisadas y la configuración efectiva quedan en un snapshot del trabajo. La cola PostgreSQL permite cerrar el navegador. Cada worker reclama un trabajo con actualización condicional; varios workers no reclaman el mismo trabajo. Cada proceso trabaja secuencialmente. La reserva del lote entero ocurre en una transacción con bloqueo global; verifica límites diario, mensual, por operación y cantidad. Los IDs idempotentes evitan duplicar el mismo trabajo.

Los importes son reservas configuradas por OWNER en microdólares enteros. **No son precios inventados ni un límite garantizado de la factura externa.** Se guarda `usage` del proveedor; `actualMicros` permanece null hasta conciliación. Las operaciones inciertas retienen su reserva. Se recomienda límite adicional en la cuenta del proveedor. La continuación incorpora límites particulares por usuario/proyecto; la conciliación tarifaria sigue pendiente.

El worker invoca dirección creativa y generación, conserva PNG individuales y adapta formatos por contain con márgenes, sin deformación ni recorte. No promete edición de objetos en imágenes aplanadas. No hay reintentos automáticos de llamadas inciertas. Al arrancar se marcan trabajos RUNNING de más de 15 minutos como inciertos; la recuperación completa de leases y cancelación está pendiente.

Los originales expiran a las 48 horas salvo conservación explícita. La limpieza se ejecuta en el worker. Metadatos, consumos y auditoría permanecen. Las descargas PNG/JPG y ZIP se autorizan en backend. El ZIP admite hasta 200 imágenes y 100 MB de originales por operación. Faltan S3 y retención separada de miniaturas administrativas. La continuación incorpora biblioteca con carpetas y versiones.

## Continuación: composición, versiones y productividad

El modo operativo predeterminado ahora es editable. `lib/design.ts` valida un plan creativo JSON con posiciones, colores, fuentes permitidas y referencias de logos autorizados. El adaptador solicita JSON mediante Responses; no se ejecuta HTML o SVG generado por el modelo. Sharp/Pango renderiza textos escapados y logos originales con contain. Un plan inválido se rechaza antes de solicitar otra imagen. La modalidad Texto usa dirección creativa y renderización convencional, sin generación de fotografía.

ImageVersion conserva el documento de capas, PNG y fondo de cada revisión. Variation apunta a su revisión actual. `publishVersion` exige la revisión esperada y crea otra versión; nunca reescribe un archivo anterior. La edición manual no llama a IA. La edición con IA del fondo mantiene el documento; la edición de imagen completa crea una versión aplanada y la interfaz lo indica. Las versiones existentes aplanadas no se presentan como editables.

`LibraryItem` registra conservación por usuario y `LibraryFolder` su jerarquía. La permanencia del original se mantiene mientras exista algún LibraryItem. Las versiones de una variación comparten su retención; una duplicación copia sus archivos para que la caducidad de una copia no elimine los de otra.

`SavedPreset` conserva prompts y parámetros con visibilidad PERSONAL/SHARED/OFFICIAL. `BudgetLimit` agrega límites USER/PROJECT a los globales bajo el mismo bloqueo transaccional. Las reservas tienen siempre origen administrativo, jamás se extraen de documentos ni de prompts.

El worker ahora cancela mediante transición condicional de PENDING y libera su reserva; los reintentos crean trabajos nuevos con autorización y vínculo histórico. La recuperación periódica marca ejecuciones antiguas como inciertas. Todavía falta un lease con heartbeat para despliegues con procesos de duración imprevisible.

Los SVG simples se analizan con lista permitida y se rasterizan; nunca se sirven como SVG activo. Los adjuntos usados por versiones vigentes no se pueden eliminar para impedir romper logos históricos.

Las configuraciones reutilizables almacenan copias de Attachment con scope=preset y resourceId=SavedPreset.id. El acceso se resuelve mediante presetAccess y la visibilidad vigente. Guardar desde categoría, duplicar y aplicar crean bytes nuevos con los adaptadores de almacenamiento existentes; una compensación elimina los archivos preparados si falla la transacción de metadatos. La identidad de marca del proyecto no se copia automáticamente. No hay rutas públicas de archivos ni referencias de almacenamiento entregadas al navegador.

La administración de colaboradores de proyecto se concentra en project-members.ts: creador/OWNER, bloqueo del proyecto para mutaciones, selección explícita de datos de cuenta y auditoría. El campo heredado permission deja de determinar acciones; conceder o revocar asignaciones permanece reservado al creador/OWNER. Los accesos implícitos de los roles se conservan conforme a projectFilter.

La ejecución en segundo plano usa Workflow SDK: generate-batch.ts orquesta pasos aislados que llaman a backgroundTick. Solo se serializan ID de lote, ID de ejecución y resultado CONTINUE/WAIT/STOP. La lista y la autorización permanecen en PostgreSQL; processJob y runOne siguen controlando permisos, revisión, reservas y reclamación atómica. Los pasos que pueden consumir IA no reintentan automáticamente. La pausa es persistente y la conciliación consulta el estado del runtime sin cargar entradas/salidas. El backend de Vercel se detecta por VERCEL_DEPLOYMENT_ID; la ausencia deshabilita la función en ese alojamiento. Las rutas internas generadas no pasan por la autenticación de usuario y usan el protocolo del SDK; las rutas públicas de programación requieren sesión y Origin.

Category incorpora applyPromptToAll y applySettingsToAll independientes. El prompt particular suma indicaciones a las capas activas; el nombre del subproducto se añade como eje temático obligatorio a la vista final y queda en el snapshot de nuevas generaciones. Sin parámetros comunes y sin configuración propia se rechaza la generación antes de reservar. Las personalizaciones explícitas de un subproducto conservan prioridad sobre los valores comunes heredados. Cambiar el nombre de un tema no reescribe afiches existentes.

SavedPreset conserva ambas opciones de aplicación y copias independientes de adjuntos. Puede guardarse/aplicarse desde categoría o subproducto. OWNER/ADMIN consultan todas; USER consulta propias, oficiales y compartidas específicamente mediante PresetShare; OBSERVER consulta oficiales y compartidas. Solo autor u OWNER modifican; oficiales exclusivamente OWNER. No hay compartición pública implícita de una configuración marcada SHARED. La recuperación emite enlaces de un solo uso para entrega privada; no envía correos automáticamente.

## Estadísticas globales

GET /api/system/statistics?days=7|30|90 requiere sesión OWNER. lib/statistics.ts calcula inventario y estados junto con agregados de UsageLedger en una transacción RepeatableRead. Los límites corresponden a medianoche de Perú hasta el instante de consulta; los registros futuros se excluyen. La consulta parametrizada agrupa en servidor por fecha local, usuario, proyecto, categoría, subproducto y modelo. Usa IDs para separar nombres iguales; conserva grupos sin recurso disponible. No carga snapshots, contraseñas, claves, rutas ni respuestas completas del proveedor.

Los totales abarcan todos los registros del período. La respuesta limita los desgloses por recurso a 20 grupos y comunica su cantidad total; días/meses incluyen todos los grupos del período. Importes como enteros de microUSD serializados a texto: reservas excluyen RELEASED, costes confirmados requieren actualMicros no nulo y el resto se mantiene desconocido. Los promedios se basan en afiches con coste confirmado y, para aprobados, en su estado actual. No reconstruye precios ni concilia automáticamente facturación externa. El inventario es actual e independiente del filtro temporal. No requiere migraciones.

## Política vigente de acceso por producto/subproducto

La instrucción más reciente del OWNER sustituye la lectura global ADMIN: ahora solo accede a proyectos propios, asignados o habilitados con Project.allAdministrators por OWNER. Ese grupo tiene edición/generación, mientras OBSERVER conserva consulta/descarga. fullProjectFilter, categoryFullFilter y subproductFilter expresan permisos reales; projectFilter/categoryFilter permiten además navegar hacia un descendiente asignado. NAVIGATE nunca habilita edición, descarga general de ancestros ni acceso a hermanos. Las respuestas incorporan canEdit/canManageAccess/fullAccess; las decisiones se recalculan en servidor.

Compartir se administra por creador del proyecto u OWNER, con directorio acotado de cuentas aprobadas y búsqueda parametrizada por nombre/correo (hasta 200 resultados, advertencia si hay más). Solo OWNER modifica el grupo de administradores. Los selectores combinan escritura y despliegue en un control reutilizable con teclado, grupos de roles y estado sin coincidencias. Los presets tienen el mismo control para seleccionar por nombre; guardar abre directamente el formulario de nombre y captura los valores actuales antes de crear la configuración.
