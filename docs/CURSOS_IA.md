# Cursos IA y Ajustes IA

Actualización10/11: [Videoclases grabadas, pizarra y Vimeo](COURSE_CLASSROOM_VIDEO.md). MP4 en servidor con recursos existentes y envío opcional a Vimeo; la exportación local se mantiene como alternativa explícita.

Cursos IA sigue siendo exclusivo de OWNER aprobado, vigente y con IA habilitada. Las comprobaciones también se hacen en el servidor, en archivos y antes de generar/publicar.

## Un solo lugar para conectar proveedores

Abre **Ajustes → Ajustes IA → Conexiones**. Las tarjetas están plegadas; abre un proveedor, guarda la clave y consulta su catálogo explícitamente. Abrir la pantalla o desplegar una tarjeta no genera contenido.

| Proveedor | Funciones integradas |
| --- | --- |
| OpenAI | Afiches, contenido de cursos, voz e ilustraciones |
| Google AI / Gemini | Afiches, contenido, ilustraciones, voz y video compatibles con su API |
| fal.ai | Afiches, ilustraciones FLUX y otros modelos, y escenas de video según catálogo/esquema |
| Replicate | Afiches; su catálogo de video no está integrado |
| Anthropic Claude | Contenido y materiales de cursos |
| Mistral AI | Contenido y materiales de cursos |
| Cartesia / Sonic | Voz desde modelos y voces disponibles en la cuenta |
| ElevenLabs | Narración y clonación de voz autorizada |

Una clave de un proveedor puede autorizar varios modelos del mismo proveedor. No se comparte una clave de Google con fal.ai ni con OpenAI. Las suscripciones de chat y Flow no equivalen a acceso/saldo de API. Cada cuenta determina los permisos, modelos y facturación disponibles.

OpenAI/Google/fal de Cursos IA pueden usar la conexión compartida de la plataforma **por referencia, sin duplicar el secreto**. Los catálogos de afiches y cursos permanecen separados por capacidad y los parámetros de generación también. Cambiar la clave compartida invalida el catálogo correspondiente y detiene trabajos antiguos antes de usar una credencial nueva. El consumo y los límites del proveedor siguen compartidos cuando se usa la misma cuenta/API key.

Las claves anteriores de Cursos IA no se sobrescriben: si existe una distinta, la tarjeta lo indica y ofrece **Usar clave compartida en Cursos IA**. La sustitución requiere esa elección explícita y una nueva consulta de modelos. Claude, ElevenLabs, Mistral y Cartesia se administran en esta misma pantalla y conservan su contexto de cifrado propio. Ninguna clave se devuelve al navegador ni se incluye en URLs de seguimiento.

## Parámetros por uso

- **Afiches:** conserva los controles existentes de proveedor/modelo/calidad/resolución y las pruebas autorizadas. El formulario se despliega al solicitarlo; no se monta ni sondea mientras estás en Conexiones o Cursos.
- **Cursos · proveedores:** solo proveedores, modelos y calidad técnica para nuevos programas. Público, nivel, enfoque, módulos, minutos, estilo y clips promocionales se eligen dentro de cada curso. Los cursos existentes se conservan.
- **Texto:** OpenAI/Gemini/Claude/Mistral; dificultad, enfoque, público, idioma y objetivos pedagógicos.
- **Voz:** OpenAI, Gemini TTS, ElevenLabs o Cartesia; modelo y voz disponibles. OpenAI admite velocidad; el tono se transmite donde la API lo permite. La clonación integrada sigue siendo ElevenLabs, con consentimiento y posible verificación del proveedor.
- **Ilustraciones:** OpenAI, Google o fal.ai; Nano Banana/FLUX pertenecen a imagen, no se muestran como video. Calidad baja/media/alta de ilustraciones OpenAI; Google usa los parámetros compatibles del adaptador existente.
- **Clips:** Google o fal.ai; solo modelos de video compatibles devueltos por la cuenta. Resolución, duración y formato se ofrecen según el modelo; si no expone un parámetro se indica Automático. Duración de Google Omni se solicita como objetivo en el prompt, no se promete exactitud temporal.
- **Clase narrada:** exportación local a720p/1080p, independiente del modelo que crea clips. No requiere contratar una IA de video para usar diapositivas/pizarra/código/tablas.

