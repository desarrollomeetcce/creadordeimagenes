# Rendimiento de generación en Proyectos

## Cambios

El worker persistente ejecutaba sincronización de Meta y mantenimiento antes de buscar la siguiente imagen. Ahora cada tarea auxiliar tiene ejecución independiente y no se solapa consigo misma. Meta se revisa con un mínimo de 15 segundos entre inicios; mantenimiento mantiene cinco minutos. Los servicios conservan sus comprobaciones de permisos, leases, revisiones, cuotas, esperas y estado durable. Un error de estas tareas no detiene el procesamiento de imágenes.

La cola ya no agrega 1.5 segundos de espera después de procesar una imagen. Conserva esa espera si está vacía o bloqueada. Las solicitudes de imagen siguen siendo secuenciales según los controles actuales: no se aumenta concurrencia ni se repiten solicitudes de resultado incierto. Las órdenes gestionadas por Workflow conservan su ejecución durable y sus esperas por trabajo ocupado.

Las referencias se cargaban dos veces, para composición y para la solicitud al proveedor. Se leen una vez por ruta dentro de cada trabajo y se reutilizan los mismos bytes. El máximo de nueve referencias se valida antes de esas lecturas. No existe caché entre trabajos ni usuarios; la resolución autorizada de referencias y la comprobación de permisos siguen vigentes.

El escaneo de pendientes de una orden reutiliza la consulta de aprobación de muestra por actor y grupo únicamente durante ese escaneo. Un lote de 199 pendientes del mismo grupo pasa de hasta 199 consultas de aprobación a una. Cada nueva revisión vuelve a consultar el estado real; la transacción de claim vuelve a validar aprobación antes del despacho.

## Verificación

- Suite de 374 pruebas, incluidas pruebas de tarea Meta detenida, independencia/cadencia de mantenimiento, ausencia de solapamiento, lecturas únicas y aislamiento de referencias, y aprobación por grupo/actor.
- Integración con PostgreSQL sintético local: orden con 199 pendientes pasa a REVIEW sin llamar proveedores; aprobación habilita el primer pendiente, revocación o eliminación de la muestra lo bloquea de nuevo. Cero fetch y cero reservas nuevas.
- Compilación de producción y TypeScript.

No se cambia modelo, calidad, resolución, nivel creativo ni generación ya autorizada. Estos resultados verifican trabajo local eliminado, no una velocidad medida con proveedores reales. El tiempo de generación del modelo sigue dependiendo de su API, tamaño, referencias y carga.

## Publicación

No hay migración de datos. Desplegar el código y reiniciar el worker del servidor para aplicar el aislamiento de tareas y el nuevo ritmo de cola. El despliegue web aplica la mejora de escaneo a las órdenes Workflow y la lectura única a ejecuciones web. Una publicación en main no acredita despliegue ni reinicio en el VPS.
