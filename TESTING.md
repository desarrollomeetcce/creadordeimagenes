# Pruebas y evidencia

## Continuación: mantenimiento y reintentos de borrado

68 escenarios de integración HTTP/PostgreSQL aprobados (69 resultados incluyendo el contenedor), cuatro escenarios SMTP adicionales, 15 unitarias, TypeScript/build e instalación sin base. El caso nuevo provoca un error real de DELETE sobre un StoredAsset sintético con un trigger temporal, verifica estado PARTIAL y AssetDeletion con attempts=1/espera de cinco minutos, ausencia de mensaje técnico/rutas/secreto en DTO e historial, caducidad y encolado atómicos, fondo retirado, versiones conservadas y archivo permanente intacto. Retirado el trigger, la siguiente pasada confirma el borrado y elimina su entrada pendiente. Se comprueban OWNER, ADMIN/USER/OBSERVER 403, anónimo 401, cron sin Bearer/incorrecto 401, ejecución autorizada, mantenimiento activo 409, recuperación de marca obsoleta y trabajo/ledger UNCERTAIN sin liberar reserva ni regenerar.

Una prueba inicial detectó nextAttemptAt posterior al instante de selección por milisegundos; se fijó al instante recibido por la pasada. Toda la integración se repitió con base sintética limpia. La instalación sin base añade comprobación de cron sin secreto 503, sin revelar cabecera. La migración se verificó también aplicando las doce desde cero en otra base local vacía, manteniendo su orden versionado.

Chromium: OWNER Mi cuenta, ejecución recibida, limpieza manual y resultado, historial, rechazo concurrente, actualización, ADMIN sin sección/API y 390 px sin desbordamiento/errores JS. Se corrigió el helper pg del guion de navegador; el recorrido completo pasó. Backup restaurado en otra base local con conteos de 17 tablas, doce migraciones y hashes de archivos/miniaturas idénticos. Migración 012 aditiva en copia Neon antes de rama conectada; cero entradas de mantenimiento/cola externas tras aplicar. Ninguna limpieza real, IA facturable ni correo externo. La programación Vercel externa sigue pendiente de CRON_SECRET y recepción real.

La tarea independiente `npm run maintenance` completó una pasada local con salida de conteos y sin iniciar generaciones. La compilación final y la instalación sin base volvieron a pasar tras adelantar el mantenimiento al procesamiento del worker, de modo que libera vencidos antes de comprobar espacio para el siguiente trabajo.

## Continuación: filas de configuraciones guardadas

Comprobación pertinente a interfaz: TypeScript, compilación de producción y las 15 pruebas unitarias. Chromium usa PostgreSQL local sintético y las rutas reales de configuraciones: búsqueda sin tildes, filtros/limpieza, edición de nombre/instrucciones y parámetros, distribución inválida rechazada antes de guardar, persistencia tras recargar, expansión de detalles, duplicación, cancelación/confirmación de borrado, y acciones según permisos de USER/ADMIN/OWNER. La API y sus políticas permanecen intactas; esta etapa no introduce migraciones ni llamadas de IA. Los avisos de guardado se mantienen en el panel aunque renombrar o cambiar visibilidad retire la fila del filtro activo.

Resultado final aprobado, incluida instalación sin base. En móvil de 390 px las columnas se presentan con sus etiquetas en cada registro, con todos los botones y detalles legibles sin desbordamiento horizontal de página. Sin errores JavaScript. Se repitió el recorrido tras centralizar los avisos y adaptar la tabla a móvil; el script también usa entradas controladas reales al corregir la distribución numérica.

## Continuación: historial con contexto y detalles

67 escenarios HTTP/PostgreSQL aprobados (68 resultados con contenedor), 15 unitarias, TypeScript y compilación. El caso nuevo cubre nombres de persona/proyecto/producto/subproducto, dos subproductos exactos creados, eventos nuevos de edición, snapshot de nombres tras renombrar, lectura sin reescritura de AuditEvent y distinción solicitud/completado. La búsqueda encuentra una actividad antigua tras añadir 230 registros, pagina 25 sin repetir, trata porcentajes y barras como literales y parametriza intentos de inyección. Se prueban registro antiguo sin IDs de hijos, falta de acceso actual sin revelación por búsqueda, OWNER global, ADMIN/USER solo operaciones propias, OBSERVER 403, sin sesión 401, campos/límites inválidos y proyección sin claves, contraseña, tokens o prompts de un registro sintético malformado.