## Flujo de trabajo sencillo

1. **Crear carpeta del programa.** Solo nombre, tipo (curso/diplomado/programa/taller/seminario), descripción breve y público. Incluye Otro público con texto personalizado. No pide prompt largo ni modelos; no llama a IA. La carpeta muestra descripción y destinatarios.
2. **Entrar → Temario.** Elige Generar con IA o Pegar módulos. Objetivo, dificultad, enfoque, cantidad y demás parámetros se editan dentro del programa, sin un formulario emergente de configuración. La ventana de temario permite elegir proveedor/modelo verificado, cantidad y minutos, guardando los datos de ese curso antes de generar.
3. **Pegar temario.** Un título por línea o encabezados Módulo1/Unidad1/Tema1 con descripciones debajo. Crea módulos independientes y ordenados en una transacción, sin IA. Añade al temario existente; no lo sustituye. Hasta200 módulos por programa.
4. **Generar temario.** Propone hasta100 módulos según el objetivo y los parámetros guardados. Solo cuando la carpeta no tiene módulos; nunca reemplaza un temario ya definido.
5. **Desarrollar.** Individualmente o por lotes de hasta24 pendientes. Los ya desarrollados se conservan; puedes reordenar y añadir módulos. El lote se registra atómicamente antes de arrancar.
6. **Revisar escenas y materiales.** Diapositivas, pizarra, código, tablas y cuentos; pasos, narración, práctica y solución. Edita escenas y documentos sin consumir IA. Añade varios libros, guías, talleres, exámenes o presentaciones.
7. **Crear voz o clip.** Prueba una escena antes de completar el resto. Los clips se piden por escena y requieren modelo de video configurado. El botón avisa que puede haber un cargo. El seguimiento privado se conserva; Recuperar video reutiliza la solicitud existente, sin reenviar la generación.
8. **Reproducir y exportar.** Los clips guardados se integran con la narración del curso. La exportación usa el audio docente; el clip original con su propio audio puede revisarse por separado. Si la explicación dura más que el clip, conserva su último fotograma. PDF mediante impresión; Word/PPTX, CSV/código/JSON y video local. Solucionario excluido salvo elección explícita.

## Google, Veo y alternativas

La integración usa documentación vigente al01/11/2026. Google retiró los IDs preview de Veo3.1 de su Gemini API el22/10/2026. No se ofrecen esos IDs obsoletos. Se admite la ruta documentada actual de **Gemini Omni Flash** y los IDs GA de Veo3.0 cuando el catálogo de la cuenta los devuelve. La disponibilidad de Veo en otros servicios de Google no implica acceso con una clave de AI Studio.

fal.ai permite buscar modelos de video de Wan, Kling, LTX, Veo y otros fabricantes. Se muestran hasta100 coincidencias por consulta y solo esquemas compatibles con texto a video y salida de video; utiliza la búsqueda para acotar. No se afirma que todos los modelos de fal estén integrados ni que alguno sea siempre el más barato. Compara su tarifa, resolución, segundos y funciones antes de generar. Empezar con clips cortos y resolución moderada permite evaluar resultados antes de gastar en un curso entero.

Fuentes técnicas oficiales:
- https://ai.google.dev/gemini-api/docs/omni
- https://ai.google.dev/gemini-api/docs/veo
- https://ai.google.dev/gemini-api/docs/generate-content/speech-generation
- https://fal.ai/docs/api-reference/inference-api/queue/submit-path
- https://fal.ai/models/fal-ai/wan/v2.7/text-to-video/api
- https://fal.ai/models/fal-ai/ltx-2.3/text-to-video/api

## Rendimiento, seguridad y límites

