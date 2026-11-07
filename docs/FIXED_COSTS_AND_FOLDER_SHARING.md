# Costos fijos y acceso a carpetas · 06/11/2026

## Costos fijos

Módulo independiente `?view=fixed-costs`. Todo OWNER aprobado tiene acceso. Ningún otro rol recibe acceso por ser administrador, por compartir Ventas/Meta o por pertenecer a un proyecto. Compartir concede Consulta o Edición a una cuenta aprobada concreta; Observador solo Consulta. Los permisos se revalidan en servidor y bajo bloqueo antes de escribir. Retirar un permiso no borra registros. Las llamadas de este módulo no usan IA ni Meta.

La primera apertura no escribe datos. «Preparar hojas sugeridas» crea explícitamente Personal, Propiedades, Tecnología, Personales, Impuestos y Variables; no crea gastos. Las hojas admiten creación y cambio de nombre desde Más. Las categorías se pueden crear en el filtro o escribir al guardar filas; se conservan para otros meses. Solo se pueden eliminar vacías. Las categorías se escriben libremente por gasto. País, lugar y persona permiten distinguir personal de Colombia/Perú, servicios de Tumbes/Cieneguilla, impuestos, streaming y tecnología sin mezclar dimensiones.

Hoja compacta de 50 registros por página, con calendario de período, hojas inferiores, país, categoría y pago; edición directa, filas/columnas numeradas, pegado TSV y guardado conjunto. Cada registro incluye fecha, concepto/producto, categoría, país, lugar/propiedad, persona, cantidad entera, precio unitario, total, moneda, tipo, estado y nota. Ingresos es una vista dentro de Costos fijos; no crea otro módulo ni importa ventas de otras áreas. Gastos propone Fijo/Pendiente; Ingresos propone Variable/Cobrado. El tipo y estado se editan en sus celdas. Fecha actual de Lima. No se inventan importes ni se consulta un tipo de cambio. Importes decimales exactos de dos posiciones, totales DB por moneda y cálculo de presentación en enteros; Total = cantidad × precio unitario; el servidor calcula y limita el total en centavos exactos. El resumen distingue ingresos/gastos/saldo y cobrado/pagado por moneda, en todo el período. Marcar pagado modifica la misma fila y no añade un segundo gasto. Los resúmenes abarcan todas las páginas del filtro, no solo las 50 visibles.

«Traer fijos del mes anterior» requiere acción y confirmación inline. Copia exclusivamente gastos Fijos (EXPENSE), nunca ingresos, de todas las hojas, conserva serie, reinicia Pagado=false y ajusta el día al último válido del mes destino. Único serie/mes evita duplicaciones al repetir o perder una respuesta. No hay generación mensual automática ni cambios retroactivos en meses anteriores. La edición de filas usa versión para detectar ventanas obsoletas; alta usa requestId reutilizado en reintento. GET no crea hojas ni registros. Compartir no envía correos.

## Biblioteca

Compartir disponible en tarjetas, carpeta abierta y menú contextual para Proyecto, Producto/país, Subproducto/diplomado y Carpeta personal. OWNER ve y administra todos los accesos, incluidas carpetas creadas por ADMIN. Un creador no OWNER administra únicamente su proyecto o los hijos cuya creación está registrada; compartir el contenido no convierte al receptor en administrador de permisos. Categorías/subproductos antiguos conservan el propietario del proyecto como administrador; no se deduce creador histórico.

Acceso a usuarios concretos o «Todos los usuarios · actuales y futuros», por defecto desactivado. La concesión superior se hereda por contenido y descendientes futuros sin copiar listas de usuarios. Las concesiones específicas no se borran al desactivar un grupo. OWNER conserva acceso por rol. Las restricciones de cuenta, módulo y Observador permanecen. Un permiso de hijo muestra sus padres para navegar, sin conceder acceso completo a sus hermanos o al contenido privado del padre.

Las carpetas personales heredan por su parentesco físico o ancla nativa con acceso completo. La organización visual privada no cambia permisos. Compartir una carpeta personal concede lectura de sus archivos; no de prompts, diseños, versiones, claves o costes privados de los proyectos originales. Las imágenes compartidas se validan contra los derechos actuales de la cuenta que las colocó, vigencia del archivo y revisión; perder el acceso de origen elimina esa delegación. Solo el endpoint de bytes/miniatura y selección explícita ZIP admiten delegación; diseño/edición/historial conservan la autorización de origen. El ZIP delegado no usa nombres de proyectos privados. Los documentos conservan autorización de carpeta/destino actual, incluso al buscar. OWNER conserva el acceso global de Biblioteca. No se comparten pruebas de conexión con otros roles.

