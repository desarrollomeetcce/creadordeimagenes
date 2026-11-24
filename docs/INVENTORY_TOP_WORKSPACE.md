# Top por países dentro de Inventario

La aclaración posterior del23/11/2026 sustituye el selector de un solo país por columnas simultáneas. Top sigue siendo una vista del mismo inventario: reutiliza catálogo, activación, tareas y APIs existentes. Los diálogos de Top de grupos conservan su presentación anterior.

Cada columna corresponde a una hoja real y país ISO, sin mezclar fuentes aunque compartan el nombre del país. El encabezado muestra el país; una etiqueta adicional distingue la hoja cuando hace falta. La presentación compacta deja solo el nombre y el control de activación/tareas en cada fila. La ficha flotante, accesible al pasar el mouse, enfocar con teclado o tocar el nombre, muestra las fechas reales del último período, días activos, ventas del ciclo y Ver detalle. Se puede recorrer la ficha sin que se cierre al pasar desde el nombre, y se descarta con Escape, botón de cierre o clic fuera. Se abre en la capa superior del navegador para evitar recortes en las columnas. Los desconocidos no se convierten en0ni en fechas inventadas. El cierre se expone como activeUntil a partir del período ya calculado por el informe; no se añade una consulta histórica por tarjeta. Las fechas se presentan según Lima y las ventas conservan la política canónica de pagos posteriores al apagado hasta el siguiente ciclo.

En cada país aparecen activos/pendientes, Activar otro diplomado y desactivados con asignación real en gris. El catálogo sin asignación sigue disponible para altas, sin inventar historial. Se dibujan25tarjetas iniciales por sección con opción de mostrar más, sin recortar los cálculos del informe.

Agregar país permite mostrar columnas disponibles u abrir el diálogo existente para otra hoja/país. Quitar una columna cambia solo la vista, no elimina datos. El orden se modifica con arrastre, flechas o Alt+flechas; columnas visibles y orden se recuerdan por usuario/lista en el navegador.

Reemplazar y Ver detalle están en el mismo menú azul de activación. Ver detalle también está en la ficha flotante; abre la evaluación completa existente. Se reutiliza la revisión existente de candidatos y el POST replace-batch atómico: anterior STOP, nuevo CREATE, únicamente en la hoja/país elegidos, con targets/revisiones actuales y las validaciones de catálogo/permisos. No hay publicaciones, pausas Meta ni generación IA al ordenar o reemplazar de esta forma. Desactivar conserva la confirmación previa y la elección de fijar. Los antecedentes y el detalle se cargan solo al abrirlos.

## Consultas

El tablero comparte una evaluación entre las columnas visibles. Se deduplican los IDs de hoja y se solicitan en lotes secuenciales de hasta20, conforme al límite existente del endpoint. El estado canEdit de la respuesta también protege los controles. No se introducen caches globales de cifras ni permisos.

La clave de lectura ordena los IDs, por lo que reordenar columnas no consulta ni escribe. Buscar y filtrar son locales. Volver a mostrar una fuente todavía consultada usa el estado actual del hook. Después de una mutación se invalida únicamente su hoja en el tablero; la evaluación general oculta de Inventario no consulta y queda invalidada para actualizarse al regresar.

## Verificación

390 pruebas generales, TypeScript y compilación. La integración delivery_qa comprueba activeUntil con cierre real del10/11/2026 y un reemplazo en AR: EC conserva estados/eventos/filas/ventas idénticos; el candidato aparece una sola vez.

Chromium con API/DB reales sintéticos muestra AR, EC y BO desde una consulta agrupada; comprueba fechas, arrastre y flechas, ocultar/mostrar sin otra consulta, reemplazo AR con una sola escritura y refresco exclusivo de su hoja, orden conservado tras recargar y vista390px, con0errores JS. No hubo llamadas Meta/IA reales. Publicar main no acredita despliegue o modificación de datos del VPS.

## Presentación compacta