Las nuevas capturas usan metadatos en la misma conexión de la transacción; no cargan snapshots de prompts ni contenido de adjuntos. Operaciones de producto/instrucciones agregan eventos atómicos. No hay migración ni cambios de datos externos existentes: el enriquecimiento de registros antiguos ocurre solo durante lectura.

Chromium aprobó resumen con persona/nombres, expansión del evento con dos subproductos concretos, búsqueda sin resultados, limpieza mediante teclado, paginación siguiente/anterior, aislamiento USER y pantalla de 390 px sin desbordamientos ni errores JavaScript. La suite SMTP adicional pasó sus cuatro escenarios (cinco resultados con contenedor) y la instalación sin base devolvió el estado pendiente correcto. Sin llamadas reales de IA ni envíos externos de correo.

## Continuación: auditoría visual independiente

66 escenarios HTTP/PostgreSQL aprobados (67 resultados contando la suite), cuatro escenarios de correo, 15 unitarias, TypeScript/build e instalación sin base. Se comprueba captura automática de generación/edición/restauración/duplicado, tamaño ≤64 KiB y dimensión ≤384, WebP decodificable, API exclusiva OWNER en todos los métodos, política sin imágenes para los otros roles, respuestas paginadas sin bytes, 200/409 concurrente de política y borrado con contraseña, plazo por versión, opción de aplicar a existentes sin resucitar caducadas, captura desactivada y metadatos persistentes. Caducar originales o borrar proyecto no impide leer una miniatura vigente; caducar miniatura devuelve 410 antes de limpiar, y la limpieza elimina BYTEA sin borrar su registro ni el afiche. Cuota sintética comprueba bloqueo antes de IA, NO_SPACE con afiche conservado y aviso, inclusión en cuota global y auditoría sin contraseña.

Chromium: cambiar conservación 365/30, aviso de privacidad actualizado, imagen WebP realmente decodificada, eliminación protegida, búsqueda sin resultados/limpieza por teclado, recarga, ADMIN sin menú ni API y móvil 390 px sin desbordamientos/errores JS. El script inicial no disparaba el cambio al vaciar el campo controlado; se corrigió con Ctrl+A/Backspace. Revisión final movió limpieza antes de la comprobación global de espacio y secuenció consultas en la misma transacción; compilación, integración y navegador volvieron a pasar.

Backup/restauración local actualizado: conteos de 15 tablas, once migraciones y hashes de cinco archivos y cinco miniaturas BYTEA coinciden con el snapshot exportado. El helper dejó de enviar consultas paralelas a un único cliente pg. Migración 011 probada en copia Neon y aplicada en la rama conectada. Sin procesamiento retroactivo de imágenes, pruebas de carga real, proveedor real ni envío externo de correo. La caducidad de acceso se valida en lecturas; la ejecución física por calendario cuando el alojamiento esté inactivo necesita planificador y verificación externa antes de certificar producción.

## Continuación: adjuntos con historial

65 escenarios HTTP/PostgreSQL aprobados (66 resultados con contenedor), 15 unitarias, TypeScript, build, instalación sin base y suite de correo. El caso nuevo prueba miniatura WebP de 1280×640 a 320×160 sin deformación, no-store/nosniff, 401 sin sesión, 404 sin ámbito y lectura OBSERVER compartida sin edición; dos reemplazos paralelos devuelven 201/409 con un solo archivo nuevo y auditoría; bytes e ID anteriores intactos; metadatos sin paths; herencia/copias de presets excluyen archivados; logos de versiones existentes usan bytes anteriores; rechazo de borrado con versiones o trabajo activo y aceptación después de cancelar; TXT sin miniatura 415; PNG falso y ámbito incorrecto conservan metadata/almacenamiento. La base es local y sintética; ningún proveedor de IA participa.

Chromium verificó cargar una imagen, miniatura realmente decodificada, elegir reemplazo, archivo nuevo visible, historial anterior expandible, original accesible, persistencia al recargar y ancho móvil de 390 px sin desbordamientos ni errores JS. El script se ajustó al punto de entrada instalado de Sharp, sin cambios de producto. Migración 010 local/copia Neon/base conectada con checksum; la herramienta remota requirió separar los dos ALTER dentro de una misma transacción.

## Continuación: correo SMTP

