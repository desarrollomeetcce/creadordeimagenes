# Avance por fases · continuación del desarrollo

## Alcance

La referencia sigue siendo el prompt maestro completo (54 secciones) y el requisito obligatorio de administración visual de IA. Se conservan en docs/MASTER_SPEC.md y docs/MASTER_SPEC_PDF.txt. Esta continuación añade comportamiento real a la primera entrega y se integra en la rama main, como solicitó el OWNER. La plataforma sigue incompleta. El usuario ya confirmó el ingreso a la instalación web de prueba; la generación externa real sigue sin validarse.

## Funciones implementadas

- Instalación segura de OWNER, login/logout, registro pendiente, aprobaciones, roles y protección del último OWNER activo. Cambio de contraseña con reautenticación, cierre de todas las sesiones y revocación de enlaces. Recuperación asistida por OWNER mediante enlace de un solo uso, válido 30 minutos y entregado manualmente; solo se persiste su hash.
- Identidad de marca por proyecto: nombre, instrucciones, paleta preferida, tipografía disponible y selección de logos propios. Herencia con prioridad de niveles específicos, protección de logos usados, permisos y control de revisión concurrente. Cada generación conserva una copia de la marca; cambiarla no modifica los trabajos anteriores.
- Proyectos independientes y proyecto inicial Cursos y Diplomados con su prompt completo. Categorías, creación de 1–20 subproductos por operación sin limitar el total de la categoría, formularios compactos y prompts versionados.
- Herencia operativa y resolución convencional de conflictos básicos comerciales, con vista previa y revisión humana. No se atribuye comprensión semántica completa al motor convencional.
- Adjuntos privados TXT/CSV, PDF/DOCX con extracción convencional de texto e imágenes PNG/JPG/WebP. SVG simples con lista permitida estricta, rasterización a PNG y rechazo de scripts, enlaces, entidades y elementos no admitidos.
- Configuración de IA exclusiva del OWNER: clave cifrada con AES-256-GCM y clave maestra externa, máscara, reemplazo y eliminación, consulta real de modelos, capacidades compatibles, parámetros, alternativas guardadas, presupuestos y prueba opcional con autorización de cargo. La generación se bloquea sin configuración verificada.
- Dirección creativa estructurada y composición editable activada por defecto. El modelo propone textos, posiciones, tipografías, colores y logos autorizados. Sharp conserva esos elementos independientes y renderiza textos exactos. En modalidad Texto no se solicita una fotografía al modelo de imágenes.
- Editor de ajustes manuales: mover elementos, modificar texto, tamaño, color, fuente y alineación; ajustar áreas de logos conservando su proporción; deshacer/rehacer en la sesión y guardar una versión nueva sin IA. Se rechazan desbordamientos y recursos ajenos. La vista HTML es orientativa; el servidor produce y valida el PNG final.
- Historial de versiones inmutables, vista de versiones anteriores y restauración como copia nueva. Control de revisión concurrente para evitar sobrescrituras.
- Edición con IA del fondo conservando las capas, o de la imagen completa con resultado aplanado; adjuntos en el prompt de variación; autorización de cargo obligatoria, reserva y auditoría. El original se conserva. Las ediciones simultáneas de IA de una variación se bloquean.
- Aprobación/rechazo, favoritos, duplicación independiente sin IA, papelera y restauración de afiches. Regeneración individual o selectiva de alternativas independientes, sin sobrescribir los originales.
- Cola persistente en PostgreSQL, snapshots, reclamación atómica, reservas transaccionales, idempotencia, cancelación de pendientes y reintentos autorizados. Las operaciones inciertas no se repiten automáticamente y retienen su reserva. Recuperación de trabajos RUNNING antiguos como inciertos.
- Biblioteca personal con carpetas/subcarpetas, búsqueda, traslado de afiches, renombrado y eliminación de carpetas vacías. Guardado explícito por usuario; un archivo no vuelve a temporal mientras otro usuario lo conserve. La limpieza temporal elimina también los archivos de versiones y sus fondos.
- Configuraciones reutilizables personales, compartidas y oficiales: guardar, duplicar, aplicar y eliminar según permisos. Las oficiales solo las administra OWNER, incluso si su autor fue degradado de rol. Se reutilizan prompts y parámetros; los adjuntos reutilizables de presets quedan pendientes.
- Límites globales y particulares por usuario/proyecto: reservas mensuales/diarias y cantidad diaria. Se validan dentro de la transacción antes de crear trabajos. Los costos reales no informados permanecen desconocidos: los importes son reservas, no una tarifa inventada ni un techo garantizado de factura.
- Descargas privadas PNG/JPG/ZIP y adaptación de las siete proporciones. Compartición por proyecto, supervisión ADMIN de proyectos USER y acceso global OWNER, auditoría y papelera persistente.
- Dockerfile, compose.yaml y guía de VPS preparados para web, PostgreSQL, migraciones y worker separados, con datos persistentes y web ligada a localhost detrás de HTTPS. Su construcción Docker y el despliegue en VPS aún no se han verificado.

