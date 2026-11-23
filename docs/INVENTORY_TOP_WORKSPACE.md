# Top por países dentro de Inventario

La aclaración posterior del23/11/2026 sustituye el selector de un solo país por columnas simultáneas. Top sigue siendo una vista del mismo inventario: reutiliza catálogo, activación, tareas y APIs existentes. Los diálogos de Top de grupos conservan su presentación anterior.

Cada columna corresponde a una hoja real y país ISO, sin mezclar fuentes aunque compartan el nombre del país. El encabezado muestra el país; una etiqueta adicional distingue la hoja cuando hace falta. Sus tarjetas incluyen nombre del diplomado, activación/tareas, fechas reales del último período, días activos, ventas del ciclo y acciones. Los desconocidos no se convierten en0ni en fechas inventadas. El cierre se expone como activeUntil a partir del período ya calculado por el informe; no se añade una consulta histórica por tarjeta. Las fechas se presentan según Lima y las ventas conservan la política canónica de pagos posteriores al apagado hasta el siguiente ciclo.

En cada país aparecen activos/pendientes, Activar otro diplomado y desactivados con asignación real en gris. El catálogo sin asignación sigue disponible para altas, sin inventar historial. Se dibujan25tarjetas iniciales por sección con opción de mostrar más, sin recortar los cálculos del informe.

Agregar país permite mostrar columnas disponibles u abrir el diálogo existente para otra hoja/país. Quitar una columna cambia solo la vista, no elimina datos. El orden se modifica con arrastre, flechas o Alt+flechas; columnas visibles y orden se recuerdan por usuario/lista en el navegador.

Reemplazar está en el botón azul de la tarjeta y en el menú de activación. Se reutiliza la revisión existente de candidatos y el POST replace-batch atómico: anterior STOP, nuevo CREATE, únicamente en la hoja/país elegidos, con targets/revisiones actuales y las validaciones de catálogo/permisos. No hay publicaciones, pausas Meta ni generación IA al ordenar o reemplazar de esta forma. Desactivar conserva la confirmación previa y la elección de fijar. Los antecedentes y el detalle se cargan solo al abrirlos.

## Consultas

El tablero comparte una evaluación entre las columnas visibles. Se deduplican los IDs de hoja y se solicitan en lotes secuenciales de hasta20, conforme al límite existente del endpoint. El estado canEdit de la respuesta también protege los controles. No se introducen caches globales de cifras ni permisos.

La clave de lectura ordena los IDs, por lo que reordenar columnas no consulta ni escribe. Buscar y filtrar son locales. Volver a mostrar una fuente todavía consultada usa el estado actual del hook. Después de una mutación se invalida únicamente su hoja en el tablero; la evaluación general oculta de Inventario no consulta y queda invalidada para actualizarse al regresar.

## Verificación

390 pruebas generales, TypeScript y compilación. La integración delivery_qa comprueba activeUntil con cierre real del10/11/2026 y un reemplazo en AR: EC conserva estados/eventos/filas/ventas idénticos; el candidato aparece una sola vez.

Chromium con API/DB reales sintéticos muestra AR, EC y BO desde una consulta agrupada; comprueba fechas, arrastre y flechas, ocultar/mostrar sin otra consulta, reemplazo AR con una sola escritura y refresco exclusivo de su hoja, orden conservado tras recargar y vista390px, con0errores JS. No hubo llamadas Meta/IA reales. Publicar main no acredita despliegue o modificación de datos del VPS.
