# Ventas: activación, tareas y orden

Las tareas del asesor se guardan por inventario/diplomado y país, separadas del booleano de activación. CREATE, STOP, FLOW y SYNC representan Por hacer campaña, Por desactivar, Por hacer flujo y Por sincronizar. NONE indica que no hay pendiente. No se crea ninguna automatización por marcar FLOW ni se consulta/escribe Meta al ordenar o marcar tareas.

## Presentación

El selector Ordenar por queda junto a Eliminar seleccionadas. El orden predeterminado pone SYNC, FLOW, CREATE, STOP, activados sin pendientes y desactivados sin pendientes. Conserva franjas por categoría para las filas normales. Por asesor, esa prioridad se repite dentro de cada asesor y los desactivados sin pendientes tienen su franja Desactivados · Nombre. Un diplomado inactivo con una tarea sigue visible en el grupo de esa tarea.

Los órdenes explícitos por ventas y activación no aplican las franjas de prioridad: ventas suma V de las fechas visibles usando el resumen canónico, N/A no suma y un valor desconocido no se inventa como cero. Activados primero es el orden de estado habitual; Desactivados primero lo invierte. El período largo conserva su paginación de fechas y las acciones se aplican a su ventana visible. Se conservan también los ordenadores de las columnas.

El fijado sigue existiendo solo como control de permanencia de fila. No hay una etiqueta Fijado en Ventas y fijar no equivale a activar ni mantiene la fila entre las activadas. No se eliminan valores, asesores, monedas ni referencias por ordenar.

Colores: FLOW fucsia #dc2787, CREATE morado #9463dc, STOP naranja #e89526, SYNC turquesa #008f92. Las etiquetas y descripciones accesibles acompañan los colores. El estado real y la tarea se anuncian por separado. El menú permite quitar el pendiente expresamente.

## Integración con Meta

Las activaciones y pausas confirmadas en el módulo Meta Ads actualizan el booleano interno sin borrar la tarea existente. La sincronización normal también concilia un ACTIVE recibido realmente y las pausas confirmadas de todas las campañas vinculadas, sin nuevos Graph GET, marcadores de posición ni campañas inventadas. Si hay campañas desconocidas/activas, no inferir que el diplomado quedó apagado. Se conserva revisión de conexión, lease, permisos, bloqueo884411 y defensa ante lecturas anteriores a cambios manuales.

Solo se modifica la fila visible ya vinculada por alias y país. Las filas retiradas/ocultas no se resucitan. Un ACTIVE confirmado puede activar una fila que estaba desactivada, conservando CREATE/FLOW/STOP/SYNC. Un cambio solo de tarea no publica anuncios ni altera Meta. El botón Flujo de Meta Ads usa el permiso actual de edición del módulo y el grant financiero del inventario, con revisión del estado y tarea esperada; no exige ni utiliza una escritura publicitaria.

Una campaña sin alias/país aparece Por sincronizar en Meta Ads. Para ubicarla en una fila de Ventas hay que vincularla al diplomado y país reales mediante la sincronización existente. No se asigna un diplomado por semejanza de nombre, no se crea un inventario automático por ese aviso y no se simula una activación en una hoja desconocida.

CREATE ya no fuerza la activación de una hoja: puede existir un pendiente de campaña con activación falsa y permanencia de fila. No se reescriben masivamente los booleanos históricos por interpretar su tarea. Las tareas no se borran por observar una pausa; Quitarlas es una decisión explícita del usuario.

## Proyectos

La tercera columna consulta el WhatsApp de la página seleccionada. Ahora muestra el número recuperado o un aviso cuando no pudo consultarlo. Es una consulta opcional: no se inventa el número ni se añade un editor manual; Meta puede usar el predeterminado si lo permite. Las plantillas de conversación guardadas en esta plataforma no son una importación de toda la biblioteca del Administrador de Anuncios ni de plantillas WABA aprobadas.

## Validación y despliegue

Pruebas de prioridad, asesores, categorías, conservación de filas, suma del período, valores ausentes/N/A y estados inversos. Integración PostgreSQL sintética: activación/pausa conservando las cuatro tareas, una sola fila, importes y países intactos, escrituras locales de FLOW con control de revisión, propietario suspendido y cero fetch externo. Navegador con dos asesores y doce filas: prioridades, orden por asesor, ventas, estado inverso, colores distintos y ausencia de etiqueta Fijado. Compilación y TypeScript.

No hay una migración de esquema nueva: las tareas se guardan en el control JSON existente. Publicar main no acredita que el VPS ya esté desplegado ni que se hayan sincronizado cuentas reales.
