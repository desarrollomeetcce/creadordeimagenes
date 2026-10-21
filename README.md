# Creador de Imágenes · Estudio AI

**Biblioteca y revisión:** explorador con carpetas automáticas por jerarquía, carpetas personales anidadas, movimientos, selección y documentos personales. Generaciones permite revisar una primera muestra antes del resto del lote; aprobar conserva el mismo archivo en Biblioteca. Las vistas consultan la misma cola y no duplican llamadas de IA.

**Cuotas de generación:** se administran mediante los planes asignados; se retiró el apartado redundante «Presupuesto y límites». Los límites globales y particulares anteriores ya no bloquean nuevas generaciones. OWNER no tiene límite comercial. Se conserva el historial y los costes desconocidos no se muestran como cero.

Aplicación web en español para producción publicitaria multiproyecto. Implementación funcional con persistencia PostgreSQL, autenticación, proyectos, productos, subproductos, instrucciones heredadas, administración cifrada de IA exclusiva del OWNER, composición editable, historial de versiones, biblioteca, identidad de marca por proyecto, recuperación asistida de cuentas, procesamiento interactivo o en segundo plano de cola y límites por usuario/proyecto.

**Estado:** desarrollo por fases; no es todavía la totalidad del prompt maestro ni una aplicación certificada para producción. Véanse [PROGRESS.md](PROGRESS.md) y [TESTING.md](TESTING.md). Se confirmó en producción una prueba completada con imagen gpt-image-1; falta validar referencias, logos, edición y lotes reales. El importe facturado de esa prueba sigue sin informar. Las pruebas simuladas están identificadas como tales.

OWNER puede conectar su buzón en **Configuración de correo** para enviar enlaces de recuperación desde Usuarios. [Guía de Hostinger](docs/HOSTINGER_EMAIL.md): configuración cifrada, verificación TLS y prueba de envío explícita; no requiere nuevas variables de entorno. La recepción real debe comprobarse con el buzón del titular.

Los adjuntos incluyen vistas previas privadas de imágenes y **Reemplazar**. Cada reemplazo conserva el archivo anterior para trabajos y afiches existentes; los próximos usan el nuevo. Los anteriores se consultan en **Adjuntos anteriores conservados** y se pueden eliminar cuando no estén en uso. Los logos seleccionados en Identidad de marca deben retirarse de esa selección antes de reemplazarlos.

**Auditoría visual** permite al OWNER consultar miniaturas de nuevas versiones y configurar su conservación, inicialmente 30 días. Las miniaturas siguen disponibles aunque caduque el original o se envíe el proyecto a la papelera. Los demás roles solo ven el aviso de privacidad. El panel informa espacio, versiones sin miniatura y limpieza de caducadas; no procesa imágenes anteriores automáticamente. Para eliminación física periódica cuando el alojamiento está inactivo debe configurarse su planificador, como parte de la puesta en producción.

**Historial** muestra resúmenes con nombres de personas, proyectos, productos y subproductos, detalles desplegables, búsqueda y paginación. Las operaciones nuevas conservan los nombres de su momento; los registros antiguos indican cuando solo se conocen los nombres actuales o faltan detalles. No muestra claves, prompts ni códigos internos como descripción principal.

**Costos de IA** incluye filtros por proyecto/producto/subproducto y fechas Lima, paginación y totales de todas las coincidencias, con reservas separadas del coste real informado. Permite descargar CSV de hasta 2000 operaciones; un coste desconocido nunca se presenta como cero. OWNER consulta todas las cuentas; ADMIN/USER sus operaciones y generaciones terminadas compartidas. Consulta opcional del gasto diario de OpenAI exclusiva OWNER (UTC, hasta31 días): permite guardar una credencial administrativa de gastos separada, cifrada y administrable desde el panel; depende de sus permisos de facturación, puede incluir otras aplicaciones y no se atribuye a cada imagen.

