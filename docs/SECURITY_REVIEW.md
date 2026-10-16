# Revisión técnica de seguridad · 16/10/2026

Revisión de código, dependencias y pruebas locales; no es una certificación ni una prueba de penetración del alojamiento público.

## Controles comprobados

- Sesiones con cookie HttpOnly, estado de cuenta revalidado, roles y acceso por recurso en servidor. Escrituras con Origin permitido. OWNER final protegido.
- Claves de generación, correo y consulta de gastos cifradas en servidor con AES-GCM y clave maestra externa. La credencial de gastos usa un contexto distinto para impedir intercambiar ciphertexts entre funciones. Respuestas/auditoría sin claves ni ciphertext; solo máscaras.
- Lectura/escritura/eliminación de credencial de gastos exclusiva OWNER. Revalidación de rol/aprobación en transacción antes de escribir. Cambiarla no altera la clave ni la revisión de generación.
- Reservas atómicas, propiedad de ejecución por token interno, confirmación de actividad, expiración y publicación condicionada. Procesos tardíos no publican ni cambian costos conciliados. Cargos inciertos conservados y sin reintentos automáticos.
- Autorización y aislamiento de archivos/galerías/ZIP, límites de tamaño/píxeles, SVG sin scripts/entidades/recursos remotos, descarga privada. Orígenes de proveedor fijos y redirecciones rechazadas.
- Recuperación de cuentas y emergencia con tokens hash, caducidad, un solo uso e invalidación de sesiones; SMTP probado con transporte simulado.

Evidencia: 82 escenarios de integración HTTP/PostgreSQL, 19 unitarias, instalación sin base, Chromium, contenedor UID1000 y copia restaurada de 34 tablas/quince migraciones. Las llamadas de IA y SMTP de las suites son simuladas, sin cargos ni correo externo.

## Dependencias

npm audit completo y con omit=dev: cero avisos altos/críticos y tres moderados. Se fijaron versiones corregidas de nanoid en Workflow, y @hono/node-server, valibot, mysql2 y deepmerge-ts en las herramientas Prisma. La actualización mayor transitiva de deepmerge-ts se verificó con generación del cliente, migración, build e integración; no se actualizaron indiscriminadamente dependencias directas.

Persisten mammoth → argparse → sprintf-js (GHSA-hp3w-g68c-fv3c), sin versión corregida de sprintf-js publicada en la consulta. El código de Mammoth importa argparse desde su ejecutable bin/mammoth; la aplicación usa extractRawText de la biblioteca y no ejecuta esa CLI ni acepta cadenas de formato sprintf. No se forzó una versión incompatible ni se ocultó el aviso. Vigilar actualización del proveedor o reevaluar una sustitución del extractor DOCX si cambia el alcance.

## Validación externa pendiente

Referencias/logos, edición y lotes con proveedor real; recepción SMTP; calendario/monitorización/recuperación del alojamiento elegido; consulta real de facturación. La prueba real de imagen ya confirmada no acredita todos esos recorridos. No se inspeccionaron secretos reales ni se eludieron restricciones de red o autenticación.
