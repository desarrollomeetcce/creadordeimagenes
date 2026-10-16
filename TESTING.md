# Pruebas y evidencia

Fecha: 15 de octubre de 2026. Entorno: Node.js 24, Next.js 16, Prisma ORM 7.6, PostgreSQL local temporal. No se usa una cuenta de IA real.

## Ejecutadas

| Comprobación               | Resultado                                                     |
| -------------------------- | ------------------------------------------------------------- |
| `npm run db:generate`      | Cliente Prisma generado con WASM                              |
| `npm run db:deploy`        | Migración SQL aplicada correctamente                          |
| `npm run typecheck`        | Correcto                                                      |
| `npm run build`            | Compilación de producción correcta                            |
| `npm test`                 | 15 pruebas unitarias aprobadas                                |
| `npm run test:integration` | 33 escenarios aprobados + contenedor de suite (34 resultados) |

Las unitarias cubren renderización independiente, ajustes de precio, límites de textos, escape de marcado, logos autorizados, SVG seguro, cifrado aleatorio/autenticado/contextual, clave maestra inválida, prioridad comercial Perú/Ecuador y S/90/USD40, ambigüedades, distribución y límites, catálogo compatible, validación de adjuntos, proporciones, contratos del adaptador con transporte simulado y extracción de PDF/DOCX sintéticos.

La integración usa HTTP y PostgreSQL reales: bootstrap, idempotencia de seed, CSRF, registro/aprobación/login, roles, último OWNER, rechazo de todos los endpoints de IA para otros roles, ciphertext y máscara, consentimiento obligatorio, bloqueo sin verificación, proyectos aislados, categorías, 12 subproductos, más de 20 por categoría, excepción comercial, distribución inválida, adjunto TXT, estados de conexión con transporte simulado, competencia de reservas, worker con proveedor simulado, PNG/JPG/ZIP, eliminación de clave, auditoría, papelera, restauración y logout.

El caso que inicialmente falló por enviar cuerpo en GET se corrigió y la suite completa se volvió a ejecutar sobre datos temporales limpios. Un fallo inicial del reconocimiento de Perú se corrigió y está cubierto por regresión.

## Reproducción de integración

1. Crear una **base PostgreSQL vacía, exclusiva para pruebas**. Nunca usar la base de trabajo: el test crea cuentas y modifica la configuración global.
2. Configurar y exportar DATABASE_URL, APP_ORIGIN, AI_MASTER_KEY, BOOTSTRAP_TOKEN y STORAGE_PATH de pruebas, iguales para servidor y test. El token debe tener al menos 32 caracteres. APP_ORIGIN = http://localhost:3000.
3. `npm run db:deploy && npm run build && npm start`.
4. En otro proceso con las mismas variables: `npm run test:integration`.
5. El test invoca `runOne()` con un adaptador simulado; **no iniciar un worker real paralelo durante la suite**. El código simulado no es un modo de producción ni se expone en la interfaz.
6. Para repetir, usar otra base vacía. La suite no borra datos automáticamente.

Los resultados simulados prueban contratos, persistencia, permisos y descargas; no prueban conectividad ni generación con OpenAI. Cualquier señal de conexión verificada durante esas pruebas pertenece exclusivamente a la base temporal y se revoca al final.

## Pendientes

QA visual/responsive con navegador, accesibilidad, cargas de 120 imágenes contra un proveedor real, expiración a 48 horas en reloj controlado, restauración de backups, fidelidad de logos, exclusiones visuales, seguridad avanzada de parsers, recuperación automática por correo, recuperación del único OWNER, QA visual del editor y prueba de generación externa explícitamente autorizada.

## Continuación: edición y productividad

La suite ampliada agrega composición editable automática sin fotografía en modalidad Texto, guardado manual, revisión concurrente, restauración sin destruir originales, rechazo de recursos ajenos, edición de fondo con IA simulada preservando capas, bloqueo de ediciones simultáneas, duplicación, aprobación, papelera de afiches, cancelación/liberación y reintento autorizado, carpetas privadas y retención por usuario, configuraciones personales/oficiales, protección de oficiales tras degradación de rol, presupuestos particulares, regeneración selectiva y limpieza de versiones temporales sin dañar otra copia. Los archivos de edición se generan y descargan realmente; el proveedor sigue simulado.

La corrección de una consulta de conteo de variaciones se verificó repitiendo toda la suite en una base vacía. Dockerfile y Compose están preparados, pero no se construyeron ni desplegaron. La interfaz de edición no se verificó todavía con navegador.

## Instalación incompleta en un alojamiento web

`npm run test:installation` inicia una compilación de producción sin DATABASE_URL y comprueba que `/api/auth/status` responde 503 con un mensaje de instalación pendiente, sin indicar que existen usuarios ni exponer nombres de variables o credenciales. Prueba aprobada. La regresión de 33 escenarios con PostgreSQL real también se repitió y aprobó después de la mejora. No se ha verificado aún el despliegue externo del usuario porque todavía no se han conectado Vercel y el proveedor PostgreSQL.

## Identidad de marca y seguridad de cuentas

Regresión ampliada: **40 escenarios HTTP/PostgreSQL aprobados (41 resultados contando el contenedor)**. Se prueban aislamiento de marca entre proyectos, permisos de consulta/edición, revisión concurrente, paletas válidas, selección de logos propios, rechazo de logos de otro nivel, protección contra borrado, herencia y conservación de snapshots tras modificar una identidad.

Cuentas: emisión solo OWNER y con reautenticación, hash sin token en base/auditoría, invalidación del enlace anterior, consumo único incluso concurrente, vencimiento, suspensión y aprobación posterior sin revivir enlaces, cambio de contraseña con comprobación de la actual, cierre de todas las sesiones e invalidación de recuperaciones pendientes.

La compilación de producción, TypeScript, 15 unitarias y la prueba de instalación sin base están aprobados. Ninguna prueba realizó llamadas facturables ni envió correos externos.

Prueba de navegador local con Chromium sobre la compilación de producción y datos sintéticos: ingreso OWNER → abrir proyecto → guardar identidad → generar enlace desde Usuarios → abrir enlace en una sesión independiente → comprobar que se retira el fragmento de la dirección → recuperar contraseña → ingresar con la nueva → cambiarla desde Mi cuenta → volver al ingreso. Recorrido aprobado, sin errores JavaScript. Se revisó la pantalla de marca en escritorio (1365 px) y móvil (390 px). La primera espera del script buscaba una etiqueta con distinto uso de mayúsculas; se corrigió el selector y se repitió el recorrido completo satisfactoriamente. No se ha extendido esta QA al editor ni a toda la plataforma.
