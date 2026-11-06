# Estudio creativo de tres columnas

Proyectos abre un espacio adaptable: proyecto y configuración a la izquierda, afiches en el centro y preparación/publicación Meta a la derecha. Los separadores admiten arrastre, flechas y restauración; las anchuras son preferencias locales. Móvil conserva las tres áreas mediante pestañas.

El proyecto contiene el comportamiento y las referencias opcionales. Producto es carpeta con nombre y país. Sus prompts históricos permanecen almacenados, pero el nuevo flujo combina comportamiento del proyecto e instrucciones particulares del diplomado. Configuración por proyecto no modifica proveedor/modelos globales. Generación usa el pipeline existente, reserva y autorización explícita de cargo, muestra inicial y aprobación. La cantidad permite nuevas variaciones; la selección masiva pertenece solo al diplomado activo. Cargas manuales no consumen IA. Guardar seleccionados hace permanentes únicamente los elegidos y los incorpora a Biblioteca.

Inventario y grupos se consultan de forma autorizada y diferida; búsqueda/selección son locales. Anuncios Meta IA en el selector compartido permite guardar una selección privada y abrirla en el estudio, sin modificar miembros ni hechos financieros. Biblioteca conserva sus funciones y añade presentación de carpetas por tarjetas/tamaños o tabla con conteos disponibles.

## Publicación Meta

Se utilizan conexiones API existentes, permisos de edición y cuentas principales autorizadas. La página debe estar autorizada para anunciar y tener WhatsApp vinculado si se usa ese destino; leer el número no es obligatorio. Recursos de una cuenta se consultan al elegirla. No se consulta gasto/histórico para preparar campañas. Las plantillas admiten {diplomado}, {producto}, {pais}, {codigo}; no requieren IA. Cada diplomado elegido produce una campaña con la cantidad de conjuntos elegida; los afiches se distribuyen una sola vez entre ellos. También se pueden reutilizar campañas y conjuntos existentes según el flujo descrito más adelante. Presupuesto diario explícito por campaña, moneda de la cuenta y total visible. Configuración avanzada opcional para públicos, edades y categorías especiales.

Revisión final de imágenes, texto, destino y presupuesto precede a publicación. Estado inicial predeterminado PAUSED. ACTIVE requiere confirmación adicional de gasto; las entidades se crean pausadas, se verifica su pertenencia, presupuesto, destino y estado antes de activar. CreativeMetaLaunch guarda configuración inmutable, revisiones de imágenes, recibos y progreso. Cada paso se reclama por CAS antes de llamar a Meta. Fallos, respuesta incierta o reclamo abandonado detienen en NEEDS_REVIEW: no se repite una escritura posiblemente cobrada/publicada. Una interrupción del navegador permite consultar estado y continuar solo pasos pendientes seguros.

Los objetos confirmados se guardan localmente para la vista Meta, sin inventar estadísticas ni reiniciar cursores. Vinculación de inventario exige identidad canónica y alias inequívoco del mismo país. Esta implementación requiere permisos reales ads_management, página/WhatsApp vinculados y aceptación de Meta. Pruebas sintéticas no acreditan aprobación o entrega de anuncios reales.

## Persistencia y validación

Migración aditiva 202611050001_creative_studio: JSON studio en Project/Category/Subproduct y tablas CreativeMetaLaunch/CreativeInventorySelection. No borra prompts, imágenes, auditoría, hechos financieros ni configuraciones existentes. Se aplica mediante db:deploy en el despliegue.

QA usa una base temporal exclusiva, transportes OpenAI/Meta sintéticos y seis afiches locales. Se comprueban UI, permisos, idempotencia, muestra inicial, presupuesto, dos conjuntos, pausa/activación, rechazo de imagen cambiada y pérdida de acuse. No se ejecuta generación ni publicidad con cargo real.


## Ajustes posteriores de experiencia y permisos

