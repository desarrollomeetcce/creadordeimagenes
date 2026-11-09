# Recursos propios en Proyectos

En la primera columna se elige «Sin IA · fotos y videos». El proyecto, país, inventario y diplomados se seleccionan con los controles existentes. La columna central recibe archivos para el diplomado activo; las selecciones de cada diplomado son independientes. También se pueden subir recursos propios en el modo Con IA. El método tradicional/IA de la campaña sigue siendo independiente de la preparación del material.

La subida admite fotos PNG/JPEG/WebP y videos MP4/MOV con H.264, audio AAC opcional, resolución hasta4096 por lado y duración hasta60min. Se comprueban firma y metadatos reales con ffprobe, sin transcodificar ni generar portadas locales. Docker incluye ffmpeg/ffprobe. Cada petición está acotada a64MiB (3MB en Vercel); las imágenes procesadas conservan además el límite de16MiB del almacenamiento. Hasta20 archivos por selección, enviados secuencialmente. Los videos se suben mediante multipart, no como base64 en una URL.

Antes de subir se elige:

- **Solo campaña:** copia temporal protegida con caducidad24h. La transferencia a Meta necesita esta copia; no significa almacenamiento cero durante la preparación. Al terminar una publicación verificada se adelanta su vencimiento y la limpieza durable existente elimina sus bytes. No se adelanta si otro borrador/intento pendiente usa el mismo recurso; el plazo original24h sigue aplicando. Los recibos y registros de auditoría son metadatos y permanecen.
- **Guardar en esta carpeta:** archivo permanente en el diplomado seleccionado, visible en Biblioteca. También se puede conservar después con «Subir seleccionados a carpeta».

No se llama a IA, no se reserva consumo, no se crea UsageLedger, ImageVersion ni AuditThumbnail al subir. El GenerationJob COMPLETED identifica únicamente el recurso manual con source=own-resource, digest y coste reservado0; no ejecuta generación. Auditoría Visual añade entradas textuales paginadas en «Recursos propios · sin IA», con archivo, proyecto/carpeta/diplomado, tipo y destino. No se borran miniaturas históricas de otras operaciones.

Los videos en la galería y Biblioteca usan `<video controls preload="none">`; la descarga original es autenticada y admite un único rango HTTP para reproducción. Las exportaciones ZIP conservan MP4/MOV y no los convierten a JPEG. Los recursos propios mantienen el original; el editor de imágenes no se ofrece para ellos. La regeneración por lotes rechaza videos antes de reservar trabajos.

## Publicación en Meta

La selección sigue usando IDs autorizados de Variation. El servidor toma mediaType de su registro y congela ese mapa junto con revisiones; el navegador no decide el tipo del creativo. Los planes anteriores de imágenes conservan su interpretación.

Para video, el plan usa POST `act_<id>/advideos` con archivo `source`, guarda el ID confirmado, y consulta el mismo ID con `id,status,picture` hasta `status.video_status=ready` y una portada HTTPS de Meta. Entre lecturas hay espera durable15s; no se repite la subida. La espera de procesamiento se acota a30min. No se consulta un catálogo adicional. El creativo usa `object_story_spec.video_data` con video_id/image_url/message/title/link_description/call_to_action y, cuando corresponde, page_welcome_message. Se leen de vuelta video, página, CTA, título y conversación antes de continuar. No se activa nada fuera del flujo de confirmación existente. Cuotas, errores inciertos, acceso por cuenta y recibos se conservan.

Referencias comprobadas en el SDK oficial de Meta:

- https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adaccount.py (`create_ad_video`, source=file, /advideos).
- https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/advideo.py (status, picture).
- https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adcreativevideodata.py (campos del creativo de video).

Meta sigue validando permisos y compatibilidad del anuncio con sus ubicaciones. Las pruebas del repositorio simulan Meta y no crean anuncios reales.