Se retira la franja Top por país. Pestañas, búsqueda, categoría, evaluación (últimos siete días por defecto), agregar país y actualizar comparten la barra superior, únicamente en Top. Se compactan los encabezados y las filas para comparar más diplomados en una laptop. La leyenda general pequeña corresponde al CAC con presupuesto del período evaluado: Normal, Revisar, Grave, Crítico, Bajo gasto aún y Datos pendientes. El borde y fondo sutil usan exactamente cac.budget.assessment (o assessment del informe cuando no hay cac), sin cálculos ni umbrales nuevos; PENDING no se presenta como Normal. Los desactivados conservan el fondo gris. Abrir la ficha no consulta; abrir el detalle completo conserva su lectura autorizada existente.

El tablero no impone un tope vertical a las columnas. La tabla principal de Asesores también elimina el límite anterior de 65vh: conserva el ancho de las columnas y el desplazamiento horizontal, pero permite usar la altura de la página. No se cambian los límites de los diálogos de detalle.

Verificación compacta: Chromium con tres países y 12 activos por país en 1366×768, filas de 34px; los 12 entran antes del borde inferior de la pantalla. Se comprueban hover sin lecturas, foco/Escape, ficha en 390×844, detalle desde ficha y menú, reemplazo y ausencia de filtros Top al regresar a Inventario. Los flotantes no se abren encima de detalles, menús o modales existentes. Respuestas sintéticas de estados financieros verifican seis colores y precedencia de CAC budget sobre assessment. Asesores con 14 filas tiene max-height none y contenido completo sin barra vertical interna. 390 pruebas y compilación/TypeScript pasan.

## Barra, color y selector por categorías · 24/11

La barra visible está encima de los países, permanece accesible al desplazar la página y reutiliza SheetHorizontalNavigation: deslizador, flechas, Home/End en el deslizador y flechas en la región. Desaparece cuando todos los países caben. Moverla no consulta datos ni escribe preferencias de negocio.

El borde de cada diplomado tiene cuatro píxeles y toma el estado canónico del CAC con presupuesto para el período seleccionado, con los mismos colores de la leyenda. Los datos pendientes conservan gris. Las pruebas cambian de siete a treinta días con respuestas financieras sintéticas para verificar que cambian los bordes y que la evaluación del período actual prevalece sobre otro assessment contradictorio.

El catálogo normalizado, las categorías, los candidatos y el orden por país se calculan al cambiar sus fuentes. La búsqueda usa useDeferredValue y filtra IDs sobre ese orden, sin repetir normalización por país ni ordenar en cada tecla; los importes y permisos siguen viniendo del informe autorizado. No se añade un caché financiero global ni se omiten refrescos después de mutar.

Activar otro diplomado conserva un único botón. Su ventana ofrece Lista y Categorías. Lista busca palabras del nombre del diplomado; Categorías busca el nombre de la categoría principal y muestra sus cabeceras ampliables, con los diplomados debajo. Buscar una categoría abre los grupos coincidentes; se pueden volver a contraer. Sin categoría principal conserva candidatos sin clasificación. Un diplomado con varias categorías aparece en cada una. Solo se agrupa al abrir la ventana; las listas abiertas dibujan 25 elementos y ofrecen Mostrar más. Abrir, escribir, cambiar vista o desplegar no hace consultas ni activa nada.

Una selección explícita usa el PATCH existente de activación, para la hoja y país actuales, con validación de candidatos, targets y revisión en servidor. La ventana bloquea dobles clics mientras espera y conserva el error si falla. Después de guardar, el activado sale de candidatos de ese país. No modifica otros países ni publica una campaña Meta.

La verificación de los registros reales sigue pendiente: el acceso al dominio de la plataforma fue rechazado por el proxy del entorno (CONNECT403) y no hay conexión al servidor/base de producción. Las lecturas del conector de Meta no dan acceso al vínculo canónico de Inventario/Ventas de esa instalación. Las pruebas sintéticas y publicar main no acreditan cambios de esos registros.
