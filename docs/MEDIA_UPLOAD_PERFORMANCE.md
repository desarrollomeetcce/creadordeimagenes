# Subida y preparación de imágenes · 23/11/2026

## Cambios

La tanda de Proyectos admite dos fotos PNG/JPG/WebP de hasta8MiB simultáneamente. Los videos y fotos mayores se envían solos. Antes de enviar se comprueban los límites que proporciona el servidor; validación de contenido y autorización permanecen en el servidor. Se conserva la única recarga final de galería. Ante un fallo, se espera a la solicitud que ya estaba en vuelo, se conservan sus éxitos y no se inicia el siguiente par. No hay reintentos automáticos de escritura.

La huella SHA256 y la validación del recurso propio comparten el mismo buffer original. PNG/JPEG/WebP se conservan íntegros, sin conversión ni reducción de calidad. El guardado sigue revalidando cuenta/carpeta y manteniendo la idempotencia, las transacciones, el máximo de20archivos y la retención anterior.

El botón Actualizar recursos renueva explícitamente también las URL de miniaturas. Actualizar solo el listado podía conservar un elemento img fallido con el mismo src. El parámetro reload fuerza otra solicitud del navegador, sin invalidar el caché de bytes derivado del servidor ni repetir la subida. Las actualizaciones automáticas no renuevan esas URL ni introducen bucles de reintento.

## Miniaturas con caché fría

El caché previo seguía hasta8solicitudes en curso, pero las siguientes llamaban directamente al procesador sin seguimiento. Por tanto no limitaba los decodificadores y tampoco compartía necesariamente las solicitudes repetidas de esas imágenes. Se corrige con un máximo de2preparaciones por caché, cola FIFO y seguimiento de hasta128recursos distintos pendientes; las peticiones del mismo recurso comparten resultado. Un exceso devuelve503 controlado en lugar de abrir trabajo ilimitado. Un fallo libera el puesto y no se conserva como éxito.

Se mantienen los límites de bytes/entradas/cinco minutos, las claves por ID/revisión/ruta o cuenta/anuncio/URL y la autorización en cada petición. No se cachean permisos ni estados publicitarios. Tampoco se crean nuevas copias persistentes. Los límites se mantienen al vencer el caché y después de reiniciar un proceso.

## Envío a Meta

Los pasos IMAGE de campañas envían el archivo original como multipart filename a adimages. Evita la expansión base64 (aproximadamente4/3del tamaño binario, antes de codificar el formulario) y sus copias adicionales. El adaptador valida formato/tamaño; el token permanece en Authorization, y appsecret_proof permanece en el cuerpo. Los consumidores históricos que proporcionan bytes mantienen su contrato anterior. Video, recibos, revisión del recurso, reclamación del paso, confirmación de Meta, cuotas y prevención de duplicados siguen vigentes. No se añade paralelismo ni reintento a las publicaciones de Meta o generaciones IA.

## Diagnóstico

Las respuestas correctas de Creative Studio incorporan X-Media-Pipeline: bounded-v2. Las subidas además devuelven Server-Timing con authorize, receive, lookup y, para recursos nuevos, validate, store y commit. Son duraciones sin nombres de archivo, identificadores privados, cuerpos, tokens ni claves. receive mide la lectura recibida por Node; no incluye una posible espera anterior en el proxy, ni la autenticación inicial de sesión. Una respuesta401o un intermediario que bloquee la solicitud puede no incluir esas cabeceras: su ausencia por sí sola no prueba una versión antigua.

No se vació el caché productivo ni se borraron imágenes. El acceso de comprobación a https://generator.agenciamagneto.org fue bloqueado por el proxy de este entorno (CONNECT403), por lo que estos cambios no certifican latencia, recursos ni versión aplicada en el VPS. Publicar main no acredita un despliegue allí.

## Verificación

389 pruebas generales, TypeScript y build. Pruebas específicas con24miniaturas distintas y solicitudes repetidas, tanto en frío como después de caducar: pico2preparaciones, una por recurso y ciclo. Las tandas comprueban concurrencia2, aislamiento de archivos grandes/videos, éxitos parciales y ausencia de repetición.

Integración delivery_qa con fotos PNG y video MP4 H.264/AAC reales: replay de subida, originales intactos, permisos/caducidad/304, cuerpo binario de imagen, flujo con recibos Meta simulados y sin duplicar video. HTTP de subida comprueba las cabeceras de tiempos/versión. No hubo llamadas Meta ni IA reales.

Chromium con cuatro JPEG y una latencia de prueba añadida antes de las subidas: pico2solicitudes y1galería. Una miniatura fallida con503 se recupera al actualizar sin un nuevo POST. Otra tanda pierde una conexión: solo2intentos, se conserva el compañero confirmado y no se envía el tercer archivo; quedan5imágenes (4previas+1confirmada), con0errores JavaScript sin capturar. Es evidencia local, no una promesa de tiempos de Internet/Meta/VPS.
