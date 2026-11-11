# Conectar proveedores desde el panel

Solo OWNER: Configuración de IA → Conexiones de IA. Seleccione cuenta, introduzca su clave de API y guarde. El campo queda vacío y la lista muestra únicamente la máscara. Consulte los modelos de esa cuenta; no genera imágenes ni acredita saldo. Las verificaciones no vencen por tiempo; se invalidan al cambiar la clave y deben corresponder a su revisión vigente. Nunca comparta claves por chat.

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

## Gemini: parámetros y diagnóstico (11/11)

Proyectos y Pruebas comparten adaptador y validación previa de calidad, resolución y referencias. Google usa calidad `default`, nunca `low`/`medium`/`high` de OpenAI. `gemini-2.5-flash-image` usa resolución automática, sin enviar `imageSize`. Flash Lite Image admite solamente 1K; las familias Pro/Flash Image 3 y Nano Banana 2 reconocidas admiten 1K/2K/4K. No inferir opciones avanzadas para identificadores desconocidos. La validación nativa también protege catálogos antiguos antes de reservar y referencias antes de dirección creativa.

Los rechazos remotos identifican dirección creativa o generación de imagen, HTTP, estado y campos/requisitos de una lista permitida. No se exponen mensajes libres, prompts, claves ni metadatos del proveedor. Un trabajo incierto anterior conserva su estado y no se reintenta ni cambia de modelo automáticamente.

Consultar modelos correctamente no prueba acceso de inferencia ni facturación. La pareja `gemini-2.5-flash` + `gemini-2.5-flash-image` con calidad/resolución automáticas tiene cobertura de solicitudes simuladas, no acredita ejecución real en la cuenta. Google documenta restricciones para nuevos usuarios de `gemini-2.5-flash` en su página de deprecaciones; solo el rechazo real permite determinar si afectan a una cuenta. No sustituir el modelo sin elección del usuario.

Referencias: [modelos deprecados](https://ai.google.dev/gemini-api/docs/deprecations), [Flash Lite Image](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-image), [diagnóstico de la API](https://ai.google.dev/gemini-api/docs/troubleshooting).

Verificación: `npm test` (351 pruebas), build de producción con TypeScript y transportes simulados de generación/dirección. Sin llamadas facturables ni acceso al servidor de producción. La integración PostgreSQL de ajustes de proyecto requiere su base QA aislada y no forma parte de esta ejecución.