La cabecera se integra en la franja Proyectos y el menú puede convertirse en un rail de iconos. Cada columna maximiza/restaura sin desmontar contenido; Escape restaura si no hay un diálogo abierto. Biblioteca abre una pestaña nueva. Desfijar retira solo la preferencia de este usuario/producto en el navegador y la selección de trabajo; nunca elimina la carpeta, imágenes ni campañas. Reelección recupera el mismo subproducto.

Los subproductos nuevos del estudio son borradores lógicos (studio.folderPending). No se muestran como carpeta de Biblioteca hasta subir afiches seleccionados; guardar marca las imágenes elegidas permanentes y crea la carpeta visible. No se borran carpetas previas o creadas explícitamente desde Biblioteca; una carpeta guardada sigue existiendo si queda vacía.

Anuncios Meta es una pestaña propia del editor común de grupos, con casillas y sin celdas de estado/uso por país. No se confunde con crear o editar grupos. Hacer anuncios abre una pestaña nueva mediante una selección privada; conserva la pantalla de origen. Si hay producto de destino, la selección se importa directamente. El reemplazo desde Meta/hoja reutiliza ese editor común con Top y su contexto original.

Grupos permanece accesible mientras carga su directorio: muestra progreso/error y reintento sin peticiones duplicadas. La lectura de uso extrae priorActive en SQL sin transferir snapshots completos; los datos históricos no cambian. Para páginas vacías existe reautorización explícita con Facebook y soporte de activos asignados a usuario del sistema. Véase META_PAGE_ACCESS.md para permisos y las dos formas de conexión.


## Búsqueda de páginas y carga rápida de inventario

Página de Facebook permite escribir por palabras del nombre o ID, ver logos y ampliar la selección. Filtrar no consulta Graph. Si la foto no está disponible se muestran iniciales; la lista de nombres continúa funcionando.

Lista y Grupos muestran primero nombres/categorías. Usos por país se cargan solo en Crear/Editar o Top, donde los reemplazos necesitan esos datos; Anuncios no los requiere. El directorio básico conserva preferencias manuales y no presenta usos automáticos como confirmados. Las pestañas del libro son accesibles sin esperar la carga completa de asociaciones de todas las hojas.

Los estados manuales de campaña también se editan en la hoja mediante el menú compartido. Son distintos de la evaluación Normal/Revisión/Crítico del Top y no modifican automáticamente campañas reales de Meta. El acuse conserva el historial y actualiza únicamente la fila correspondiente.

## Preparador Meta por etapas · 06/11

Cuenta publicitaria, página, lugar, presupuesto y distribución aparecen primero. Cada diplomado/país conserva su formulario y selección; la preparación múltiple se activa expresamente. Cuatro secciones plegables ordenan campaña, plataformas/ubicaciones, anuncios/conversación y públicos. La vista ampliada distribuye los campos y los públicos en columnas sin cambiar el formulario.

La configuración guardada tiene nombre y contiene exclusivamente objetivo, plataformas/ubicaciones, multianunciante desactivado, permiso opcional de gasto limitado fuera de ubicaciones, texto principal, headline y descripción. Aplicarla no sustituye país, presupuesto, cuenta/página, nombre de campaña, cantidad/públicos, imágenes/reparto ni conversación. El permiso de gasto fuera de ubicaciones empieza desmarcado; se envían listas vacías explícitas en placement_soft_opt_out. No es un límite de gasto de cuenta.

Crear/Buscar permite campañas nuevas, conjuntos nuevos bajo campañas existentes o anuncios nuevos en varios conjuntos existentes activos. Buscar consulta solo con botón/Enter y paginación explícita. Objetivos no soportados se muestran deshabilitados. El servidor verifica pertenencia, estado, objetivo, categoría, página y país; reutiliza recibos de padres sin escribirlos ni activarlos. CBO se conserva y ABO de nuevos conjuntos exige importe propio. Los afiches se reparten una vez, equitativamente o mediante cantidades editadas. El presupuesto y los objetos existentes no se alteran.

