# Estudio creativo de tres columnas

Proyectos abre un espacio adaptable: proyecto y configuración a la izquierda, afiches en el centro y preparación/publicación Meta a la derecha. Los separadores admiten arrastre, flechas y restauración; las anchuras son preferencias locales. Móvil conserva las tres áreas mediante pestañas.

El proyecto contiene el comportamiento y las referencias opcionales. Producto es carpeta con nombre y país. Sus prompts históricos permanecen almacenados, pero el nuevo flujo combina comportamiento del proyecto e instrucciones particulares del diplomado. Configuración por proyecto no modifica proveedor/modelos globales. Generación usa el pipeline existente, reserva y autorización explícita de cargo, muestra inicial y aprobación. La cantidad permite nuevas variaciones; la selección masiva pertenece solo al diplomado activo. Cargas manuales no consumen IA. Guardar seleccionados hace permanentes únicamente los elegidos y los incorpora a Biblioteca.

Inventario y grupos se consultan de forma autorizada y diferida; búsqueda/selección son locales. Anuncios Meta IA en el selector compartido permite guardar una selección privada y abrirla en el estudio, sin modificar miembros ni hechos financieros. Biblioteca conserva sus funciones y añade presentación de carpetas por tarjetas/tamaños o tabla con conteos disponibles.

## Publicación Meta

Se utilizan conexiones API existentes, permisos de edición y cuentas principales autorizadas. Página promocionable y WhatsApp vinculado deben ser accesibles a la credencial. Recursos de una cuenta se consultan al elegirla. No se consulta gasto/histórico para preparar campañas. Las plantillas admiten {diplomado}, {producto}, {pais}, {codigo}; no requieren IA. Cada diplomado elegido produce una campaña y dos conjuntos, con un anuncio por imagen en cada conjunto. Presupuesto diario explícito por campaña, moneda de la cuenta y total visible. Configuración avanzada opcional para públicos, edades y categorías especiales.

Revisión final de imágenes, texto, destino y presupuesto precede a publicación. Estado inicial predeterminado PAUSED. ACTIVE requiere confirmación adicional de gasto; las entidades se crean pausadas, se verifica su pertenencia, presupuesto, destino y estado antes de activar. CreativeMetaLaunch guarda configuración inmutable, revisiones de imágenes, recibos y progreso. Cada paso se reclama por CAS antes de llamar a Meta. Fallos, respuesta incierta o reclamo abandonado detienen en NEEDS_REVIEW: no se repite una escritura posiblemente cobrada/publicada. Una interrupción del navegador permite consultar estado y continuar solo pasos pendientes seguros.

Los objetos confirmados se guardan localmente para la vista Meta, sin inventar estadísticas ni reiniciar cursores. Vinculación de inventario exige identidad canónica y alias inequívoco del mismo país. Esta implementación requiere permisos reales ads_management, página/WhatsApp vinculados y aceptación de Meta. Pruebas sintéticas no acreditan aprobación o entrega de anuncios reales.

## Persistencia y validación

Migración aditiva 202611050001_creative_studio: JSON studio en Project/Category/Subproduct y tablas CreativeMetaLaunch/CreativeInventorySelection. No borra prompts, imágenes, auditoría, hechos financieros ni configuraciones existentes. Se aplica mediante db:deploy en el despliegue.

QA usa una base temporal exclusiva, transportes OpenAI/Meta sintéticos y seis afiches locales. Se comprueban UI, permisos, idempotencia, muestra inicial, presupuesto, dos conjuntos, pausa/activación, rechazo de imagen cambiada y pérdida de acuse. No se ejecuta generación ni publicidad con cargo real.