- Carga diferida del módulo y del reproductor. Proyectos/Meta/Efectividad no consultan Cursos IA. Ajustes puede leer expresamente los catálogos y valores iniciales; no carga cursos completos ni dispara generación.
- Una carpeta devuelve metadatos y contadores; solo el módulo abierto descarga su contenido. Audios y clips no se descargan al listar carpetas.
- Seguimiento cliente ligero cada5segundos únicamente con trabajos activos y pestaña visible. Solo recarga contenido al cambiar el estado. El workflow autorizado sigue en segundo plano aunque cierres la ventana.
- Máximo2 trabajos globales y1 por curso, claim privado, control de revisiones y permiso actual. Envío de video una sola vez; después solo consulta la solicitud guardada. No se reintentan automáticamente llamadas que pudieron tener costo. Un fallo conserva contenido anterior y seguimiento disponible.
- No se ejecuta código generado ni se controla una instalación real de Excel/Power BI. Las demostraciones de software son simuladas. El video generado se usa como ilustración; verifica números, textos y hechos antes de impartirlo.
- La calidad académica, naturalidad de voz y acabado visual requieren revisión real. Minutos por módulo son objetivos; libros y narraciones están limitados por la salida del modelo.
- Clips MP4 limitados a64MB, almacenamiento compartido y protegido por las mismas cuotas de espacio. Exportación local Canvas/WebAudio/MediaRecorder, sin añadir un renderizador de video ni nuevas dependencias al VPS. Mantén la pestaña visible mientras exporta; MP4/WebM según navegador.
- Archivar conserva módulos, materiales, trabajos y archivos; no genera, cancela un cargo ni borra historia.

## Instalación y pruebas

Aplicar migración aditiva202611010002_ai_media_connections después de202611010001_courses_ai y regenerar Prisma. Se conservan los datos y las claves existentes. Usa el backend Workflow que ya tiene la plataforma.

Pruebas permanentes: courses-ai.test.ts, courses-ai.integration.test.ts, ai-media.test.ts y ai-media.integration.test.ts. Proveedores sintéticos, ninguna llamada real facturable. La integración exige una base de pruebas exclusiva; sus fixtures se eliminan y las conexiones anteriores se restauran al terminar.

## Editar el resumen y elegir el formato de clase

Dentro de un programa, haz clic en su título, descripción, tipo de programa, público o detalle del público para editarlo en la misma cabecera. Enter, ✓ o salir del campo guardan; Escape y × cancelan. En una descripción, Shift+Enter inserta una línea. Los cambios se guardan por campo, conservan el prompt y los parámetros IA, y no consumen IA. Configurar contiene **Prompt del curso**, temario y parámetros; el borrador del prompt se conserva al editar la cabecera. Durante una generación activa se bloquean estas modificaciones.

**Enfoque** indica teoría, práctica o ambas. **Estilo inicial** indica la presentación visual: diapositivas, pizarra paso a paso, código, cuento, etc. Cada módulo puede tener su propio estilo. Para una pizarra, selecciona ese estilo y describe en el prompt el ejercicio, el nivel y la secuencia esperada. Ejemplo: «Trigonometría básica. Pizarra paso a paso, sin rostro. Escribe progresivamente el enunciado y cada transformación, explica su motivo, resuelve un ejemplo y termina con otro para practicar. No muestres el resultado al inicio».

La pizarra es una simulación de escritura progresiva. Las demostraciones de software son simulaciones, no grabaciones de aplicaciones reales. Las **escenas de video** son videos cortos opcionales generados por escena; no son clics del mouse ni la clase completa. Las diapositivas narradas no requieren un proveedor de video. Una animación infantil extensa y con personajes consistentes necesita planificación y revisión; elegir mayor resolución no garantiza exactitud didáctica o continuidad visual.

## Biblioteca por destinatarios, formatos y voz

La biblioteca muestra categorías compactas: niños y adolescentes, adultos, padres y familias, otros, y las que añadas mediante **Nueva categoría**. Pulsa el nombre para desplegar sus programas; **+ Crear curso** aparece primero dentro de la categoría y preselecciona el público. El público sigue siendo editable (incluidos adolescentes, profesionales y Otro), independientemente de la categoría. Los programas anteriores se agrupan por su público hasta que selecciones una categoría explícita. Puedes cambiarla desde la cabecera del curso.

Todos los estilos están disponibles para cualquier público: diapositivas, pizarra, código, tablas, cuento ilustrado, **Animación educativa** y **Profesor en pantalla · video IA**. La animación local aplica movimiento a ilustraciones y revela pasos; para dibujos con acciones complejas, transiciones cinematográficas o profesor visible, genera y revisa las escenas de video. Sin video, Profesor en pantalla muestra una vista previa del guion, claramente identificada. No incorpora un servicio de avatar con sincronización labial. La voz nativa de los videos generados no se usa: el montaje añade la narración seleccionada.