**Generaciones** permite filtrar por jerarquía/acceso, buscar, elegir fechas, mostrar hasta100 imágenes y tres tamaños; seleccionar entre páginas para descargar PNG/JPG ZIP y retirar/restaurar. Cada tarjeta muestra ruta y costo informado o desconocido, separado de la reserva. Permite eliminar trabajos del listado y restaurarlos desde la vista de retiradas, conservando imágenes, historial y consumo. Los trabajos en curso no se retiran. En **Inteligencia Artificial**, el estado se actualiza cada diez segundos, distingue catálogo consultado de prueba realmente completada y revisa también límites particulares. Estos límites se pueden editar o eliminar por fila; eliminar una restricción no añade saldo a OpenAI ni borra el consumo anterior.

**Costes comprobados:** el OWNER puede registrar y corregir el importe verificado de una operación desde Consumo de IA. Guarda referencia y auditoría; el informe distingue confirmación manual de coste desconocido. No altera reservas ni resuelve automáticamente un resultado incierto, y no consulta la factura de OpenAI.

## Inicio local

Requisitos: Node.js 24, npm y PostgreSQL 16 o superior.

1. `npm ci` (genera el cliente Prisma sin descargar un motor nativo).
2. Copiar `.env.example` a `.env`. Configurar `DATABASE_URL`, `APP_ORIGIN`, `AI_MASTER_KEY` y `BOOTSTRAP_TOKEN`.
3. Generar `AI_MASTER_KEY` una sola vez con `openssl rand -base64 32`; generar el token inicial con `openssl rand -hex 32`. Guardar ambos fuera de Git. Conservar copia segura de la clave maestra.
4. Exportar las variables al proceso; por ejemplo, `set -a; . ./.env; set +a` en una shell de confianza.
5. `npm run db:deploy`, `npm run build`, `npm start`.
6. En otro proceso con el mismo entorno y almacenamiento: `npm run worker`.
7. Abrir `http://localhost:3000`, crear el OWNER con el token de instalación y una contraseña de al menos 12 caracteres. No existen cuentas públicas predefinidas. Retirar `BOOTSTRAP_TOKEN` del servidor tras la instalación.
8. Entrar en **Configuración de IA**, guardar la clave de OpenAI, verificar conexión, elegir los modelos recibidos y sus parámetros, configurar presupuestos, guardar y verificar nuevamente. Las modificaciones invalidan la comprobación previa.
9. La prueba opcional exige marcar una autorización de cargo. Solo entonces se crea un trabajo de prueba. El worker debe estar activo.

La clave maestra se configura durante instalación. Las claves de los proveedores se administran desde la interfaz; nunca se devuelven después de guardarse. No se requieren cambios de código para reemplazar o eliminar una credencial.

## Comprobaciones

- `npm test`: pruebas unitarias de cifrado, herencia, archivos, capacidades y proporciones.
- `npm run typecheck`: TypeScript.
- `npm run build`: compilación de producción.
- `npm run test:integration`: requiere un servidor local conectado a una **base vacía y exclusiva de pruebas**, con las mismas variables que el proceso de pruebas. No ejecutar sobre datos de trabajo. Detalles en [TESTING.md](TESTING.md).

## Componentes

Next.js App Router / React / TypeScript; API con Zod; Prisma ORM 7.6 con adaptador `pg` y compilador WASM; PostgreSQL; Argon2id; AES-256-GCM; worker persistente basado en PostgreSQL; Sharp; PDFParse; Mammoth; JSZip.

Se usan CSS y controles accesibles nativos para reducir dependencias iniciales. PostgreSQL implementa la primera cola durable mediante reclamación atómica; Redis/BullMQ y una biblioteca de componentes no son necesarios para esta primera versión. Son decisiones de implementación, no sustitutos de la generación real.

No se contratan servicios ni se realizan llamadas de IA automáticamente al crear proyectos, guardar prompts, adjuntar documentos o iniciar la aplicación.

