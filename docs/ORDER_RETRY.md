# Reintentar una orden en pausa

Cuando una orden tiene imágenes FAILED/UNCERTAIN, no hay ninguna en ejecución y su estado es NEEDS_REVIEW o PAUSED, el autor u OWNER ve Reintentar generación. La tarjeta muestra En pausa. Reanudar continúa exclusivamente pendientes ya autorizadas; reintentar solicita una nueva autorización de posible consumo de API.

POST /api/orders/:id/retry exige requestId UUID, expectedVersion ISO de la orden y confirmCharge:true. La confirmación del navegador explica cuántas imágenes terminadas se conservan, cuántas no completadas se prepararán y que el intento anterior y el nuevo pueden tener cargos.

La operación usa bloqueo 728291 y fila de orden, revalida usuario, autor, acceso al recurso, configuración verificada, límite de generación y plan. Reserva nuevos trabajos únicamente para FAILED/UNCERTAIN/PENDING y conserva los IDs e imágenes COMPLETED. Los originales FAILED/UNCERTAIN y sus ledgers no se modifican ni se declaran gratuitos. Los PENDING que se sustituyen se cancelan/liberan solo si su ledger seguía RESERVED sin consumo registrado. Ante cualquier fallo, la transacción revierte todas las modificaciones.

Los nuevos snapshots conservan instrucciones, referencias, índice y grupo de aprobación originales. Usan el proveedor/modelo vigente y parámetros originales que sigan siendo compatibles; los overrides incompatibles heredan los ajustes globales verificados. No se elige otro modelo de respaldo. El vínculo retryOf y la actividad registran los intentos anteriores. Se mantiene el autor de la orden para permisos, aprobación y contabilidad.

La clave por orden/requestId/original y la versión rechazan concurrencia obsoleta. Repetir la misma solicitud devuelve el estado sin reservar ni despachar otra vez. La orden pasa por PAUSED antes de iniciar su mismo modo de ejecución; solo la solicitud nueva inicia launchOrder. Si falla el envío, se conserva la recuperación existente de ejecución incierta. Los intentos individuales de trabajos que pertenecen a órdenes se gestionan desde su orden, evitando clones huérfanos.

Este control no corrige un modelo rechazado por el proveedor ni repite llamadas automáticamente. Si el proveedor sigue rechazando los parámetros, el nuevo intento puede volver a fallar y conservará su propio diagnóstico.

## Verificación

- 364 pruebas generales: política de pausa/reintento, permisos de visualización, consentimiento explícito, normalización de overrides y conservación de referencias/aprobación.
- PostgreSQL aislado localhost:55439/delivery_qa: seis completadas más una incierta; conservación de imágenes e historial financiero, replay y dos solicitudes concurrentes, sustitución de pendientes, bloqueo de otro usuario y rollback después de liberar reservas si hay conflicto de edición. Sin llamadas externas.
- Navegador sobre servidor local de producción: cancelar no envía POST; aceptar envía uno, API devuelve 200, mantiene seis completadas y una nueva pendiente. La solicitud de ejecución se interceptó para no llamar a proveedores reales. Sin errores de JavaScript.
- Compilación de producción y TypeScript. No requiere migración de esquema; falta desplegar web/worker en el servidor real.