**Forma de narrar** permite voz en off o explicación del profesor en primera persona. El tono describe cómo explica (por ejemplo, dinámico y preciso, cercano o pausado). El sistema transmite público, detalle/edad, nivel, enfoque, estilo, voz y tono a la generación; también adapta las instrucciones visuales de imágenes/video y las instrucciones de voz que admite el proveedor. Un cuento para ingenieros conserva el lenguaje y nivel profesionales. Un curso dirigido a padres habla a los adultos aunque trate sobre sus hijos. El prompt aporta el tema, ejemplos y comportamiento del docente; las selecciones explícitas de público/nivel prevalecen si hay contradicción. Esto guía a la IA, no garantiza que toda respuesta sea correcta.

En **Temario**, genera módulos con IA, pega módulos en su espacio propio o usa **+ Módulo**. En Configurar se eligen cantidad (1–100 por generación) y minutos objetivo por módulo (1–60). Se pueden editar después por módulo. Los minutos no certifican la duración del audio/video. El temario admite hasta200 módulos; el desarrollo completo avanza de uno en uno y el lote manual heredado admite24; no se ejecutan automáticamente al crear o guardar.

## Referencias opcionales sin archivar originales

Abre **Referencias · opcional** dentro del programa. Puedes adjuntar TXT/CSV/MD, PDF/DOCX, pegar texto o leer un enlace HTTPS público. Se conserva texto extraído y su procedencia en un banco propio del curso; no se crea un archivo descargable ni se archiva el original. TXT/CSV/MD se leen en el navegador; PDF/Word se procesan en memoria del servidor. No se envían originales a los proveedores IA.

Límites actuales de procesamiento: hasta1 millón de caracteres por referencia de texto y10 millones por curso; PDF/DOCX hasta16 MiB,100000 caracteres extraídos y PDF hasta100 páginas, con protección del tamaño expandido de Word. No hay OCR ni extracción de audio/video. Para archivos mayores o escaneados, adjunta un extracto en texto/OCR. **No se ha implementado ni validado la carga de archivos binarios de2–10GB**. El proxy/hosting puede imponer un límite inferior al del manejador. El texto conservado también ocupa base de datos: no equivale a almacenamiento cero.

Los enlaces se leen solo al solicitarlos, sin cookies ni credenciales; dominios/redes privados se rechazan, DNS se valida y fija por conexión, cada redirección se vuelve a validar y se acotan tamaño/tiempo. Sitios privados, páginas dependientes de JavaScript, videos y páginas no legibles requieren pegar texto. No se vuelve a descargar una web al entrar al curso. Para actualizarla, usa Editar en la ventana de enlaces; solo Guardar vuelve a consultar esa web. El texto idéntico se deduplica.

Las referencias no se cargan desde otros módulos ni en el listado de carpetas; la sección consulta solo sus metadatos al abrirse. Al generar temario, clase o material, una búsqueda de texto con índice selecciona hasta8 fragmentos de4000 caracteres. No es lectura exhaustiva de todas las fuentes ni búsqueda semántica con embeddings. Las referencias se tratan como datos, nunca instrucciones del sistema. La IA recibe nombre/procedencia y se le pide citar solo información presente, sin inventar fuentes. Revisa citas, hechos y ejercicios. Generar voz/imagen/video no consulta este banco adicionalmente.

Retirar una referencia borra sus fragmentos del banco; los resultados y las instantáneas de generaciones anteriores conservan su historia. Los permisos OWNER se revalidan al escribir y se bloquean cambios de referencias mientras hay generación activa. Ninguna carga o lectura de referencia genera IA facturable.

La biblioteca también incluye **Crear curso para otros** y **Cursos para otros**. Preselecciona Otro público y permite describirlo; se puede cambiar el destinatario conservando esta carpeta. Los programas anteriores con público Otro, sin carpeta explícita, aparecen en este grupo.


## Menú superior, vista completa y categorías propias

Se retiró la columna lateral Mis cursos. Al abrir un programa, las categorías superiores funcionan como menú: el panel se superpone a la configuración, sin desplazarla. Se cierra desde el mismo botón, Cerrar o Escape; abrirlo nuevamente reutiliza la página ya cargada. **Vista completa** muestra la cuadrícula dentro de la misma página, sin ventana emergente. **Volver al curso abierto** conserva el editor y los cambios que aún no guardaste. Cambiar a otro curso carga sus propios módulos; guarda antes los cambios que quieras conservar al cambiar de programa.