## Continuación del flujo creativo

La generación editable conserva textos y logos independientes. En la galería, **Ajustar / Editar con IA** abre el editor: los ajustes manuales no consumen IA y crean versiones nuevas. Restaurar conserva el historial; editar fondo con IA mantiene las capas, mientras editar la imagen completa produce una versión aplanada. Toda operación facturable exige autorización explícita. Se añadieron biblioteca con carpetas, configuraciones guardadas, aprobación/rechazo, duplicación, regeneración selectiva y controles de cola.

La instalación de VPS está preparada en [docs/VPS_INSTALLATION.md](docs/VPS_INSTALLATION.md); la construcción y las pruebas básicas de contenedor están verificadas localmente; el despliegue externo en VPS sigue pendiente.

## Identidad y cuentas

Dentro del proyecto, **Identidad de marca** permite guardar instrucciones, colores, tipografía y logos. Primero cargar los logos en los adjuntos del proyecto, actualizar la identidad y seleccionarlos. Las instrucciones específicas de categorías/subproductos tienen prioridad; los trabajos existentes conservan su configuración.

**Mi cuenta** permite cambiar la contraseña y cerrar todas las sesiones. En **Usuarios**, el OWNER puede generar un enlace temporal de recuperación tras confirmar su contraseña. El enlace debe entregarse de forma privada al titular; no se envía un correo automáticamente. Los enlaces caducan a los 30 minutos y solo funcionan una vez. El OWNER puede preparar un código de emergencia de un solo uso desde Mi cuenta; debe guardarlo antes de perder acceso.

## Pruebas en Vercel

El usuario ya pudo ingresar a la instalación conectada a Neon. En Vercel los archivos se conservan en PostgreSQL. Archivo externo admite originales de hasta 1 GiB por archivo mediante partes de 2 MiB; la capacidad lógica predeterminada es 2 GiB, configurable con STORAGE_LIMIT_MB y sujeta al espacio contratado de la base. Los originales grandes quedan en Biblioteca y se adjunta una copia optimizada o un extracto. Archivo del sistema abre la misma Biblioteca con sus filtros, tamaños y pantalla completa para seleccionar carpetas e imágenes existentes. La generación usa únicamente IA; se retiran PropioX y la sección independiente Almacenamiento, conservando archivos e historial. No se amplía automáticamente el plan del proveedor. Después de autorizar un lote, **Generaciones → Procesar pendientes en segundo plano** programa trabajos ya autorizados con Workflow cuando el ejecutor de Vercel está disponible. Puedes cerrar el navegador y consultar el estado al volver. El modo **Procesar pendientes en esta pantalla** requiere mantenerla abierta. **Mi cuenta**, para OWNER, permite consultar espacio y limpiar temporales caducados. Los lotes permiten elegir subproductos concretos. La configuración de IA debe estar realmente verificada y los cargos autorizados antes de generar. Detalles y límites: [docs/VERCEL_TRIAL.md](docs/VERCEL_TRIAL.md).

## Galerías y descargas agrupadas

En cada proyecto o categoría, **Ver afiches** abre la galería agrupada: filtros, miniaturas, vista ampliada y comparación de dos resultados. Se pueden descargar seleccionados o todos los resultados filtrados en PNG/JPG dentro de ZIP, con carpetas por categoría y subproducto. La galería individual añade **Descargar todo el subproducto**. Límite de 200 archivos y 100 MB por preparación; para grupos mayores, usar filtros o selecciones menores.

Los enlaces conservan el proyecto, la categoría o la galería al recargar y permiten usar Atrás/Adelante. Se comprueban nuevamente los permisos al abrirlos. Los filtros, página, formato y selección se conservan por cuenta/recurso en la sesión de esa pestaña; se limpian al cerrar sesión.

## Roles y configuración por nivel

