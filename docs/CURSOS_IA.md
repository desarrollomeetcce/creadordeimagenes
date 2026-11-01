# Cursos IA

Módulo independiente de la plataforma, exclusivo para cuentas OWNER aprobadas, vigentes y con IA habilitada. Los permisos se comprueban también en cada API, archivo y paso de generación. No concede acceso a ADMIN ni comparte automáticamente cursos con alumnos.

## Uso

1. Abre Cursos IA → Conexiones. Guarda las claves que quieras usar y pulsa Consultar modelos y voces. Los modelos seleccionables provienen de la respuesta de tu cuenta, filtrados por capacidad compatible.
2. Crea un curso o diplomado. Describe tema, objetivos, edad, conocimientos previos, contexto, ejemplos y resultados esperados. Elige público, nivel, enfoque, idioma, tono, estilo, cantidad inicial de módulos y minutos objetivo.
3. Genera el temario. Revisa y modifica módulos; puedes añadir más y cambiar el orden con las flechas. El temario existente nunca se reemplaza automáticamente.
4. Desarrolla un módulo o los módulos pendientes. La cola trabaja por módulo; los ya desarrollados se conservan. Las nuevas versiones requieren una acción explícita.
5. Revisa las escenas, pasos, narración, práctica y solución. Corrige una escena con sus campos de texto sin consumir IA. El JSON avanzado permite editar también estructuras de tablas.
6. Genera primero una voz de prueba por escena. Si te convence, Generar voces pendientes completa las demás. Las voces ya guardadas de esa versión no se solicitan de nuevo.
7. Abre Presentación y video. Puedes recorrer y reproducir las escenas; después de narrarlas todas, exporta el video en MP4 o WebM según las capacidades del navegador.
8. Añade guías, libros, talleres, exámenes o diapositivas independientes. Puedes crear varios del mismo tipo, indicar instrucciones y corregir su contenido sin IA. Imprime o guarda en PDF; descarga Word y PowerPoint. El solucionario se incluye solo al elegirlo expresamente.

## Proveedores y claves

- OpenAI: contenido, narración e ilustraciones opcionales. Claves: https://platform.openai.com/api-keys
- Google Gemini: contenido. Claves de API: https://aistudio.google.com/apikey
- Anthropic Claude: contenido. Claves: https://console.anthropic.com/settings/keys
- ElevenLabs: narración y clonación de voz. Claves: https://elevenlabs.io/app/settings/api-keys

Recomendación inicial: OpenAI o Gemini para diseñar y desarrollar; ElevenLabs para elegir y probar voces. Claude es una alternativa para escritura. Solo se muestran los modelos devueltos por tu cuenta y compatibles con las operaciones integradas; no se garantiza disponibilidad de un modelo o de una clonación sin consultar tu cuenta. Las suscripciones de ChatGPT u otras interfaces web no sustituyen su facturación API.

Las claves de Cursos IA están cifradas con AES-256-GCM y contexto propio `courses:proveedor`. No cambian las claves, modelos, planes ni configuración de generación de imágenes de la plataforma. Para empezar no es necesario configurar todos los proveedores. Guardar una clave no hace una llamada de generación.

La clonación utiliza la API de ElevenLabs. Debes confirmar que la muestra es tuya o que tienes autorización expresa. El plan, los permisos y una posible verificación de ElevenLabs determinan cuándo se puede usar. El audio se envía directamente desde el servidor al proveedor; no se guarda como muestra en nuestra plataforma.

## Presentación, pizarra y práctica

Las escenas combinan diapositivas, escritura progresiva en pizarra, revelado de código, resaltado de tablas y cuentos con ilustraciones opcionales. No se necesita una cámara ni un rostro. Sin ilustración generada, los cuentos tienen una composición gráfica sencilla; una imagen generada requiere una solicitud explícita y un modelo de imagen OpenAI disponible.

Código, Excel y Power BI se explican mediante demostraciones simuladas y recursos exportables. No se ejecuta código IA ni se controla una instalación real de Excel/Power BI/Python. Una grabación real de esas aplicaciones o un avatar animado con sincronización labial no forma parte de este módulo. Los pasos se revelan a lo largo del audio; no hay alineación fonética palabra por palabra. Revisa los contenidos y resultados antes de impartirlos.

Los minutos son una meta didáctica, no una duración medida. La duración final depende de las narraciones y de la profundidad generada. Los libros se generan como recursos estructurados y editables, dentro de los límites de salida del modelo; para un texto extenso conviene separarlo en materiales o capítulos. La calidad pedagógica, matemática y de la voz requiere revisión con contenido real.

## Rendimiento y continuidad

- El código cliente, catálogo de cursos y credenciales se cargan solo al entrar en Cursos IA. El reproductor se carga al abrirlo. El resto de módulos no consulta estas tablas ni proveedores.
- El curso muestra metadatos y contadores; el contenido completo se obtiene solo al abrir un módulo. No descarga audio hasta reproducir o exportar.
- Solo hay seguimiento cada cinco segundos mientras existen trabajos pendientes/en curso y la pestaña está visible. Consulta estados pequeños; recarga contenido únicamente al cambiar el estado.
- La generación usa un workflow separado, máximo dos solicitudes simultáneas globales y una por curso. Solo las acciones explícitas crean trabajos; los GET, la navegación, el foco y la recarga no generan IA.
- Cada solicitud tiene identificador único y cada trabajo un claim interno. No se reintenta automáticamente una llamada que pudo tener cargo. Los fallos, respuestas incompletas y contenido inválido conservan la versión anterior; el uso recibido queda registrado. Una interrupción requiere revisión, nunca se presenta como reembolso.
- La exportación de video usa Canvas, Web Audio y MediaRecorder del navegador, sin instalar un renderizador de video ni usar CPU del VPS para codificar. Mantén la ventana y pestaña visibles hasta terminar; al cerrar el reproductor se detiene esa exportación local. La generación de texto/voz ya despachada continúa independientemente.
- PDF usa la impresión nativa del navegador; no requiere un servicio adicional. Word y PowerPoint se crean localmente en el servidor bajo demanda, sin IA.
- Archivar conserva módulos, materiales, trabajos y archivos; no borra ni vuelve a generar recursos automáticamente.

## Instalación y comprobación

Aplicar la migración aditiva `202611010001_courses_ai` mediante `npm run db:deploy` y regenerar Prisma. No modifica tablas de Meta ni trabajos de imágenes. Reutiliza el mecanismo Workflow ya configurado por la plataforma (`WORKFLOW_TARGET_WORLD=local` en el VPS o el backend correspondiente en Vercel). Sin claves, permite crear y editar estructura, pero no producir IA.

Pruebas nuevas: `tests/courses-ai.test.ts` y `tests/courses-ai.integration.test.ts`. La integración requiere una base de pruebas exclusiva; el archivo exige el marcador de aislamiento usado en este entorno. Todos los proveedores son dobles explícitos. Las pruebas sintéticas acreditan ejecución y permisos, no naturalidad real de la voz ni exactitud académica.
