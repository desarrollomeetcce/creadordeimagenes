# Rendimiento de la plataforma

Las pantallas de Biblioteca, Meta Ads, editor, costos, estadísticas, usuarios, historial y ajustes especializados se descargan por separado cuando se necesitan. Los avisos globales y las utilidades de descarga están separados de los paneles pesados. Los módulos son compartidos por el navegador una vez descargados.

Adjuntos carga sus archivos, capacidades y vínculos del sistema al abrir «¿Quieres adjuntar referencias?» por primera vez. Plegar de nuevo conserva el componente y los borradores. Biblioteca del selector se descarga al abrir el diálogo. No cambia el guardado diferido, pegado explícito ni la subida por partes. La Biblioteca normal cancela solicitudes de vista sustituidas por otro filtro; esto no cancela trabajos de generación.

Meta Ads conserva agregados de los periodos fijos en PostgreSQL, una fila por objeto. Su versión depende de conexión, sincronización completa/parcial y zona horaria; el día de la cuenta también invalida el resumen. El calendario personalizado consulta únicamente el rango solicitado. Permisos, asignaciones, metadatos y frescura diaria se comprueban en cada solicitud. La caché no contiene tokens ni respuestas autorizadas por usuario y nunca sustituye las guardas de acceso. La tabla tiene borrado en cascada con el objeto. Las pestañas Cuentas/Conexiones no calculan análisis ocultos; búsqueda espera200ms y las solicitudes de análisis obsoletas se cancelan.

## Medición local, 21 de octubre de 2026

Compilación de producción, suma de scripts iniciales del HTML, misma aplicación antes/después:

| Medida | Antes | Después |
| --- | ---: | ---: |
| JavaScript sin comprimir |917.310 bytes|743.399 bytes|
| JavaScript gzip |268.806 bytes|224.064 bytes|

Reducción del JavaScript inicial comprimido:16,6%. Los módulos diferidos se descargan al usarlos; esta medición no incluye imágenes, CSS ni todo el tráfico de una sesión.

PostgreSQL local sintético,200 anuncios y24.000 registros diarios: cálculo inicial271ms; cinco consultas reutilizadas9/8/10/9/8ms (mediana9ms); calendario personalizado17ms. No son tiempos garantizados de producción ni mediciones de latencia de Meta.

Chromium contra el servidor compilado: cero consultas de adjuntos/vínculos mientras están plegados; dos consultas de listas al abrir (más capacidades), cero repetidas al reabrir; cero consultas analíticas al entrar a Conexiones; una consulta al escribir rápidamente Forense. Sin errores JavaScript en Biblioteca, estadísticas, costos, usuarios, historial y ajustes IA. Pruebas de adjuntos en los tres niveles conservan selección múltiple, captura pegada, guardado, recarga, vínculos, fullscreen y móvil.

61 unitarias,136 resultados de integración HTTP/PostgreSQL, TypeScript y build correctos. La integración verifica reutilización sin reescritura, calendario, invalidación después de sincronizar y al cambiar el día, y revocación de acceso con caché poblada. No se ejecutaron llamadas IA ni conexiones Meta reales.

Las generaciones siguen dependiendo de proveedor, modelo, calidad, resolución y cola. Estas mejoras no elevan dichos parámetros ni agregan llamadas pagadas. La primera consulta de un conjunto nuevo sigue calculando los agregados; no se promete respuesta instantánea ni sincronización externa sin autorización.