Usuarios permite crear cuentas aprobadas: OWNER administra todos los roles y contraseñas; Administrador administra Usuarios/Observadores y enlaces de recuperación. El Administrador consulta todos los proyectos y genera/edita los propios o asignados. Compartir usa solo correo; Usuario edita/genera en lo propio o asignado y Observador únicamente ve/descarga lo compartido. La guía del rol aparece en todas las vistas. Las claves de IA siguen siendo exclusivas del OWNER.

La ruta Proyecto → Categoría → Subproducto es clickeable. En categoría puedes activar separadamente el prompt general y los parámetros comunes; al desactivar estos, se definen en cada subproducto. El tema es el nombre del subproducto y se conserva en sus instrucciones finales. Bajo Guardar instrucciones/configuración se puede desplegar el guardado con nombre CONFIGURACION y buscar configuraciones de otros proyectos; la zona lateral permite compartirlas con cuentas concretas y eliminarlas.

## Estadísticas del OWNER

El menú **Estadísticas** permite consultar los últimos 7, 30 o 90 días, por día/mes, usuario, proyecto, categoría, subproducto y modelo. Calcula todo el período en PostgreSQL, sin limitar los totales a las 200 operaciones del listado de consumo. Los días se delimitan en hora de Perú. El inventario muestra el estado actual de proyectos/cuentas; los estados de cola corresponden al período.

Distingue reservas no liberadas, costes confirmados registrados y costes desconocidos. Un importe desconocido nunca se presenta como coste cero; los promedios solo incluyen afiches con importe confirmado. No realiza llamadas de IA ni consulta automáticamente la factura del proveedor. Los desgloses de recursos muestran los 20 grupos con más operaciones y advierten cuando hay más; los totales no se recortan. Solo OWNER accede al panel y a su API.

## Productos, espacios y accesos

Jerarquía visible: **Proyecto → Producto → Subproducto → Variaciones**. Las direcciones antiguas continúan funcionando. **+ Agregar subproductos** añade de 1 a 20 por operación a los existentes. Cada espacio permite eliminarse; las casillas permiten eliminar varios juntos. Se cancelan sus trabajos pendientes y se conserva el historial; una generación en curso impide eliminar ese espacio hasta que termine.

**Compartir proyecto/producto/subproducto** permite desplegar cuentas agrupadas por rol o escribir nombre/correo en el mismo selector. Una asignación al proyecto incluye todo su contenido; una asignación a un producto/subproducto permite solo esa zona y la ruta mínima para llegar. Los permisos heredados se revocan en el nivel donde fueron concedidos. OWNER puede marcar **Acceso a todos los administradores** por proyecto; por defecto está desactivado. Desactivarlo conserva la propiedad y las asignaciones individuales.

**Guardar configuración ▾** abre directamente el nombre, inicialmente CONFIGURACION más el nombre del espacio. Guardar captura el prompt y los parámetros actuales. El selector para aplicar una configuración permite escribir su nombre o desplegar opciones, desde productos y subproductos.

En cada producto editable, **Subproductos eliminados · restaurar espacios** permite buscar y recuperar espacios borrados por error. Se conservan instrucciones, parámetros, historial y asignaciones. No reactiva generaciones canceladas ni recupera archivos temporales ya caducados. Restaurar no consume IA; solo está disponible para quienes pueden editar el producto.

## Emergencia del OWNER

En **Mi cuenta → Recuperación de emergencia del OWNER**, confirma tu contraseña, genera el código y descárgalo a un lugar privado. Solo se muestra en esa respuesta. Vence al año, funciona una vez y generar otro invalida el anterior. Cambiar/recuperar la contraseña o modificar el rol/estado invalida el código. El servidor guarda únicamente su hash; no necesita correo ni editar variables.