## Validación

- Cliente Prisma generado y migración aditiva aplicada correctamente en PostgreSQL temporal.
- TypeScript y compilación de producción aprobados.
- 15 pruebas unitarias aprobadas: incluyen cifrado, herencia, contratos de IA simulados, documentos, proporciones, edición gráfica, logos y SVG.
- Suite de integración ampliada contra HTTP/PostgreSQL reales: edición/versiones, concurrencia, IA simulada, revisión, duplicación, cancelación, biblioteca, presets, límites particulares, regeneración selectiva y limpieza. Resultado actual: 61 escenarios aprobados (62 resultados contando el contenedor de la suite).
- No se han utilizado credenciales reales de IA ni efectuado llamadas facturables. Las pruebas de proveedor usan transporte simulado explícito; no establecen conectividad real con OpenAI.

## Estado por fases

| Fase                         | Estado                                                       | Pendientes principales                                                                                                                |
| ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Base                     | Funcional con pruebas                                        | Mejora semántica de herencia, acciones secundarias y reemplazo/miniaturas de adjuntos                                                 |
| Configuración IA obligatoria | Implementada                                                 | Validación externa con credencial real en instalación privada                                                                         |
| 2 · IA                       | Adaptador y flujo completos en código, con pruebas simuladas | Generación real autorizada, validación visual y conciliación del consumo                                                              |
| 3 · Producción masiva        | Funcional parcial                                            | Validación externa del ejecutor administrado, métricas de rendimiento y pruebas de carga reales                                                 |
| 4 · Edición y calidad        | Funcional parcial                                            | QA en navegador, detección de superposiciones, dirección creativa y fidelidad de fotos/logos con IA real                              |
| 5 · Productividad            | Funcional parcial                                            | Persistencia de filtros/selecciones y ampliación de herramientas de productividad                              |
| 6 · Administración           | Funcional parcial                                            | Recuperación automática por correo y emergencia del único OWNER, gestión avanzada, conciliación tarifaria y retención separada de miniaturas administrativas |
| 7 · Producción               | Preparada parcialmente                                       | Construcción Docker, VPS privado, HTTPS, backups ensayados, revisión de seguridad y monitorización                                    |

El flujo comercial de 120 afiches reales con logos y revisiones visuales no se considera validado hasta efectuar la prueba externa autorizada. La entrega sigue en borrador y no se ha habilitado para trabajadores.

## Prueba en Vercel: preparación de acceso

Se añadió una pantalla de instalación pendiente cuando la base no está configurada, no responde o faltan sus tablas, evitando presentar un ingreso aparentemente listo. El estado comprueba disponibilidad real y no crea usuarios públicos. Se documenta PostgreSQL externo y la portabilidad en docs/VERCEL_TRIAL.md, y el migrador admite DIRECT_DATABASE_URL para conexiones de migración separadas.

Verificación: compilación correcta, regresión de 33 escenarios HTTP/PostgreSQL aprobada y prueba independiente de despliegue sin base aprobada. Todavía no se ha creado ni conectado una base externa ni una cuenta en el despliegue Vercel del usuario; falta conectar técnicamente los servicios. Los archivos persistentes y el worker requieren adaptación o alojamiento separado antes de generar imágenes allí.

## Continuación · identidad y seguridad de cuentas