Intereses, públicos personalizados/similares, ciudades, regiones e idiomas provienen de lecturas reales de Meta desde la interfaz. Los valores seleccionados llevan prueba cifrada por usuario/cuenta/revisión/país durante una hora; el servidor sustituye nombres por los devueltos por Meta y rechaza IDs no confirmados. La lista de públicos guardados distingue los nativos Meta de los guardados en esta plataforma. Guardar un público es una escritura local autorizada en Project.studio, hasta100 por proyecto, con identidad de cuenta/país e idempotencia; no crea un Saved Audience en Meta ni usa capacidades especiales no disponibles. Las configuraciones locales se resuelven en servidor antes de construir targeting.

IA propone únicamente los campos marcados, con públicos y descripción como selección inicial y texto principal opcional. Copia sola hace una llamada sin buscar intereses. Públicos usan consultas y catálogo real; se exige cantidad exacta y públicos diferentes. El headline, lugar, presupuesto, plataformas, nombre y conversación permanecen manuales. Completar con IA no publica: se usa el mismo botón Revisar y publicar, con confirmación de gasto cuando corresponda. La salida de texto permite4500 tokens explícitos para varios públicos; no se fuerza el antiguo techo1024.

Texto principal, headline y descripción son comunes a todos los anuncios nuevos. Multianunciante se envía OPT_OUT en cada creativo. Conversación permite guardar nombre, saludo y mensaje prellenado en plataforma; se envía page_welcome_message y se comprueba su lectura. No importa ni aprueba plantillas salientes de WhatsApp Cloud API. Marketing API puede restringir objetivos/ubicaciones/funciones según cuenta: no se garantiza aprobación ni entrega con esta implementación. QA solo usa proveedores simulados, sin anuncios reales ni cargos. No hay migración nueva para estas preferencias JSON.

## Método IA y segmentación en vivo · actualización posterior06/11

Orden de edición: plataformas/ubicaciones, Tradicional/Con IA, públicos, anuncios/conversación. Tradicional muestra todos los editores. Con IA oculta los campos marcados para generar y conserva visibles los manuales: públicos, principal, descripción, headline y nueva bienvenida. Headline y bienvenida empiezan desmarcados; los otros valores se mantienen si no se solicitan expresamente. El checkbox de bienvenida dice «se creará nueva» y solo se habilita con destino WhatsApp. La bienvenida generada se incorpora al creativo por page_welcome_message; no crea una plantilla aprobada WABA ni busca una biblioteca de Ads Manager no expuesta por API. El desplegable manual distingue las guardadas en esta plataforma y las carga al abrir, sin IA.

Completar IA debe devolver cada campo marcado, con límites y variables validados después de expandir por diplomado. Revisar bloquea el uso de datos antiguos si cambió la selección/prompt/contexto sin completar nuevamente. La revisión final muestra valores efectivos, incluidos descripción, bienvenida y públicos, antes de cualquier publicación.

Buscador manual unificado de intereses/comportamientos/datos demográficos disponibles en Marketing API, con búsqueda al terminar de escribir650ms y mínimo2 caracteres. Consultas agrupadas por cuenta/país, cancelación y descarte de obsoletos, caché de resultados privada2min/20consultas, sin polling o reintentos automáticos. Explorar carga categorías reales bajo demanda y Ver más usa cursores. No descarga todo el catálogo. Las rutas y tamaños globales proceden de Meta y no son estimaciones del conjunto. Cada valor conserva su field real y prueba cifrada; se serializa en flexible_spec bajo ese field. Campos no soportados/retirados se omiten, categorías especiales conservan sus restricciones.

Maximizar conserva DOM y configuración. «−» rojo superior y «Regresar a la vista de preparación» inferior derecho restauran las tres columnas; el segundo queda separado de las acciones de campaña.
