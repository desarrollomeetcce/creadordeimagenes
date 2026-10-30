# Revisión de pedidos de Inventario, hojas y Top · 30/10/2026

Se contrastaron los pedidos de la conversación con las rutas, componentes, pruebas y publicaciones registradas. No se considera recuperado el historial que una versión anterior ya eliminó: esa recuperación requiere registros o una copia disponible.

| Pedido | Resultado comprobado |
| --- | --- |
| Ocultar columnas/hojas con − y recuperarlas desde Ver parámetros | Implementado; preferencia visual, no elimina datos. |
| Fijar columnas y reducir/ampliar con mouse | Implementado con resizer compartido; Estado, País y Moneda sin mínimos rígidos antiguos. |
| Iconos encima de títulos, sin tapar País/Asesor/Moneda/Estado | Corregido; tres verificaciones Chromium de cabeceras, temas y móvil en publicación anterior. |
| Buscar y Agregar juntos y pequeños, sin una franja Ver columnas | Implementado en hoja financiera. |
| Agregar varios diplomados desde hoja, sin duplicados | Ruta HTTP corregida para catalogRevision/existingOnly; prueba real de Agregar20 y repetir mantiene20. |
| Hoja real con uno o varios países, activación sin volver a indicar país | Implementado por hojaID+ISO; permiso y país se validan en servidor. |
| FX y límites editables: 0V/S25; nV/S50×n | Implementado; personalizaciones por cantidad de ventas, porcentaje y alerta desde100%. Días no multiplican el factor. |
| Días y presupuesto solo durante activación | Implementado por intervalos registrados, sin inventar inicios ni atribución horaria. |
| Ventas desde activación incluyendo pagos después del apagado | **Pendiente detectado y corregido en esta revisión.** Cada ciclo incluye ventas desde su inicio hasta el día previo a la siguiente activación o hasta hoy; presupuesto/días permanecen limitados al tramo activo. |
| Semáforo con punto y texto, ausencia no equivale a cero | Implementado; desconocidos/parciales pendientes. |
| Activo / Por hacer campaña / Por desactivar / Desactivado | Implementado; azul/derecha, violeta, naranja/izquierda y gris/izquierda respectivamente. PendienteSTOP no modifica Meta ni apaga el estado real. |
| Desactivar y fijar / Solo desactivar / Cancelar | Se conserva confirmación; apagado fijado permanece en hoja e inventario, fuera del Top. |
| Top independiente por país, activos→por hacer→por desactivar | Implementado, con indicadores compactos, mantener/reemplazar/detalle/ir a hoja. |
| Reemplazo anteriorSTOP y nuevoCREATE | Guardado atómico, país y revisiones vigentes, sin tocar otros países/grupos. |
| Check por fila/bloque, reemplazar varios, contador y edición de propuesta | Implementado; manual/azar misma u otras categorías, candidatos únicos, confirmar lote completo. Conflicto tardío revierte todo. |
| Selección/editado de grupos con tablas compactas y ajustables | Implementado; V/D/Observaciones por fuente elegida, categorías como filtros y datos secundarios. |
| Maximizar/restaurar ventanas | Implementado en gestión de grupos/Top, reemplazo desde hoja, historial, antecedentes; detalle nativo conserva Ampliar. |
| Ver detalle igual al de cada hoja | EffectivenessHistory completo: estadísticas, histórico diario, fechas de ventas, ventas por asesor y activaciones. |
| Ir a hoja completa, nueva pestaña, solo resaltar diplomado | Implementado mediante periodFocus; sin filtrar a un solo diplomado ni marcar su checkbox. |
| Ordenar análisis por ventas y reemplazar desde esa vista | Implementado con flechas en indicadores y mismo reemplazo por país. |
| Ordenar Activación/FX/Estado, no pin/minimizar en esas subcolumnas | Implementado con restauración del orden y datos desconocidos al final. |
| Filtros de historial, nunca usado, prueba corta y usado | Implementado con eventos y duración registrada; quitar hoja conserva historia e identidad. |
| Meta: primero inventarios de tabla y luego catálogo completo | Implementado con secciones, búsqueda y escritura; añade/reutiliza misma fila al vincular. |
| Meta: asesor+moneda+país en un guardado, estado inicial y no duplicación | Implementado; ACTIVE importado resuelve CREATE, sin sincronizar continuamente ni escribir en Meta. |
| Franja Por asignar, pendientes por hacer primero, completos al orden normal | Implementado sin duplicar; hoja e inventario comparten estado por alias+país. |
| Antecedentes antes de reemplazar y comparación por país | Implementado por hoja-país: ventas/días/P/GMeta/FX/FXMeta, fechas y períodos; GMeta usa gasto original recibido, nunca G manual. |
| Detalle permanente aunque apagado/desfijado/desvinculado | Implementado; permisos de fuente vigentes. No reconstruye datos anteriormente borrados. |