Cada cuadrícula comienza con **+ Crear curso** y utiliza tarjetas pequeñas: título, tipo, cantidad de módulos, público y breve descripción. 25, 50, 65 o 100 programas por página, con Anterior/Siguiente cuando haga falta. Las categorías cerradas muestran sus conteos sin descargar los cursos; abrir una solicita solo sus resúmenes, sin lecciones, materiales, credenciales ni archivos. Se retiró de esta navegación la consulta legacy limitada a100 cursos globales. No hay sondeo automático de la biblioteca. Actualizar biblioteca permite consultar cambios de otros owners.

**Nueva categoría** crea un nombre propio y color (por ejemplo, Cursos para técnicos), con público Otro inicialmente editable. El orden se cambia arrastrando el tirador ⠿, incluido desde dispositivos táctiles; con el tirador enfocado también sirven las flechas del teclado. Categorías y orden se guardan en el servidor, compartidos por los owners que ya comparten la biblioteca. Las escrituras validan permisos/revisión y rechazan conflictos concurrentes sin pisar el orden de otro usuario. Hasta60 categorías personalizadas; las cuatro originales se conservan.

Las categorías organizan los mismos cursos y recursos; no crean copias de los archivos. Abrir un curso conserva su organización por módulos y materiales. Archivar mantiene el historial y los recursos, como antes; no libera almacenamiento eliminando archivos.


## Editor en tres columnas y desarrollo completo · 02/11/2026

Hay un solo título **Cursos IA** en la barra superior, con **Compartir** (consulta de owners habilitados; no concede acceso a otros roles) y Ajustes IA. Las categorías aparecen debajo. En biblioteca, una selección muestra cuadrícula y varias selecciones muestran franjas apiladas en orden de selección, con carrusel independiente. Cada categoría tiene buscador parcial insensible a mayúsculas y tildes, y selector 25/50/65/100. En el editor el menú permanece arriba al desplazarse; se abre como lista vertical superpuesta, conserva la altura del editor y ofrece Vista completa dentro de la página.

- **Izquierda: Configuración.** Prompt general primero, referencias opcionales después y parámetros del curso a continuación. Guardar no genera contenido. Se puede combinar formatos según el tema, explicando la secuencia en el prompt. Los módulos nuevos heredan el estilo general; los existentes conservan los ajustes ya guardados.
- **Centro: Temario.** Generar con IA y Pegar módulos abren una ventana; el temario resultante se presenta en la misma lista compacta. Pegar incorpora títulos/descripciones, sin llamadas IA ni obligación de configurar cada uno. Ver25/50/100/200 por página, seleccionar todos, página o módulos individuales. ✎ Editar/ver abre las instrucciones opcionales, estilo, combinación de formatos, minutos y resultados de un módulo.
- **Derecha: Recursos.** Las casillas se aplican a los módulos seleccionados y mantienen la combinación de los demás. Una casilla intermedia indica mezcla entre seleccionados. Se puede combinar videoclase, audio, presentación, guía, taller, cuestionario, libro, bibliografía, infografía e imágenes/escenas IA. El resumen por módulo muestra su combinación. Cantidad e indicaciones por tipo de recurso son opcionales; los matices particulares del módulo se describen en su prompt.

**Desarrollar curso completo / Desarrollar selección** guarda el prompt y recursos e inicia un plan durable. Si aún no hay temario, lo genera antes de desarrollar. Si ya existe, lo conserva. Por cada módulo seleccionado desarrolla la clase y los recursos indicados; reutiliza contenido terminado, evita duplicar narración al elegir video y audio y mantiene el progreso al cerrar/recargar. Una nueva versión del contenido sigue siendo una acción explícita por módulo. Detener conserva lo terminado y espera a la solicitud ya enviada; un error o cargo incierto requiere revisión, sin reintento automático.

Las presentaciones se derivan de la clase sin una segunda llamada de texto. Bibliografía reúne las fuentes identificadas para revisión, sin inventar documentos. La infografía se exporta como bloques visuales imprimibles/HTML, además de formatos editables. La videoclase narrada se presenta y compone localmente; un profesor visible o animación generativa exige seleccionar escenas de video IA y un modelo compatible. No se promete avatar, sincronía labial ni un MP4 de larga duración generado automáticamente. Los minutos configurados son objetivos editoriales. Cambiar de categoría o guardar no llama a proveedores; el progreso solo se consulta mientras hay trabajos activos y la página está visible.

