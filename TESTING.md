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

## Instalación PostgreSQL externa en Neon

Se validaron y aplicaron las migraciones SQL del repositorio en la base externa creada por el usuario desde Vercel Marketplace. Primera aplicación en copia temporal con caducidad de 24 horas; segunda aplicación en la rama principal, con rol explícito, transacción y guardia de esquema public vacío. Verificación real: 23 tablas, tres entradas con checksums en schema_migrations y cero usuarios. El esquema neon_auth existente no se modificó. Esto verifica la preparación SQL; todavía no verifica navegador → Vercel → Neon ni el ingreso OWNER, porque el acceso del conector Vercel a la configuración devuelve 403.

## Adaptación de archivos y cola a Vercel

Regresión final: **45 escenarios HTTP/PostgreSQL aprobados (46 resultados contando el contenedor)**, ejecutados con STORAGE_BACKEND=postgres y VERCEL=1 sobre base exclusiva temporal. Nuevos casos: dos cargas de 9 MiB compiten por una cuota de 16 MiB y solo una se admite; lectura real desde otra conexión PostgreSQL; respuesta en fragmentos íntegra; rechazo de ruta manipulada y archivo superior al límite; permisos de mantenimiento; bloqueo de procesamiento sin configuración verificada; doble clic con una sola invocación del adaptador; revalidación de cuenta suspendida mediante el endpoint HTTP antes de llamar al proveedor y liberación de reserva; selección parcial y rechazo atómico de IDs ajenos.

La compilación incluye las tres fuentes TTF y su licencia; se comprobó su presencia en route.js.nft.json. Las 15 unitarias se repitieron con fontfile explícito. Prueba de instalación sin base aprobada. Recorrido Chromium con datos sintéticos: uso de cuota y limpieza OWNER, carga y persistencia de adjunto después de recargar y volver a abrir el proyecto, selector de lote parcial y pantalla de procesamiento; sin errores JavaScript. Se inspeccionó Mi cuenta en escritorio y móvil. Una primera ejecución del script intentaba abrir el panel del proyecto justo después de recargar, cuando la navegación actual vuelve a Proyectos; se ajustó el recorrido para volver a abrirlo y se completó satisfactoriamente. Mantener la ubicación al recargar sigue pendiente.

Migración 004 verificada en copia temporal Neon y aplicada a la rama principal, preservando el OWNER existente. Ninguna prueba efectuó llamadas facturables ni utilizó credenciales reales de IA. El procesamiento exitoso usa un doble explícito en el servicio; el endpoint HTTP se prueba con comprobaciones previas que impiden contactar al proveedor. El streaming y los tiempos efectivos de Vercel, la generación real y la ejecución con navegador cerrado necesitan verificación externa.

## Galerías y exportaciones agrupadas

**48 escenarios HTTP/PostgreSQL aprobados (49 resultados contando el contenedor)** sobre la base sintética exclusiva. La nueva colección de prueba contiene dos categorías, varios subproductos, favoritos/aprobados, un permanente con fecha antigua, temporales vencidos, imágenes eliminadas y un proyecto privado de OWNER. Se verifican conteos, paginación sin duplicados, filtros, permisos, respuestas sin rutas privadas ni hashes/credenciales y miniaturas de máximo 640 px.

Los ZIP de proyecto, categoría y subproducto conservan cada archivo independiente en carpetas normalizadas. Se validan PNG y firma JPEG, filtro de favoritos y descargas mixtas autorizadas. Selecciones con un recurso privado responden JSON 404 sin entregar un ZIP parcial. Más de 200 resultados responden 413 antes de leer sus archivos. Una regresión verifica que las excepciones asíncronas de exportación se capturen en el manejador y no se conviertan en un error genérico 500. La prueba anterior de ZIP ahora cuenta archivos y excluye entradas de carpeta.

Chromium: proyecto conservado al recargar; galería agrupada conservada al recargar; Atrás/Adelante entre proyecto y galería; galería individual directa conservada y retorno a su categoría; categoría conservada al recargar; comparación de dos resultados; vista ampliada y siguiente; selección entre páginas; descarga efectiva de 28 JPG organizados mediante los botones reales; enlace privado rechazado en sesión USER independiente. Sin errores JavaScript ni llamadas de IA. Inspección de la pantalla agrupada en escritorio y móvil. El script espera que termine la carga de la página antes de pulsar la paginación, como exige el estado deshabilitado del botón.

La verificación sigue siendo local con PostgreSQL real y archivos reales de prueba. No acredita la fidelidad de una generación externa ni una carga de 120 afiches con proveedor real.

## Configuraciones con adjuntos y colaboradores

**51 escenarios HTTP/PostgreSQL aprobados (52 resultados contando el contenedor)** contra compilación de producción y base local exclusiva, junto con TypeScript, build, 15 unitarias e instalación sin base. Nuevos casos: listado seguro de colaboradores, modificación VIEW/EDIT/GENERATE, rechazo de edición sin permiso, prohibición de redistribuir accesos por colaboradores, protección del creador y revocación efectiva sobre un proyecto privado. Las respuestas de colaboradores se comprueban sin hash ni campos privados de cuenta.

Adjuntos: carga multipart real de TXT, guardado opcional desde una categoría, rechazo de lectura/duplicación personal por otra cuenta y de copia desde categoría privada, descarga tras borrar el original, duplicación con IDs/almacenamiento distintos, aplicación sin/con adjuntos, lectura de compartidos, modificación restringida al autor y conservación de copias tras eliminar la configuración. Un fallo controlado de transacción confirma que no aumenta el número de archivos almacenados ni se publican copias incompletas. También se comprueba el límite de 24 MB usando los bytes reales cuando los archivos procesados son mayores que su tamaño declarado de carga.

Chromium sobre el servidor de producción local: conceder, cambiar y revocar colaboración mediante formularios, comprobación en una sesión USER independiente tras recargar; carga de archivo desde la categoría, guardado con adjuntos, actualización de instrucciones/visibilidad, duplicación personal, aplicación con recarga y eliminación de la configuración sin perder el archivo aplicado. Sin errores JavaScript. Pantalla de configuraciones inspeccionada en escritorio y móvil, accesos en escritorio. No se enviaron correos, no hubo cambios de esquema y no se utilizaron claves ni llamadas facturables reales. La primera ejecución de la nueva prueba de adjuntos falló por buscar un proyecto que otro escenario había renombrado; se corrigió creando una categoría privada exclusiva para esa comprobación y la suite completa pasó.
