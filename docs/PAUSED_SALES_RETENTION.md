# Campañas desactivadas y fijadas en Ventas

Una pausa confirmada desde la plataforma conserva la fila de Ventas inactiva y fijada. Si se desactiva desde Ads Manager, el cambio se aplica al recibir el estado en la sincronización normal, la actualización enfocada o la actualización visible existentes. No se añade sondeo ni consultas a Graph.

La conciliación utiliza la vinculación canónica alias + país y filas visibles existentes. Todas las campañas vinculadas deben tener estado confirmado PAUSED, ARCHIVED o DELETED. Una campaña activa, desconocida o no devuelta bloquea la desactivación. Se usa el instante observado, sin inventar la hora exacta de una pausa externa.

Dentro del bloqueo 884411 y de la transacción autorizada se actualizan estado, fijado y revisiones, y se registra un evento META_STATUS_SYNC con el estado previo cuando existe. El propietario de la conexión debe seguir aprobado y tener rol OWNER. Los llamadores conservan sus comprobaciones de conexión, revisión y lease; las respuestas antiguas no sobreescriben estados nuevos.

No se resucitan filas ocultas o desvinculadas, ni filas ya inactivas que el usuario haya desfijado. Se respeta una tarea CREATE pendiente y un cambio manual posterior a la lectura. No se crean filas de Ventas, alias ni importes. El ID, asesor, moneda, ventas y gastos diarios se conservan.

La proyección de Ventas incluye el fijado y muestra una marca breve. Las filas inactivas fijadas conservan su categoría temporal y participan del mismo grupo de orden que las activas, evitando que una pausa las desplace al bloque de inactivas. Los filtros elegidos expresamente por el usuario siguen aplicándose. No se modifica la configuración de orden ni se activa publicidad.

## Verificación

- Pruebas unitarias: conjunto completo con pruebas de estados vinculados, orden y categorías.
- Integración aislada: tests/paused-sales.integration.test.ts; PostgreSQL local sintético delivery_qa en puerto 55439. Comprueba pausas múltiples, estados desconocidos, respuestas obsoletas, otros países, cambios manuales, tareas pendientes, filas retiradas, pausa manual y propietario suspendido. Bloquea fetch y comprueba cero llamadas externas; verifica también la respuesta real de effectiveness.
- Compilación de producción y TypeScript.

No hay migraciones nuevas. Estas pruebas no acreditan un despliegue del servidor de producción ni una actualización ya recibida de cuentas reales de Meta.