Si olvidas tu contraseña, en el ingreso elige **Recuperar OWNER con código de emergencia**, introduce tu correo/código y una contraseña nueva. Se cierran todas las sesiones y se invalidan enlaces de recuperación. No recupera una clave maestra de cifrado perdida. Si no preparaste y conservaste el código, este mecanismo no puede sustituirlo.


### Mantenimiento

El OWNER puede consultar y ejecutar la limpieza desde Mi cuenta. Los borrados fallidos quedan en cola para reintentarse sin perder el registro; la biblioteca permanente y los adjuntos se conservan. Incluye programación diaria protegida para Vercel (necesita CRON_SECRET una vez y verificación externa) y tarea independiente `npm run maintenance` para VPS. Instrucciones y límites en [docs/MAINTENANCE.md](docs/MAINTENANCE.md).


Generaciones permite filtrar y recorrer toda la cola, seleccionar hasta 200 pendientes entre páginas y cancelarlos juntos. También puede cancelar únicamente los pendientes de un lote, conservando el afiche en curso y cualquier cargo incierto. Las reservas liberadas son locales y no son reembolsos del proveedor.


Recuperación de ejecución con confirmación periódica, token interno y protección frente a respuestas tardías o acuse perdido de COMMIT. Revisión técnica en [SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md); no sustituye las comprobaciones del alojamiento real.

## Google, fal.ai y Replicate

En Configuración de IA → Conexiones de IA, OWNER puede conectar OpenAI, Google Gemini/AI Studio, fal.ai y Replicate, consultar sus modelos y elegir proveedores separados para imágenes y dirección creativa. Nano Banana/FLUX y otras familias se muestran únicamente si la consulta real y su esquema son compatibles. Guía: [proveedores de IA](docs/AI_PROVIDERS.md). Las suscripciones de chat no garantizan API gratuita; modelos retirados no se presentan como disponibles.

## Planes y pagos

Página pública `/plans`, panel **Mi plan**, asignación OWNER en **Usuarios** y catálogo editable desde Configuración de IA. InicioUS$20/20 imágenes/US$10 IA; CrecimientoUS$49/50/US$25; EmpresaUS$100/100/US$50. Ilimitado solo interno. Cuotas por mes calendario Lima; reservas no son costes reales ni saldo del proveedor.

**Configuración de pagos** exclusiva OWNER permite Mercado Pago/PayPal con claves protegidas desde la interfaz. Compra de30 días sin renovación automática; activación solo por pago verificado e idempotente, Sandbox sin activación real. Guía de campos/webhooks/limitaciones: [planes y pagos](docs/PLANS_PAYMENTS.md). No se ha cobrado ni verificado una cuenta real en estas pruebas.

## Página web y planes personalizados

**Página web** en el menú OWNER permite editar presentación, beneficios, funcionalidades, pasos, testimonios reales, planes, preguntas frecuentes y contacto del sitio público `/plans`. Cada sección se guarda por separado y se refleja al recargar. Testimonios ocultos hasta añadir opiniones reales.

Los planes se editan en filas compactas con ✓ guardar y × retirar. **Planes personalizados** permite crear varios con nombre, precio, cuotas y correo de usuario existente/aprobado; quedan privados y se asignan sin cobrar. Usuarios muestra **Personalizado · nombre**. Retirar un plan no borra compras ni quita las condiciones de cuentas ya asignadas; cambia su plan desde Usuarios cuando corresponda.

## Meta Ads

Nuevo módulo de consulta con Marketing API y cliente MCP, cuentas autorizadas por usuario, campañas/conjuntos/anuncios y costos simultáneos de hoy,7,15,30días y desde el inicio. No publica ni modifica campañas y no usa IA para analizar. Conectar como OWNER desde Meta Ads → Conexiones y habilitar las cuentas importadas. La disponibilidad/autorización real del servidor MCP debe verificarse con Meta; no se sustituye por datos de demostración. Configuración, límites y pruebas: [guía de Meta Ads](docs/META_ADS.md).