Migración aditiva `202610160003_brand_kits`: BrandKit, BrandLogo y PasswordReset. Los logos tienen referencias de base de datos que impiden borrarlos mientras formen parte de una identidad. No se introducen claves ni cuentas públicas. La creación de una sesión revalida la contraseña vigente bajo bloqueo para impedir que un login concurrente con una contraseña antigua sobreviva al cambio. La emisión de recuperación vuelve a comprobar el rol y las credenciales del OWNER dentro de la transacción.

La recuperación implementada es asistida desde Usuarios: el OWNER confirma su contraseña y entrega el enlace por un canal privado. No hay envío automático de correo y no se presenta como enviado. La recuperación de emergencia del único OWNER sin otra sesión o segundo OWNER sigue pendiente de un procedimiento de instalación seguro. Los accesos a Vercel y la base externa quedan para una etapa posterior, por indicación del usuario.

Recorrido local en Chromium aprobado para guardar la marca y recuperar/cambiar contraseña desde los formularios reales, con PostgreSQL real y sin errores JavaScript. Pantalla de marca inspeccionada en escritorio y móvil. Regresión final: 40 escenarios aprobados. Esto no valida el despliegue Vercel ni la generación externa real, que siguen pendientes.

## Instalación externa · Neon (16 de octubre de 2026)

La base creada por el usuario mediante Vercel Marketplace se localizó en la organización Vercel: TALENTUM. Se aplicaron las tres migraciones versionadas primero en una copia temporal y después en la rama principal conectada a la aplicación, con transacción, bloqueo, comprobación de esquema public vacío y registro de checksums compatible con el migrador del repositorio. Resultado verificado en la base principal: 23 tablas public y tres migraciones registradas; cero usuarios. El esquema neon_auth preexistente se conservó sin modificaciones y no sustituye la autenticación propia de la aplicación.

La copia temporal de comprobación tiene caducidad automática de 24 horas. Un intento inicial de ajustar el intervalo de suspensión fue rechazado por el plan y no creó recursos; se creó la copia con los valores predeterminados. La conexión SQL principal requirió especificar el rol propietario, tras lo cual la ejecución y las comprobaciones fueron satisfactorias. No se registraron ni publicaron credenciales.

La base externa ya está preparada. Falta comprobar las variables del proyecto Vercel, establecer la clave maestra y el token inicial de instalación y crear OWNER. El conector Vercel devuelve 403 al consultar la configuración del equipo; no se ha confirmado que el despliegue pueda acceder a la base ni que permita iniciar sesión. No se efectuaron llamadas facturables de IA.

## Continuación · archivos persistentes y prueba interactiva en Vercel

El usuario confirmó que pudo ingresar. Se verificó un OWNER aprobado en la base externa, sin consultar ni modificar su contraseña o credenciales de IA. El almacenamiento selecciona PostgreSQL automáticamente en Vercel y conserva el modo local para VPS. Migración aditiva 004 aplicada primero en la copia de comprobación y después en la base conectada, sin modificar cuentas existentes. StoredAsset no tiene acceso público directo: las descargas pasan por la autorización del recurso.

La cuota de archivos es 128 MiB por defecto, con comprobación transaccional ante cargas simultáneas, máximo de 16 MiB por recurso y límite de adjuntos de 3 MB en Vercel. Es un adaptador de prueba con la base existente; producción masiva requiere almacenamiento de objetos y validación de cargas. La cuota no representa la factura total ni la capacidad global de Neon. Descargas autenticadas en fragmentos y fuentes DejaVu incluidas con licencia en el paquete del servidor.

Generaciones incorpora procesamiento secuencial de trabajos ya autorizados, pausa después del actual y actualización de estado. Endpoint con sesión y Origin; acceso solo para autor u OWNER, revalidación del autor original, bloqueo de doble procesamiento y máximo de un trabajo activo por cuenta. Plazo compartido de 240 segundos para llamadas de una ejecución interactiva, dentro de una función de 300 segundos. No se reintentan automáticamente cargos inciertos. El procesamiento completo de un lote requiere mantener abierta la pantalla o usar un worker persistente; la ejecución duradera administrada queda pendiente.

