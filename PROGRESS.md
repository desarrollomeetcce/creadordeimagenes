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
- Suite de integración ampliada contra HTTP/PostgreSQL reales: edición/versiones, concurrencia, IA simulada, revisión, duplicación, cancelación, biblioteca, presets, límites particulares, regeneración selectiva y limpieza. Resultado actual: 45 escenarios aprobados (46 resultados contando el contenedor de la suite).
- No se han utilizado credenciales reales de IA ni efectuado llamadas facturables. Las pruebas de proveedor usan transporte simulado explícito; no establecen conectividad real con OpenAI.

## Estado por fases

| Fase                         | Estado                                                       | Pendientes principales                                                                                                                |
| ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Base                     | Funcional con pruebas                                        | Mejora semántica de herencia, acciones secundarias y reemplazo/miniaturas de adjuntos                                                 |
| Configuración IA obligatoria | Implementada                                                 | Validación externa con credencial real en instalación privada                                                                         |
| 2 · IA                       | Adaptador y flujo completos en código, con pruebas simuladas | Generación real autorizada, validación visual y conciliación del consumo                                                              |
| 3 · Producción masiva        | Funcional parcial                                            | Métricas de rendimiento, ejecución duradera administrada y pruebas de carga reales                                                 |
| 4 · Edición y calidad        | Funcional parcial                                            | QA en navegador, detección de superposiciones, dirección creativa y fidelidad de fotos/logos con IA real                              |
| 5 · Productividad            | Funcional parcial                                            | Adjuntos reutilizables en presets y descargas transversales por proyecto/categoría                              |
| 6 · Administración           | Funcional parcial                                            | Recuperación automática por correo y emergencia del único OWNER, gestión avanzada, conciliación tarifaria, estadísticas y retención separada de miniaturas administrativas |
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
