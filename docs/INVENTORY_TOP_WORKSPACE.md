# Top dentro de Inventario

Top es una vista del mismo inventario, junto a la pestaña Inventario. Reutiliza el catálogo, la activación interna, la evaluación y las acciones existentes; no crea un segundo catálogo ni un nuevo estado publicitario.

Muestra activos y pendientes primero, una fila buscable «Activar otro diplomado» y después las filas desactivadas que tienen una asignación real. Los ítems sin asignación siguen disponibles como candidatos, sin inventar activaciones ni historial. Las tareas pendientes se mantienen arriba aunque el booleano de activación sea falso. Las filas inactivas no participan en el reemplazo múltiple de activos.

Seleccionar un candidato utiliza PATCH inventory/sheet-activation con nombre, hoja real, país y targets/revisiones del informe actual. Conserva las comprobaciones de catálogo, permisos, revisión y transacción de la API existente. Desactivar conserva la confirmación previa y la opción de fijar. Es activación interna de Inventario; no ejecuta escrituras de campañas ni generaciones de IA.

La vista y su última columna se recuerdan por usuario e inventario. El código del Top se carga al abrirlo; el catálogo y directorio ya recibidos se reutilizan. Mientras Top está abierto, la evaluación general oculta del inventario no consulta. Top pide solo la hoja y el país elegidos, con un rango acotado y la política de actualización existente. Buscar y filtrar se realiza localmente; el país integra la clave del estado/caché del hook, evitando reutilizar un informe de otro país. No hay caché global nueva de cifras ni permisos. Una mutación relee su evaluación y los datos canónicos necesarios.

No hay migración: se guardan únicamente preferencias visuales personales y se usan los registros existentes para activar. El Top operativo de los diálogos de grupos conserva su comportamiento previo.

La evaluación oculta se invalida después de guardar para que Inventario muestre los cambios al volver. El menú compartido de activación ajusta su posición a su altura real y limita su alto al viewport.

Verificación23/11/2026:382 pruebas generales, compilación/TypeScript y navegador con HTTP/DB sintéticos reales. Se activó un candidato sin asignación previa, se confirmó su desactivación/fijado, se comprobó el orden antes/después, el cambio de pestañas y la vista390px, sin errores de JavaScript. Buscar no emitió solicitudes; el informe del Top se limitó a una tabla y PE. La red externa estuvo bloqueada. Publicar main no demuestra despliegue productivo.