Lotes: selección granular de subproductos, total actualizado, revisión y consentimiento restablecidos al cambiar la selección; rechazo de IDs ajenos antes de reservar. Mi cuenta muestra uso de archivos al OWNER y permite limpiar hasta 25 temporales caducados y revisar operaciones antiguas interrumpidas.

Validación final: 15 unitarias, TypeScript y build, 45 escenarios HTTP/PostgreSQL (46 resultados contando el contenedor), instalación sin base y recorrido local en Chromium. Se verificó que las tres tipografías están en el archivo de trazado del servidor. En navegador: espacio, limpieza, adjunto persistente tras recarga, selección parcial y pantalla de cola sin errores JavaScript. No se ha verificado una generación facturable ni la ejecución de estas funciones en el despliegue Vercel externo.

## Continuación · galerías agrupadas, descargas y navegación

Implementadas galerías de proyecto y categoría con paginación de 24 resultados, búsqueda por nombre de categoría/subproducto, filtros de revisión/favoritos/conservación y permisos calculados en servidor. Solo incluyen archivos todavía disponibles; los temporales vencidos se excluyen por fecha aunque no haya corrido la limpieza. Incluyen miniaturas de hasta 640 px, vista ampliada, navegación en la página, comparación de dos seleccionados y acceso al subproducto individual sin mezclar sus resultados.

Descarga de selección, subproducto, categoría o proyecto en PNG/JPG dentro de ZIP organizado por proyecto/categoría/subproducto. Se validan todos los permisos antes de leer archivos; límite de 200 imágenes y 100 MB de preparación, con rechazo explícito y sin recortes silenciosos. Los nombres se normalizan para evitar rutas inseguras y colisiones. La comparación visual nunca convierte la entrega en un collage.

La navegación usa enlaces de la aplicación y restaura proyectos, categorías, galerías individuales y agrupadas al recargar. Atrás/Adelante funciona con controles del navegador. Las solicitudes de navegación obsoletas se descartan; un enlace sin permiso muestra error sin conservar el recurso anterior. Filtros, página y selección de la galería agrupada se mantienen durante la sesión del componente, no al recargar. La recuperación de cuenta sigue usando un fragmento que se retira antes de navegar.

Validación: TypeScript y build, 15 unitarias, 48 escenarios HTTP/PostgreSQL (49 resultados contando el contenedor), instalación sin base y Chromium aprobados. Se descargaron realmente 28 JPG en un ZIP desde el navegador, se probó comparación, selección entre páginas, recargas, Atrás/Adelante y rechazo de enlace privado. La regresión contempla errores de exportación 404/413, filtros, caducidad, miniaturas y límites. No hubo migraciones ni modificaciones de credenciales o cuentas externas en esta entrega. No se ejecutaron llamadas facturables de IA.

## Continuación · configuraciones con archivos y administración de accesos

Las configuraciones guardadas pueden incluir los adjuntos directos de una categoría, con opción explícita al guardar. Duplicar conserva los archivos en una copia personal; aplicar permite elegir si se copian, reemplaza instrucciones/parámetros y añade archivos sin eliminar los que ya tenía la categoría. Las copias tienen bytes y metadatos independientes: borrar el original o la configuración no elimina sus copias. Volver a aplicar con adjuntos añade otra copia y consume espacio, advertido en la interfaz. No se incluyen silenciosamente recursos del proyecto ni de los subproductos.

Listado y descarga de adjuntos protegidos por la visibilidad del preset. Las configuraciones personales son privadas; las compartidas/oficiales permiten lectura, duplicación y aplicación a cuentas aprobadas. Solo autor u OWNER modifican una personal/compartida; las oficiales requieren OWNER incluso si su autor cambió de rol. La pantalla permite actualizar nombre, instrucciones y visibilidad. Cambiar los archivos requiere guardar una nueva configuración desde la categoría. Copias limitadas a 50 archivos y 24 MB, además de la cuota global; los archivos preparados se eliminan si falla la transacción de metadatos. La aplicación y duplicación revalidan la visibilidad y detectan modificaciones concurrentes antes de publicar.

