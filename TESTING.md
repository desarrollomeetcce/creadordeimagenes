# Pruebas y evidencia

Fecha: 15 de octubre de 2026. Entorno: Node.js 24, Next.js 16, Prisma ORM 7.6, PostgreSQL local temporal. No se usa una cuenta de IA real.

## Ejecutadas

| Comprobación               | Resultado                                                     |
| -------------------------- | ------------------------------------------------------------- |
| `npm run db:generate`      | Cliente Prisma generado con WASM                              |
| `npm run db:deploy`        | Migración SQL aplicada correctamente                          |
| `npm run typecheck`        | Correcto                                                      |
| `npm run build`            | Compilación de producción correcta                            |
| `npm test`                 | 10 pruebas unitarias aprobadas                                |
| `npm run test:integration` | 21 escenarios aprobados + contenedor de suite (22 resultados) |

Las unitarias cubren cifrado aleatorio/autenticado/contextual, clave maestra inválida, prioridad comercial Perú/Ecuador y S/90/USD40, ambigüedades, distribución y límites, catálogo compatible, validación de adjuntos, proporciones, contratos del adaptador con transporte simulado y extracción de PDF/DOCX sintéticos.

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

QA visual/responsive con navegador, accesibilidad, cargas de 120 imágenes contra un proveedor real, expiración a 48 horas en reloj controlado, restauración de backups, fidelidad de logos, exclusiones visuales, seguridad avanzada de parsers, reintentos/cancelación, recuperación de contraseña, capas/edición y prueba de generación externa explícitamente autorizada.
