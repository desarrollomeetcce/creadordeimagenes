# Cursos IA y Ajustes IA

Cursos IA sigue siendo exclusivo de OWNER aprobado, vigente y con IA habilitada. Las comprobaciones también se hacen en el servidor, en archivos y antes de generar/publicar.

## Un solo lugar para conectar proveedores

Abre **Ajustes → Ajustes IA → Conexiones**. Las tarjetas están plegadas; abre un proveedor, guarda la clave y consulta su catálogo explícitamente. Abrir la pantalla o desplegar una tarjeta no genera contenido.

| Proveedor | Funciones integradas |
| --- | --- |
| OpenAI | Afiches, contenido de cursos, voz e ilustraciones |
| Google AI / Gemini | Afiches, contenido, ilustraciones, voz y video compatibles con su API |
| fal.ai | Afiches y clips de video de distintos fabricantes, según catálogo/esquema |
| Replicate | Afiches; su catálogo de video no está integrado |
| Anthropic Claude | Contenido y materiales de cursos |
| ElevenLabs | Narración y clonación de voz autorizada |

Una clave de un proveedor puede autorizar varios modelos del mismo proveedor. No se comparte una clave de Google con fal.ai ni con OpenAI. Las suscripciones de chat y Flow no equivalen a acceso/saldo de API. Cada cuenta determina los permisos, modelos y facturación disponibles.

OpenAI/Google/fal de Cursos IA pueden usar la conexión compartida de la plataforma **por referencia, sin duplicar el secreto**. Los catálogos de afiches y cursos permanecen separados por capacidad y los parámetros de generación también. Cambiar la clave compartida invalida el catálogo correspondiente y detiene trabajos antiguos antes de usar una credencial nueva. El consumo y los límites del proveedor siguen compartidos cuando se usa la misma cuenta/API key.

Las claves anteriores de Cursos IA no se sobrescriben: si existe una distinta, la tarjeta lo indica y ofrece **Usar clave compartida en Cursos IA**. La sustitución requiere esa elección explícita y una nueva consulta de modelos. Claude y ElevenLabs se administran en esta misma pantalla y conservan su contexto de cifrado propio. Ninguna clave se devuelve al navegador ni se incluye en URLs de seguimiento.

## Parámetros por uso

- **Afiches:** conserva los controles existentes de proveedor/modelo/calidad/resolución y las pruebas autorizadas. El formulario se despliega al solicitarlo; no se monta ni sondea mientras estás en Conexiones o Cursos.
- **Cursos · texto, voz y video:** configura valores iniciales para nuevos programas. No cambia cursos anteriores. Cada programa permite ajustar después su propia configuración.
- **Texto:** OpenAI/Gemini/Claude; dificultad, enfoque, público, idioma y objetivos pedagógicos.
- **Voz:** OpenAI, Gemini TTS o ElevenLabs; modelo y voz disponibles. OpenAI admite velocidad; el tono se transmite donde la API lo permite. La clonación integrada sigue siendo ElevenLabs, con consentimiento y posible verificación del proveedor.
- **Ilustraciones:** OpenAI o Google; Nano Banana/FLUX pertenecen a imagen, no se muestran como video. Calidad baja/media/alta de ilustraciones OpenAI; Google usa los parámetros compatibles del adaptador existente.
- **Clips:** Google o fal.ai; solo modelos de video compatibles devueltos por la cuenta. Resolución, duración y formato se ofrecen según el modelo; si no expone un parámetro se indica Automático. Duración de Google Omni se solicita como objetivo en el prompt, no se promete exactitud temporal.
- **Clase narrada:** exportación local a720p/1080p, independiente del modelo que crea clips. No requiere contratar una IA de video para usar diapositivas/pizarra/código/tablas.

## Flujo de trabajo sencillo

1. **Crear carpeta del programa.** Solo nombre, tipo (curso/diplomado/programa/taller/seminario), descripción breve y público. Incluye Otro público con texto personalizado. No pide prompt largo ni modelos; no llama a IA. La carpeta muestra descripción y destinatarios.
2. **Entrar → Temario.** Elige Generar con IA o Pegar módulos. Objetivo, dificultad, enfoque, cantidad y demás parámetros se editan dentro del programa, sin un formulario emergente de configuración. Guarda los cambios antes de generar.
3. **Pegar temario.** Un título por línea o encabezados Módulo1/Unidad1/Tema1 con descripciones debajo. Crea módulos independientes y ordenados en una transacción, sin IA. Añade al temario existente; no lo sustituye. Hasta100 módulos por programa.
4. **Generar temario.** Propone hasta24 módulos según el objetivo y los parámetros guardados. Solo cuando la carpeta no tiene módulos; nunca reemplaza un temario ya definido.
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