Compartir proyecto incorpora listado de colaboradores, cambio de permisos y revocación con auditoría. Acceso administrativo solo para creador u OWNER; respuestas limitadas a nombre, correo, estado, rol y permiso, sin contraseñas ni credenciales. El creador conserva el acceso por propiedad. Revocar una colaboración no anula accesos propios del rol OWNER o la consulta administrativa de proyectos USER, explicado en la pantalla. Los permisos de los trabajos se comprueban nuevamente antes del consumo de IA. La compartición granular avanzada y los grupos globales siguen pendientes.

Esta entrega utiliza las tablas existentes y no requiere migraciones ni cambios en claves, usuarios o variables externas. La plataforma sigue en desarrollo; no acredita generación real ni está terminada para producción.

Verificación de esta etapa: 51 escenarios HTTP/PostgreSQL (52 resultados contando el contenedor), 15 unitarias, TypeScript, build e instalación sin base aprobados. Recorrido Chromium completo con dos sesiones, controles de acceso, carga/guardado/actualización/duplicación/aplicación/borrado de configuración, archivos reales conservados y sin errores JavaScript. No se realizaron llamadas facturables de IA.

## Continuación · lotes duraderos en segundo plano

Incorporado Workflow SDK 5.2.2 con integración de compilación Next.js. Generaciones permite enviar hasta 200 trabajos pendientes ya autorizados, consultar progreso, comprobar el ejecutor y detener después del afiche actual. El lote conserva una lista inmutable de trabajos; no añade generaciones nuevas ni vuelve a reservar presupuesto. Una solicitud repetida utiliza el mismo registro persistente. Un índice parcial impide más de un lote activo por iniciador; el worker conserva el bloqueo que permite un único trabajo RUNNING por autor.

Migración aditiva 005 BackgroundBatch aplicada en PostgreSQL local, primero en la copia de Neon y después en la base conectada, con comprobación del historial y transacción. No se modifican cuentas, claves ni la configuración externa de IA. Se registra el iniciador, la solicitud, los trabajos, la ejecución y su estado. Cada paso revalida cuenta/permisos y la configuración del trabajo. Los argumentos del ejecutor contienen únicamente el ID de lote; no se envían claves ni prompts a su historial.

Los pasos que pueden ejecutar llamadas de IA tienen maxRetries=0. Los trabajos UNCERTAIN/FAILED detienen el lote para revisión; no se generan nuevos intentos ni se liberan reservas inciertas automáticamente. Las esperas por otro trabajo activo usan suspensión duradera de 15 segundos, con un máximo de 2000 avances/esperas antes de detener para revisión. Los despachos sin confirmación no se repiten automáticamente. Detener deja los pendientes y sus reservas en cola; cancelarlos individualmente libera la reserva. Tras la pausa se puede programar explícitamente otro lote con los pendientes restantes.

El backend Vercel se activa únicamente si están disponibles las variables de sistema del despliegue y el World predeterminado. En otros servidores la prueba local requiere activación explícita; para VPS se conserva el worker persistente. Nunca se usa silenciosamente almacenamiento local de Workflow en Vercel. Si el despliegue no tiene ejecutor disponible, se muestra ese estado y se conserva el modo interactivo. La integración con el ejecutor Vercel y sus cargos/límites requieren validación externa; las pruebas locales no acreditan una generación real.

Validación: 54 escenarios HTTP/PostgreSQL (55 resultados contando el contenedor), 15 unitarias, TypeScript, build e instalación sin base aprobados. Chromium confirmó una espera y reanudación reales de Workflow después de cerrar la única página, estado persistente al regresar y bloqueo previo a cualquier llamada al proveedor. Sin errores JavaScript. No hubo generación facturable.

## Cambios solicitados · navegación, cuatro roles y herencia configurable

Ruta completa enlazada Proyectos → Proyecto → Categoría → Subproducto en galerías individuales y acceso a ancestros desde galerías agrupadas; respeta las direcciones existentes y recarga/Atrás/Adelante. Guía visible del rol y capacidades en todas las vistas autenticadas, etiquetas españolas y controles de consulta sin botones de modificación para Observador.

