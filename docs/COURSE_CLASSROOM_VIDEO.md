# Videoclases grabadas, pizarra y Vimeo · 10/11/2026

La aclaración final del usuario es producir **videos grabados**, con apariencia de explicación docente, dibujos en movimiento y demostraciones. No se incorpora chat ni se exige interacción del alumno. Los ejercicios se entregan como materiales descargables con solucionario separado.

## Uso

1. En Cursos IA, configura tema, público, nivel, referencias y un modelo de texto y voz verificados de tu cuenta.
2. Elige Pizarra, Código, Tablas, Animación, Cuento o Diapositivas; mezcla estilos cuando corresponda. Desarrolla primero una clase de muestra.
3. El desarrollo genera narración, pasos, ejemplos y ejercicios. Puede generar dibujos vectoriales por escena sin pedir imágenes o clips al proveedor. Ilustraciones IA y video generativo siguen siendo adicionales explícitos.
4. Al desarrollar el recurso Videoclase en el servidor, los módulos compatibles con narración completa se ponen automáticamente en cola de MP4. También se puede solicitar desde **Presentación y video → Preparar MP4 en servidor**.
5. La vista permite descargar el MP4, comprobar su duración real y tamaño, o enviarlo a Vimeo. La composición continúa al cerrar la vista. El worker habitual debe estar funcionando.

La pizarra revela transformaciones progresivamente; el editor demuestra escritura de código; las tablas muestran datos y un gráfico; los dibujos permiten personajes originales, árboles, agua, sol, figuras, etiquetas y flechas con movimientos. Los mismos comandos visuales alimentan la previsualización y el render. El código y las interfaces son **demostraciones educativas**: no ejecutan Python ni son Power BI real. No se atribuye una grabación real de esos programas ni se promete un avatar humano.

Los cálculos de los nuevos ejercicios aritméticos se comprueban mediante un parser restringido, sin `eval` ni ejecución de código. Los cuestionarios son descargables, no controles del reproductor. Las fuentes, la adecuación pedagógica y los contenidos técnicos requieren revisión antes de publicar. Una ejecución sin errores de render no certifica la exactitud académica.

## Exportación y rendimiento

FFmpeg compone el MP4 desde fotogramas SVG/PNG y audio existente; no graba la reproducción de una hora en tiempo real ni vuelve a llamar a la IA. Un trabajo de composición global a la vez, FFmpeg con un hilo, recursos por escena limitados y temporales eliminados en `finally`. Se usan 6 fotogramas visuales por segundo y salida H.264 de 24 fps, AAC y `faststart`. El audio existente determina la duración. Resoluciones 720p/1080p; exportación del servidor horizontal 16:9. La exportación local opcional conserva los formatos anteriores y sí utiliza la computadora del usuario en tiempo real.

Límites iniciales: veinte minutos de narración por módulo, diez por escena, 80 MB de entradas por módulo y 64 MB de MP4 final. Para cursos de horas, repartir en módulos. No se garantiza producir cuatro o cinco horas completas en 10–15 minutos: contenido, voz y render tienen tiempos distintos y dependen del proveedor, el hardware y la cantidad de escenas. Se muestra la duración del archivo, no se presenta el objetivo editorial como duración acreditada.

Los trabajos tienen idempotencia, lease privado, heartbeat, cancelación y comprobación de permiso OWNER y revisión. Un proceso interrumpido permite volver a componer sin regenerar la voz. Cambiar o borrar una clase durante la exportación/envío se bloquea. El flujo del worker sigue atendiendo sus otros trabajos mientras esta tarea avanza en segundo plano. No se generan ni consultan cursos desde Meta, Proyectos u otros módulos.

El MP4 y los audios aprobados se conservan como recursos del módulo hasta su eliminación por el flujo existente. Subir a Vimeo **no borra automáticamente la copia del servidor**. No se prometen cero almacenamiento, cero carga de equipo ni precios fijos no medidos.

## Vimeo

Dentro de Presentación y video abre **Conectar Vimeo**, introduce un token personal de tu cuenta con permisos adecuados de lectura, subida y acceso privado, y verifica/guarda. No introducir secretos en conversaciones ni en archivos del repositorio. El token se cifra con contexto `courses:vimeo`; las respuestas solo incluyen máscara, identidad y versión. La verificación `/me` confirma la cuenta, no garantiza autorización de subida ni capacidad disponible del plan.

La subida usa la API de Vimeo y TUS, desde el servidor, por bloques de 5 MB. El video se crea privado. El ID y la dirección privada se guardan antes de enviar bytes; un reintento de una transferencia interrumpida consulta `Upload-Offset` y continúa el mismo video. La cuenta/versión/generación elegidas se comprueban antes de crear la tarea y antes de cada petición. No se envía el bearer token a la dirección TUS.

Si se pierde la respuesta de creación sin ID confirmado, se solicita revisión en Vimeo y **no se repite el POST automáticamente**. El propietario puede cerrar explícitamente ese intento después de revisarlo. Cancelar no borra el video remoto. La confirmación de recepción no equivale a transcodificación ni publicación terminadas: la interfaz lo indica y ofrece abrir Vimeo.

## Despliegue y verificación

Migraciones `202611100001_course_classroom` y `202611100002_course_render_metrics`, generación de Prisma, compilación y reinicio habitual de web/worker. Docker ya instala FFmpeg y fuentes. En instalaciones serverless sin worker persistente el exportador del servidor se deshabilita.

`npm test` incluye las pruebas de aritmética, formatos, dibujos escapados y URLs de subida. `RUN_CLASSROOM_QA=1 DATABASE_URL=postgresql://…/delivery_qa npx tsx --test tests/course-classroom.integration.test.ts` exige esa base exclusiva: crea un MP4 real con audio sintético, verifica pistas/dimensiones/duración, idempotencia y autorización, cola automática del desarrollo y composición 1080p. Vimeo se simula: pérdida de acuse de un bloque reanuda sin duplicar; pérdida de creación se conserva para revisión sin otro POST.

Chromium verifica las cuatro vistas, reproducción, descarga protegida HTTP206, presentación en móvil y ausencia de interacción obligatoria o llamadas IA por previsualizar/exportar. Estas pruebas no acreditan calidad de una voz real, costo de proveedores ni recepción desde la cuenta Vimeo del usuario. El despliegue de Hostinger tampoco se acredita con una compilación local.