15 unitarias y las 64 situaciones HTTP/PostgreSQL anteriores (65 resultados con contenedor) aprobadas. Cuatro escenarios nuevos en `npm run test:mail` (5 resultados con contenedor) usan base local sintética y adaptador SMTP explícitamente simulado, sin red de correo: exclusividad OWNER en todos los métodos, contraseña actual, puertos, AES/AAD, GET sin secreto/ciphertext, guardar sin nueva contraseña, invalidación de verificación, revisión concurrente, fallo de autenticación saneado, envío de prueba al correo de acceso, destino de recuperación fijado a la cuenta, rechazo de recuperación elevada por ADMIN, hash/caducidad/un uso, token ausente de respuesta y auditoría, invalidación tras fallo incierto, borrado protegido y rechazo de IPv4 privadas/reservadas/IPv6. TypeScript y compilación aprobados. El primer intento detectó el orden de validación del rol frente a APP_ORIGIN en producción local; se corrigió y la suite SMTP completa pasó.

Ejecutar `npm run test:mail` después de la integración, con el mismo servidor y variables sintéticas. Este archivo exige el socket exclusivo `/workspace/work/pgdata`, crea cuentas de prueba y modifica/elimina la configuración global de correo: nunca ejecutarlo contra Neon o la instalación del usuario. Los estados SMTP simulados solo existen en esa base. No acredita conectividad ni entrega en Hostinger real.

Chromium: panel OWNER, guardar y recargar con contraseña vacía/máscara, respuestas sin secreto ni ciphertext, verificación con contraseña incorrecta rechazada antes de SMTP, eliminación, menú no visible para ADMIN y vista móvil de 390 px sin desbordamientos ni errores JavaScript. Se corrigió la espera del script de ingreso que navegaba antes de completar autenticación. Migración 009 verificada local/copia Neon y aplicada en la base conectada; nueve migraciones y cero configuraciones externas de correo. No se enviaron correos ni usaron credenciales reales.

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
2. Configurar y exportar DATABASE_URL, APP_ORIGIN, AI_MASTER_KEY, BOOTSTRAP_TOKEN y STORAGE_PATH de pruebas, iguales para servidor y test. Para probar Workflow local, exportar además WORKFLOW_TARGET_WORLD=local y WORKFLOW_LOCAL_DATA_DIR a un directorio persistente exclusivo de pruebas, iguales en ambos procesos; no establecer VERCEL en esta ejecución. El token debe tener al menos 32 caracteres. APP_ORIGIN = http://localhost:3000.
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

## Ejecución duradera en segundo plano

**54 escenarios HTTP/PostgreSQL aprobados (55 resultados contando el contenedor)**, TypeScript, build, 15 unitarias e instalación sin base. La compilación incluye el workflow y sus rutas internas. Migración 005 aplicada en la base sintética y verificada en copia de Neon antes de la principal; historial de cinco migraciones y cuatro índices de BackgroundBatch comprobados en la copia, sin cuentas o claves externas modificadas.

Nuevos casos: exclusión de trabajos ajenos, dos solicitudes concurrentes con el mismo UUID producen un solo lote, reutilización del UUID para otra selección se rechaza, una ejecución distinta no toma un lote vinculado, pausa mientras se genera con transporte simulado termina el actual y no inicia el siguiente, nueva programación explícita de los pendientes, cargo incierto conserva su reserva y detiene toda la secuencia sin reintentos. Los dobles del proveedor permanecen en el proceso de tests; no hay modo de proveedor ficticio en producción.

Prueba adicional usa el SDK real local y HTTP real: programar un trabajo con revisión de configuración deliberadamente obsoleta, repetir la petición idempotente, esperar la ejecución sin navegador, comprobar FAILED/NEEDS_REVIEW y reserva RELEASED. El rechazo ocurre antes de descifrar o llamar al proveedor. Los datos del runtime son privados y quedan fuera de Git.

Chromium: cuenta y proyecto sintéticos independientes, envío desde Generaciones, cierre de la única página mientras otro trabajo impide reclamar el siguiente, suspensión real de Workflow, liberación de ese bloqueo y ejecución posterior sin navegador. Al regresar, se conserva el resultado detenido para revisión. Se comprueban SQL/estado de trabajo y reserva, sin errores JavaScript; pantalla inspeccionada en escritorio y móvil. El proveedor y su verificación se preparan solo como fixture local temporal, con una credencial deliberadamente inutilizable y revisión obsoleta que impide descifrarla. La configuración sintética original se restaura al terminar. No se utilizaron credenciales ni llamadas facturables reales.

Estas comprobaciones acreditan el flujo local del SDK y las protecciones de la aplicación. No acreditan una generación real ni el ejecutor Vercel externo, su facturación, sus límites o una carga de 120 afiches.

## Cuatro roles, navegación y configuración por nivel