Migración aditiva 006 añade OBSERVER, opciones de herencia en Category/SavedPreset y PresetShare. La instrucción actual del usuario sustituye la política anterior que excluía proyectos OWNER/ADMIN de la consulta administrativa: ADMIN ahora ve todos; escritura y generación requieren propiedad/asignación. OWNER conserva control total. ADMIN crea/administra USER y OBSERVER, emite recuperación para ellas y no puede elevar cuentas ni cambiar contraseñas ajenas directamente. OWNER crea cualquier rol y puede establecer contraseñas tras reautenticarse, revocando sesiones/enlaces anteriores. El último OWNER activo sigue protegido.

Compartir proyecto requiere solo correo; las acciones dependen del rol actual de la cuenta, sin permisos adicionales en ese formulario. USER asignado puede ver/editar/generar/descargar; OBSERVER asignado ve/descarga. Cambiar un rol revoca sesiones y cambia el acceso sin reconfigurar asignaciones. La recuperación entrega un enlace privado copiable: no se afirma haber enviado correo.

Categoría separa aplicar prompt general y aplicar cantidad/distribución/formato/estilo. Desactivar parámetros oculta sus cuadros en categoría y exige configuración por subproducto; el prompt particular conserva las instrucciones generales activas y el tema obligatorio. Las personalizaciones explícitas conservan prioridad. Se puede guardar configuración desde el formulario actual de categoría o subproducto, con nombre inicial CONFIGURACION, búsqueda por nombre y aplicación entre proyectos. Se conservan opciones de herencia y adjuntos directos. La pantalla lateral permite actualizar, duplicar, compartir por cuenta y eliminar; los roles normales ya no ven indiscriminadamente todas las SHARED.

Verificación: 58 escenarios HTTP/PostgreSQL (59 resultados contando el contenedor), 15 unitarias, TypeScript, build e instalación sin base aprobados. Chromium verificó creación por OWNER/ADMIN, cambio de contraseña por OWNER, emisión por ADMIN, compartir solo por correo, ocultación de parámetros, guardado inline con prompt actual/opciones, eje temático y ruta clickeable completa. Cuenta Observador independiente sin acciones de edición y con lectura de una configuración compartida explícitamente. Inspección en escritorio y móvil, sin errores JavaScript. Sin llamadas facturables ni correos enviados.

La migración 006 se aplicó primero en la copia de Neon y después en la base conectada, con historial/checksum y transacción. Se verificaron el rol nuevo y ambos controles de categoría en la copia. No se crearon cuentas de prueba externas ni se cambiaron contraseñas, claves de IA o sesiones reales.

## Continuación · estadísticas globales del OWNER

Añadido el menú Estadísticas y su API exclusiva del OWNER, con períodos de 7, 30 y 90 días y límites de fecha en hora de Perú. Muestra inventario actual, estados de generaciones del período, reservas no liberadas, costes confirmados, importes desconocidos y cargos inciertos. Desglosa por día, mes, usuario, proyecto, categoría, subproducto y modelo. Los agregados se calculan en PostgreSQL sobre todo el período, sin sumar únicamente las 200 filas del listado de consumo. Los nombres iguales conservan grupos separados por ID; se indican recursos no disponibles. Los desgloses por recurso muestran los 20 grupos con más operaciones y avisan del recorte, manteniendo los totales completos.

No se deducen tarifas ni se convierte un coste desconocido en cero. Los promedios usan únicamente afiches con importe real registrado, distinguiendo aprobados; el estado de revisión es el actual. Las reservas siguen siendo estimaciones y la factura del proveedor requiere conciliación independiente. El panel no invoca IA, no devuelve secretos/snapshots/rutas y no necesita nuevas tablas ni variables de entorno.

Verificación: 59 escenarios HTTP/PostgreSQL aprobados (60 resultados contando el contenedor), 15 unitarias, TypeScript/build e instalación sin base aprobados. La regresión comprueba historial vacío, 207 operaciones en el período más dos fuera de él, cero confirmado frente a valor desconocido, reservas liberadas/cargos inciertos, nombres duplicados, fechas de Perú y denegación a ADMIN/USER/OBSERVER/anónimo. Chromium verificó los siete desgloses, períodos, actualización al recargar y permisos en sesiones independientes. Inspección de escritorio y móvil, sin errores JavaScript ni desbordamiento de página tras corregir el ancho del panel. El selector inicial del script buscaba un nombre de ADMIN distinto al de la fixture; se corrigió el script. No se alteraron cuentas externas ni se realizaron llamadas facturables.