## Evidencia de esta revisión

- 214 pruebas unitarias y 36 de integración, sin fallos; typecheck y build correctos.
- Caso nuevo: ventas5 después de apagar se mantienen, P50 y2días no incluyen presupuesto de días apagados; al reactivar se dividen en1+4 sin duplicarse. Ausencias siguen pendientes y se respetan límites personalizados.
- Chromium adicional: campaña cerrada ayer muestra5ventas recibidas hoy, presupuesto10,1día activo yFX4%; «Ventas hasta» visible y detalle completo accesible apagado.
- Evidencia UX previa:20altas en un guardado y repetición sin duplicados; reemplazo múltiple manual/azar editable, contador, unPOST, columnas ajustables/maximizar; cabeceras arriba en temas claro/oscuro y móvil.
- Base exclusiva sintética, fixtures retiradas; sin llamadas facturables Meta/IA/SMTP.

Las cifras financieras son diarias. Si dos activaciones comparten un día, faltan datos o no se registró el inicio, no se afirma una atribución exacta por hora: el estado queda pendiente. Se muestran hasta366días de métricas y100períodos por país; las fechas históricas registradas permanecen.

## Pedido adicional: contadores visibles

Añadido acumulado general encima de las estadísticas del detalle: ventas, días activos con horas, presupuesto y gasto original de Meta, en cuatro recuadros de colores suaves. Todo el historial registrado, sin depender del rango del gráfico; P/Meta solamente días activos y cada fecha una vez. Pruebas adicionales validan ausencia/zero/FX, intervalos repetidos y separar gasto manual del original de Meta. En móvil se distribuyen en dos columnas. No cambia el historial ni las campañas.

## Pedido adicional: cabecera fija y mover ventanas

Meta asignar inventario conserva nombre de campaña visible y formulario con desplazamiento interno. Ventana más amplia y redimensionable desde esquina. Soporte común de arrastre desde cabecera en ventanas nativas con título de otras secciones; mantiene selección, acciones, ampliar/restaurar, teclado y límites de pantalla. Ocho verificaciones de navegador incluyen Meta, grupos y detalle financiero, resize real y móvil. Los controles de formulario y los menús conservan su interacción normal.

## Corrección posterior: coherencia de hoja y conservación real

Se detectó una eliminación destructiva en la ruta de filas financieras: ya se reemplazó por baja lógica con evento de retiro y conservación de días, ventas, asesores y ciclos. Apagar en hoja conserva la fila y la fija en Inventario; quitar pin apagado oculta y elimina el chip de hoja si no queda país visible. Reincorporación conserva identidad y ventas. Datos de Perú/Ecuador permanecen independientes. Los retiros antiguos con datos ya destruidos se reconocen por auditoría y se muestran como no disponibles, sin inventar recuperación ni un inicio de activación.

Tabla a pantalla completa mantiene DOM/datos/scroll, controles flotantes y navegación real de hojas, manual/automático y calendario solo dentro de ampliación. Ancho común de métricas en ambas vistas, separadores de metadatos individuales y cabecera más compacta. Chromium verifica6 escenarios de ventana y4 de bajas, con25 pruebas enfocadas de servidor,214 unitarias y compilación/tipos.

Regresión adicional del mismo cambio:26 pruebas de asignación Meta/selección/categorías aprobadas;51 pruebas de integración en total, sin fallos.