Migraciones aditivas: `202611020003_course_builds` y `202611020004_course_module_styles`. Las fuentes continúan guardando únicamente información textual extraída y procedencia; no se archivan originales ni se promete soporte binario de varios GB.

## Ajustar columnas, borrar módulos y evitar recursos duplicados · 02/11/2026

Configuración empieza más ancha (380px) y se puede ajustar arrastrando la separación con Temario. Recursos también tiene su separación ajustable. Flechas del teclado cambian el ancho y doble clic/Home restablece el inicial. La preferencia se guarda por usuario en este navegador y sobrevive una recarga sin caché (Ctrl+F5); no se comparte con otros usuarios ni realiza consultas al servidor. En pantallas pequeñas las columnas se adaptan y los tiradores se ocultan.

Cada módulo tiene **Eliminar módulo** junto a **Editar/ver**. Una confirmación identifica el módulo y advierte que se borrarán contenido y materiales. La API comprueba OWNER vigente, curso/módulo y sus revisiones; rechaza trabajos activos o inciertos. Elimina el módulo y sus materiales/activos, reajusta posiciones y retira su ID de las asignaciones de recursos, conservando módulos hermanos y el historial de trabajos. Tras confirmar la transacción libera los archivos; si la limpieza falla, informa que el módulo ya se eliminó y que quedan archivos pendientes. No inicia IA. El último módulo de una página vuelve a la página anterior; eliminar todos no borra el curso.

La ventana **Editar/ver** muestra **Prompt y ajustes del módulo · opcional**. El prompt añade instrucciones/información específica al prompt general; los documentos y enlaces siguen en Referencias a la izquierda y los recursos se eligen en la columna derecha. Se retiraron Material complementario y + Material de esta ventana. **Resultados del módulo** aparece solo si hay materiales existentes y conserva consulta, corrección y descarga; no duplica el formulario de creación de recursos.


## Referencias compactas, suite y voz propia · 02/11/2026

Referencias muestra solo **Archivos adjuntos (N)**, **Enlaces web (N)** y **Textos pegados (N)** y la capacidad de PDF/Word. Cada botón abre una única ventana. Puedes preparar varios documentos, pegar enlaces separados por comas/espacios/saltos de línea o añadir varios textos numerados. No exige nombres de referencia. La X retira un pendiente antes de subirlo o elimina una referencia guardada. Enlaces/textos guardados admiten Editar con revisión; los documentos se retiran y adjuntan de nuevo. Un lote conserva los éxitos y deja los errores editables, sin reenviar los elementos ya guardados. Listas sin contenido completo; carga de texto solo al editar. Los límites técnicos anteriores siguen vigentes y se explican aquí, sin llenar la columna con avisos.

**Usar Google en todo** selecciona texto, voz, imagen y video entre los modelos compatibles consultados de esa cuenta; exige disponibilidad de las cuatro capacidades y de voces. Puedes cambiar después cualquier parte y guardar. No genera ni cambia cursos ajenos. Proveedor es la conexión/cuenta que factura; modelo es la herramienta específica para cada función. Gemini es la familia de Google; las imágenes se muestran con nombres reconocibles **Nano Banana** junto a su modelo. FLUX se ofrece mediante fal.ai cuando el catálogo/esquema consultado permite generar imágenes sin entradas adicionales obligatorias. No se añade una opción por el solo nombre de una plataforma ni se promete el menor precio sin consultar su tarifa.

En Ajustes IA → Conexiones → ElevenLabs, **Actualizar mis voces** importa las voces propias y clonadas disponibles con la clave guardada. **Clonar una voz autorizada** recibe nombre/audio y consentimiento explícito dentro de la plataforma; ElevenLabs puede exigir plan/verificación. Al finalizar actualiza el catálogo. Si falla esa actualización después de crear la voz, indica que ya existe y pide actualizar la lista, sin repetir la clonación. Las voces siguen en su proveedor: seleccionar Google u OpenAI no importa ni clona automáticamente una voz de ElevenLabs.

