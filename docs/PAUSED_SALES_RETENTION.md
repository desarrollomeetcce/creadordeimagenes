> Actualización 24/11: una pausa confirmada completa «Por desactivar campaña» (STOP→NONE). El diplomado permanece en Inventario y Ventas, inactivo y retenido, con la presentación gris existente. Sustituye exclusivamente la conservación de STOP al pausar descrita en la actualización anterior.

> Actualización 17/11: la presentación y las tareas siguen [SALES_TASK_ORDER.md](SALES_TASK_ORDER.md). Ya no se muestra Fijado ni se ordena un inactivo como activo por estar fijado. Las activaciones confirmadas también se reflejan y las tareas se conservan al activar/pausar. Las reglas anteriores de conservar la posición entre activos, bloquear CREATE o evitar toda reactivación quedan sustituidas.

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

## Completar el pendiente de desactivación

El recibo confirmado del módulo Meta Ads y la conciliación de metadatos comparten confirmedCampaignTask. Si todas las campañas vinculadas alias+país están apagadas, active=false y STOP pasa a NONE. Mientras quede alguna activa o desconocida, el pendiente permanece. Activar no completa STOP. CREATE, FLOW y SYNC no se consideran tareas resueltas por pausar una campaña.

Una nueva observación válida también corrige una fila ya inactiva y fijada cuyo STOP quedó pendiente por la lógica anterior. No se ejecuta un barrido sin confirmación ni una migración de datos históricos; se conservan las defensas de observación actual, eventos más nuevos, filas visibles y vinculación. Las filas inactivas desfijadas o retiradas no se hacen reaparecer. La corrección registra la revisión y el evento con priorActive=false, por lo que no añade otro período activo ni cambia su cierre.

La integración sintética verifica STOP→NONE en pausa manual y sincronizada, espera de otras campañas, saneamiento repetible de STOP antiguo, conservación exacta de períodos y ventas, respuestas reales de Inventario y Ventas, clasificación inactiva de Top, otros países, filas retiradas y cero llamadas externas.
