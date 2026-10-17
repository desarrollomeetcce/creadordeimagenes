# Conectar proveedores desde el panel

Solo OWNER: Configuración de IA → Conexiones de IA. Seleccione cuenta, introduzca su clave de API y guarde. El campo queda vacío y la lista muestra únicamente la máscara. Consulte los modelos de esa cuenta; no genera imágenes ni acredita saldo. Las verificaciones caducan en24 horas y se invalidan al cambiar la clave. Nunca comparta claves por chat.

Después elija proveedor/modelo de imágenes y proveedor/modelo de dirección creativa. Google y OpenAI permiten dirección creativa; fal.ai y Replicate se usan para imágenes y necesitan una conexión de texto aparte. Seleccione calidad/resolución compatibles, guarde la configuración global y verifique nuevamente. Revise reservas y límites; estos controles no añaden saldo al proveedor. Prueba de generación es opcional y requiere aceptar un posible cargo. No hay reintentos facturables automáticos.

Google Gemini y Google AI Studio usan la misma conexión. Nano Banana es una familia de modelos de imágenes Gemini; Imagen usa otro contrato. Gemini1.5 Flash y Imagen3 fueron retirados: no se fuerzan identificadores antiguos. Los modelos visibles proceden de la API de la cuenta; tener una suscripción Gemini no garantiza crédito API.

fal.ai permite buscar FLUX, Nano Banana o identificador como fal-ai/flux/dev o fal-ai/flux-pro. Se consultan entradas activas y su esquema OpenAPI. Replicate ofrece su colección de texto a imagen, búsquedas de hasta50 resultados o identificador exacto owner/model. Solo modelos compatibles; la búsqueda sustituye el catálogo anterior de la conexión. Puede volver a consultarlo. No se afirma cubrir todos los modelos del mercado.

Parámetros y referencias dependen del contrato de cada modelo. Cuando un modelo no admite referencias, se bloquea el trabajo antes de consumir dirección creativa. Un modelo que exige entradas desconocidas no aparece como compatible. Cambiar catálogo, versión o clave puede exigir volver a autorizar los trabajos pendientes. El resultado de una prueba anterior no verifica un proveedor/modelo diferente.

Los costes por imagen permanecen como No informado si no existe un importe real. El uso de tokens o tiempo no se transforma en dólares mediante tarifas supuestas. Se mantienen reservas y conciliación manual OWNER; gasto diario automático solo está implementado para OpenAI con credencial administrativa independiente.

Fuentes oficiales de los contratos:

- https://ai.google.dev/api/models
- https://ai.google.dev/gemini-api/docs/image-generation
- https://ai.google.dev/gemini-api/docs/changelog
- https://fal.ai/docs/platform-apis/v1/models
- https://fal.ai/docs/documentation/model-apis/inference/queue
- https://replicate.com/docs/reference/http

Validación interna con PostgreSQL/Chromium y respuestas de proveedor simuladas. No acredita generación real en estas nuevas cuentas.