58 escenarios HTTP/PostgreSQL aprobados (59 resultados contando el contenedor), 15 unitarias, TypeScript/build e instalación sin base. Se actualizaron las expectativas que la solicitud cambió expresamente: ADMIN consulta todos los proyectos y presets; los permisos de asignación dependen del rol, y ADMIN emite recuperación para USER/OBSERVER. Continúan probados el bloqueo de cuentas elevadas, claves solo OWNER, escritura administrativa sin asignación denegada y protección del último OWNER.

Nuevas comprobaciones: crear cuentas ya aprobadas sin devolver contraseñas/hash, rechazo de elevación por ADMIN/USER, cambio directo OWNER con contraseña actual, revocación de sesiones y recuperación anterior; OBSERVER no puede crear/editar/generar/compartir ni consultar claves. Puede descargar PNG/ZIP del proyecto asignado y no descargar una variación privada ajena. Compartición por correo rechaza un permiso arbitrario en el cuerpo y cambio de permiso por proyecto.

Herencia: prompt general activo y particular juntos, inactivación independiente, bloqueo de generación sin parámetros propios antes de crear trabajos, activación posterior sin perder personalización y tema obligatorio en la vista final. Guardar desde subproducto y aplicar a otro conserva los parámetros y respeta el nombre temático del destino. Configuraciones personales y SHARED no se exponen a cuentas normales ajenas; se comprueba compartir a un destinatario, negar edición, permitir copia y revocar lectura.

Chromium con tres sesiones: OWNER crea cuentas y cambia contraseña de ADMIN; ADMIN ingresa con ella, crea USER y obtiene enlace temporal; compartir proyecto no contiene selector de permisos; categoría oculta cuadros al desactivar parámetros; guardado reutilizable lee el prompt actual y conserva las opciones; subproducto indica tema y exige personalización; ruta completa enlaza la categoría desde las variaciones; OBSERVER tiene menú y galería de consulta y recibe una configuración compartida. Sin errores JavaScript. Se corrigieron únicamente selectores/datos del script de navegador (columna inexistente, combinación de teclas y nombres de prueba repetidos); no se confundieron esos fallos con defectos de la aplicación.

## Estadísticas globales

59 escenarios HTTP/PostgreSQL aprobados (60 resultados contando el contenedor), 15 unitarias, TypeScript, compilación de producción e instalación sin base. El panel OWNER se prueba vacío y con 209 registros sintéticos: 207 dentro del período y dos excluidos por ser anterior/futuro. Se comprueban agregados por encima del límite de 200, sumas exactas de microUSD, coste cero realmente registrado, importes desconocidos, RELEASED, UNCERTAIN, afiches aprobados con coste, IDs distintos con el mismo nombre y medianoche de Perú. La API rechaza fechas arbitrarias/inyección y sesiones ADMIN/USER/OBSERVER/anónima. La respuesta no incluye snapshots, rutas privadas ni secretos.

Chromium sobre el build final: acceso OWNER mediante enlace directo y recarga, siete agrupaciones, cambio 7/90 días, menú ausente y API 403 para ADMIN, ausencia de errores JavaScript e inspección a 1365 y 390 px. Se detectó y corrigió desbordamiento móvil usando columnas de ancho limitado y tabla con desplazamiento propio. El primer selector de la cuenta ADMIN no coincidía con el nombre sintético; se corrigió únicamente el script y se completó la prueba. La verificación usa PostgreSQL y cuentas locales de prueba, sin generación externa ni alteraciones de Neon.

## Productos, accesos granulares y espacios eliminables

61 escenarios HTTP/PostgreSQL aprobados (62 resultados contando el contenedor), 15 unitarias, TypeScript, build e instalación sin base. La política anterior de ADMIN global se cambió explícitamente: sin propiedad, asignación o grupo OWNER recibe 404. Activar el grupo permite editar/generar; solo OWNER puede cambiarlo. Las pruebas de cuentas y acceso a claves conservan sus restricciones.

Pruebas nuevas con proyecto OWNER, dos productos y dos subproductos por producto: compartir producto filtra el listado del proyecto; compartir solo subproducto oculta su hermano, los demás productos y las instrucciones/adjuntos generales del ancestro. USER edita su espacio, OBSERVER no lo modifica. Galerías de ancestros solo muestran el afiche asignado, la imagen autorizada responde 200 y la vecina 404; ZIP de ámbito contiene lo permitido y selección mezclada se rechaza completa. Revocar elimina lectura; procesar un trabajo ajeno al ámbito se bloquea antes de comprobar el proveedor. Directorio aprobado sin hashes/secretos.