El estilo general admite **Se decidirá en cada módulo**. Idioma ofrece español latinoamericano/España, inglés, portugués y otras opciones; conserva valores heredados personalizados. La cabecera del programa tiene una franja con fondo de color y título de alto contraste. Video distingue proporción de escena IA y **formato final horizontal/vertical**; el reproductor compone también a720×1280/1080×1920 con disposición vertical, útil para Reels/TikTok/Shorts. Exporta MP4 o WebM según soporte del navegador.

## Clips promocionales opcionales

En Configuración abre **Clips promocionales · opcional** y elige Sin clips, Tráiler del diplomado/curso completo o Avance de cada módulo seleccionado. Configura duración objetivo15–90segundos y llamada a la acción. **Generar clips promocionales** es una acción explícita independiente del desarrollo de clases; guardar o elegir opciones no genera. Usa el contexto del programa/temario/público, guion con gancho, aprendizajes/beneficios y CTA, y la voz configurada. No inventar precios, fechas, acreditaciones, testimonios ni garantías.

Cada clip conserva guion/voz y permite reproducción y exportación local con el formato final seleccionado. La duración es objetivo editorial, no recorte garantizado a segundos exactos. Este flujo genera texto y audio; no promete un avatar, lip-sync ni filmación de aplicaciones. Opciones de escenas generativas del módulo siguen siendo independientes.

Plan y activos propios en AICoursePromo/AICoursePromoAsset, migraciones aditivas005(referencias tipo/revisión) y006(clips). Workflow secuencial, máximo2 llamadas globales/1curso, idempotencia y snapshots de credenciales; permisos/clave se revalidan antes de llamar/publicar. Cola pública no admite tareas internas de clip. Detener conserva resultados y espera lo ya enviado; error/cargo incierto no produce reintento automático. No hay generación desde GET/poll. Borrar un módulo elimina sus avances/archivos, conservando tráileres globales e historial.

Documentación consultada: [Google, modelos de imagen/Nano Banana](https://ai.google.dev/gemini-api/docs/image-generation), [Mistral](https://docs.mistral.ai/api/endpoint/chat), [Cartesia TTS](https://docs.cartesia.ai/api-reference/tts/bytes). OpenAI [retiró Videos API/Sora el24/09/2026](https://developers.openai.com/api/docs/deprecations); no se ofrece como integración operativa. Google/fal.ai mantienen las opciones de escenas compatibles con cuenta/esquema. Suscripción de chat y saldo/API son conceptos distintos.


## Editar y eliminar módulos

Cada tarjeta dispone de **Editar módulo** y **Eliminar módulo**. También puedes desmarcar Todos los módulos, seleccionar uno y utilizar las mismas acciones junto al contador. Las selecciones múltiples siguen sirviendo para generar recursos y no eliminan varios módulos de una vez.

El editor abre con indicador de carga y ofrece Reintentar carga si falla la lectura. Permite guardar título, instrucciones y duración sin generar IA; los controles de contenido desarrollado siguen disponibles. Eliminar pide confirmación y afecta solo a ese módulo y sus materiales, respetando revisiones y bloqueos por trabajos activos o inciertos.


### Ajustes y validación del 10/11

OpenAI y Gemini pueden estar conectados simultáneamente; la generación usa solo el proveedor/modelo elegido para ese curso. No hay cambio automático de proveedor ante un fallo. Los segundos de clips IA opcionales son límites reales del modelo y no limitan la duración de la videoclase. Los minutos por módulo son objetivos editoriales independientes.

Las preferencias técnicas globales no trasladan público, módulos, duración ni estilo a nuevos cursos. Se conservan los registros históricos y los programas ya creados. La ventana de temario conserva también el prompt y ajustes pendientes del formulario. Guardar no genera contenido; pulsar Generar sí solicita texto a la API.

La petición OpenAI Responses no fuerza el modo JSON opcional, incompatible con algunos modelos; el contenido sigue validándose localmente sin reintento automático. Un rechazo muestra HTTP y, cuando son reconocidos, código/parámetro seguros. La validación de lecciones acepta opcionales nulos y números como texto de celdas, sin rellenar narración/ejercicios faltantes. Si falla otro campo, se muestra su ruta segura en vez de una explicación genérica, manteniendo el temario y versión anterior. No se afirma haber identificado el motivo exacto de un rechazo histórico de producción sin sus datos.