## Datos y despliegue

Migraciones aditivas `202611060002_folder_sharing` y `202611060003_fixed_costs`. Compose ejecuta migraciones antes de aplicación/worker. No se modifica publicidad, cuentas Meta, importes de Ventas ni datos históricos financieros. Pruebas en BD sintética exclusiva; compilación no acredita despliegue ni migraciones en Hostinger.

## Auditoría visual

Miniaturas independientes en WebP, máximo 64 KiB, plazo predeterminado de 30 días desde la creación de cada versión. La política OWNER puede cambiar el plazo. La caducidad impide mostrarlas; limpieza elimina los bytes. Eliminar la miniatura conserva el original y el registro de actividad. Abrir Auditoría no crea copias nuevas. Estas reglas no se modifican en esta entrega.

## Cuadrícula y compatibilidad

La fila vacía y las líneas inferiores son controles de entrada, no gastos/ingresos almacenados. No se inserta nada hasta Guardar cambios. Tab/Enter/flechas verticales navegan; Ctrl/Cmd+Enter guarda. Pegar TSV admite hasta100 filas y omite totales pegados porque se calculan. Un conflicto de versión revierte todo el lote; repetir una solicitud con contenido ya confirmado no modifica filas ni duplica nuevas. Cambiar período/hoja/filtro exige guardar o descartar pendientes. No se implementa un motor de fórmulas completo.

MetaDateRange conserva sus restricciones en Meta. Únicamente Costos permite fechas futuras para presupuestos pendientes, hasta366 días por consulta. El calendario no consulta Efectividad ni Meta al abrirse en este módulo. Migraciónaditiva202611060004 agrega tipo EXPENSE/INCOME, cantidad/precio y categorías; todos los registros anteriores conservan EXPENSE y su importe. Sin cambio de permisos.

## Libro de costos · 7 de noviembre de 2026

La tabla ocupa todo el ancho disponible junto al menú. El cuerpo de la tabla es el único desplazamiento vertical de la página; cabeceras y hojas permanecen visibles. Ítem estrecho con número y selección, Concepto, Proyecto, Unidad, País, Monto, Comisión / bono y Conversión, seguidos de moneda, moneda destino, pago, fecha, tipo y nota. Los anchos se ajustan con arrastre o teclado. Maximizar/restaurar conserva los cambios. Seleccionar filas permite preparar su estado pagado/cobrado; Guardar cambios confirma la misma operación atómica, sin crear pagos duplicados.

Asesores, Servicios, Tecnología e Impuestos se preparan como hojas vacías mediante migración aditiva; los datos y hojas anteriores se conservan. Totales es la consulta conjunta de las hojas, nunca una copia de sus registros. País, proyecto y unidad filtran también los agregados de todo el período y todas las páginas. Ingresos sigue dentro del mismo módulo y conserva cantidad × precio unitario.

Los catálogos Proyecto y Unidad se administran inline: un nombre por línea, hasta 200 por operación, con claves normalizadas sin tildes/mayúsculas/espacios repetidos. Las celdas permiten escribir para filtrar y seleccionar el nombre canónico; nombres desconocidos no se aceptan por API. Abrir o escribir en un selector filtra lo recibido, sin llamadas por tecla. El catálogo y las filas respetan los permisos actuales OWNER/VIEW/EDIT; Observador no escribe.

Comisión/bono es un importe adicional en la moneda de la fila, incluido una sola vez en el gasto y en el resumen. Conversión = (monto + bono) × tasa manual positiva, redondeada en enteros al centavo; la tasa admite seis decimales. Sin tasa para monedas distintas se muestra «—»; no se consulta ni inventa un tipo de cambio. Cambiar moneda origen o destino limpia la tasa anterior. Misma moneda equivale a factor uno. Las conversiones se presentan por fila; los totales generales mantienen monedas separadas. La migración no toca hechos de Ventas, segmentaciones ni campañas Meta.