Añadir 3 y después 4 conserva 7. Eliminar uno deja 6, cancela su pendiente y libera su ledger, manteniendo el registro histórico. Una selección múltiple con ID inaccesible no elimina nada. RUNNING responde 409; al dejar de estar activo la eliminación múltiple funciona, y las vistas previas/conteos excluyen los espacios eliminados.

Chromium final con PostgreSQL local: selector agrupado en cuatro roles, correo directo, estado No existe, grupo ADMIN, nombre CONFIGURACION y prompt recién escrito guardados desde producto y desde subproducto, selector único de presets, suma de espacios, borrados y compartición. Respuesta POST 201 del preset de subproducto comprobada. Inspección de escritorio y móvil sin desbordamiento de página ni errores JavaScript. Los fallos iniciales del script de React/selector de panel cerrado se corrigieron y se repitió el recorrido. No se hicieron llamadas facturables ni se alteraron cuentas reales. La migración se verificó en la copia de Neon antes de aplicarla a la rama conectada.

La regresión granular incluye lectura de logos por composición actual: cuenta limitada puede leer el logo que usa su afiche sin acceder al adjunto general del ancestro, a otro logo privado ni a otro afiche. El editor utiliza esa URL restringida. El permiso del afiche y la lista de capas se comprueban antes de leer bytes.

## Recuperación de espacios eliminados

62 escenarios HTTP/PostgreSQL aprobados (63 resultados contando el contenedor), 15 unitarias, TypeScript, build e instalación sin base. La prueba crea 25 espacios eliminados y verifica páginas de 20+5 sin duplicados, búsqueda, rechazo de página inválida y respuesta limitada a metadatos. Anónimo 401, Observador 403 y ADMIN sin permiso 404; tener asignación directa al subproducto no concede recuperación del producto completo. ADMIN habilitado por OWNER y OWNER sí pueden recuperar. Un proyecto eliminado impide restaurar hasta que se recupere el proyecto.

Dos solicitudes simultáneas devuelven 200/409, conservan prompt/settings/miembros y producen un solo evento de auditoría. El trabajo cancelado sigue CANCELLED y el ledger RELEASED; el número de trabajos y ledgers no aumenta. Chromium sobre el build final y base local sintética: buscar, restaurar, comprobar retirada de la lista filtrada y presencia tras recargar; Observador sin control y API 403. Inspección en 1365/390 px sin errores JavaScript ni desbordamientos. No se usa IA ni se modifica Neon en esta etapa.

## Emergencia OWNER y preferencias de galerías

64 escenarios HTTP/PostgreSQL (65 resultados contando el contenedor), 15 unitarias, TypeScript/build e instalación sin base aprobados. Nuevos casos con cuentas OWNER sintéticas independientes: emisión solo OWNER y con contraseña correcta, hash sin código, GET limitado a fechas/estado, auditoría sin secretos, reemplazo/expiración/reutilización, dos consumos simultáneos con único éxito y cierre de todas las sesiones/enlaces. Cambio/recuperación de contraseña, degradación, suspensión y revocación invalidan el código. No se elude el estado APPROVED.

Chromium: generar/descargar código en archivo local sintético, ocultarlo y comprobar que no reaparece al recargar; logout móvil, recuperación pública y nuevo ingreso; los filtros, página 2, cuatro seleccionados y JPG persisten al recargar; búsqueda/revisión y selección se restauran; el logout limpia sessionStorage y un nuevo ingreso vuelve a valores iniciales. Sin errores JavaScript y sin desbordamiento móvil. Se corrigió en producto el logout inaccesible en móvil; se corrigió en el script la espera de finalización del logout antes de verificar el almacenamiento. No se guardan códigos de emergencia en sessionStorage.

## Contenedor y copia restaurada

Imagen Docker final construida sin credenciales externas y arrancada como UID 1000: conexión a PostgreSQL temporal, autenticación Argon2, sesión, proyectos, permiso OWNER denegado para USER y logout aprobados. Render de texto con fuente incluida a PNG y escritura de assets sin root aprobados, sin errores de fontconfig. El proceso inicial detectó permisos de archivos y configuración de fuentes; ambos se corrigieron y se repitió la construcción. La resolución del proxy de build y las capas temporales se gestionaron en el entorno de prueba, sin desactivar TLS. No hubo despliegue en VPS del usuario.

pg_dump custom con snapshot consistente y pg_restore en base local independiente: ocho migraciones, conteos de 11 tablas y hashes de archivos StoredAsset idénticos. Base de restauración retirada después de la comprobación; copia privada fuera de Git. No acredita recuperación de archivos locales ni de AI_MASTER_KEY ni de servicios remotos. No se usaron datos o contraseñas reales.