## Cambios solicitados · Productos, selectores y accesos granulares

La jerarquía visible ahora es Proyecto → Producto → Subproducto → Variaciones. Se conservan rutas/IDs y el nombre técnico Category para no romper datos anteriores. Los botones usan Nuevo producto y + Agregar subproductos. Las altas se suman a los espacios existentes. Cada subproducto tiene eliminación individual; las casillas permiten eliminación múltiple atómica. Se conserva el historial, se excluyen los espacios eliminados de listados/lotes/descargas, se cancelan PENDING liberando sus reservas y se rechaza la eliminación mientras haya RUNNING. No hay todavía restauración de esos espacios desde la interfaz.

Selectores unificados para cuentas y configuraciones: el mismo cuadro permite escribir o desplegar opciones; las cuentas se agrupan por rol con sangría y grupos plegables. Directorio solo para quien administra el acceso y solo cuentas aprobadas; devuelve hasta 200 coincidencias y avisa cuando hay más. La búsqueda sin coincidencias muestra No existe. Guardar configuración abre directamente el nombre, inicialmente CONFIGURACION más el espacio, y captura las instrucciones/parámetros actuales antes de crear el preset. El botón de guardar cambios del subproducto queda diferenciado del guardado reutilizable.

La política más reciente sustituye ADMIN global: OWNER decide por proyecto el grupo Acceso a todos los administradores, con lectura/descarga/edición/generación y desactivado por defecto, incluidos proyectos existentes. Se conservan propiedad y asignaciones individuales. La compartición directa en proyecto, producto o subproducto hereda a descendientes según el rol; una asignación de descendiente solo muestra la ruta mínima y los recursos autorizados. No concede hermanos ni edición de ancestros. Galerías, ZIP, archivos, biblioteca, trabajos y worker revalidan el ámbito real. Los permisos heredados se retiran donde fueron otorgados.

Migración aditiva 007 aplicada primero en PostgreSQL local y la copia Neon, y después en la rama conectada, con historial/checksum, bloqueo y transacción. Añade allAdministrators, miembros por producto/subproducto y deletedAt de subproducto; no cambia contraseñas, claves de IA ni cuentas externas.

Verificación: 61 escenarios HTTP/PostgreSQL aprobados (62 resultados contando el contenedor), 15 unitarias, TypeScript, build e instalación sin base aprobados. Nuevos casos verifican aislamiento de hermanos/ancestros, grupo ADMIN solo OWNER, directorio sin secretos, galerías/PNG/ZIP autorizados y rechazo de mezcla privada, edición por rol, revocación, suma de espacios, borrado múltiple atómico, cancelación/reserva, bloqueo RUNNING e historial conservado. La regresión inicial detectó la semántica de filtros vacíos de Prisma en OR para OWNER; se corrigió y se repitió satisfactoriamente.

Chromium verificó selector de cuatro roles, escritura de correo y No existe, grupo ADMIN, guardado del prompt actual desde producto y subproducto, selector único de presets, suma 2+4=6, borrado individual y múltiple, compartir subproducto, ruta Productos y pantalla móvil sin desbordamiento ni errores JavaScript. Se corrigieron en el script la escritura directa al DOM que no notificaba a React y el selector de un botón en un panel cerrado, y se comprobó el POST de preset del subproducto con respuesta 201. Ninguna prueba utilizó un proveedor real ni produjo cargos de IA.

Revisión final del acceso granular: el editor obtiene logos heredados mediante el afiche autorizado y únicamente si el ID aparece como logo en su composición actual. Esto permite visualizar el logo sin habilitar la lista/descarga general de archivos del proyecto. Se agregaron comprobaciones USER/OBSERVER de logo utilizado 200, archivo directo del ancestro 404, logo vecino 404 y afiche ajeno 404. No se añadieron tablas ni cambios de credenciales para este ajuste.
