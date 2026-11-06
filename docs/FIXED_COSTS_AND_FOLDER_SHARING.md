# Costos fijos y acceso a carpetas · 06/11/2026

## Costos fijos

Módulo independiente `?view=fixed-costs`. Todo OWNER aprobado tiene acceso. Ningún otro rol recibe acceso por ser administrador, por compartir Ventas/Meta o por pertenecer a un proyecto. Compartir concede Consulta o Edición a una cuenta aprobada concreta; Observador solo Consulta. Los permisos se revalidan en servidor y bajo bloqueo antes de escribir. Retirar un permiso no borra registros. Las llamadas de este módulo no usan IA ni Meta.

La primera apertura no escribe datos. «Preparar hojas sugeridas» crea explícitamente Personal, Propiedades, Tecnología, Personales, Impuestos y Variables; no crea gastos. Las hojas admiten creación y cambio de nombre. Solo se pueden eliminar vacías. Las categorías se escriben libremente por gasto. País, lugar y persona permiten distinguir personal de Colombia/Perú, servicios de Tumbes/Cieneguilla, impuestos, streaming y tecnología sin mezclar dimensiones.

Tabla editable de 50 filas por página, con mes/hoja/país/categoría/tipo/pago. Cada registro incluye fecha, concepto, categoría, país, lugar, persona, importe, código de moneda, Fijo/Variable, Pagado y nota. «Gasto del día» propone Variable/Pagado; «Gasto fijo» propone Fijo/Pendiente. Fecha actual de Lima. No se inventan importes ni se consulta un tipo de cambio. Importes decimales exactos de dos posiciones, totales DB por moneda y cálculo de presentación en enteros; Registrado = Fijos + Variables y Pendiente = Registrado − Pagado. Marcar pagado modifica la misma fila y no añade un segundo gasto. Los resúmenes abarcan todas las páginas del filtro, no solo las 50 visibles.

«Traer fijos del mes anterior» requiere acción y confirmación inline. Copia exclusivamente Fijos de todas las hojas, conserva serie, reinicia Pagado=false y ajusta el día al último válido del mes destino. Único serie/mes evita duplicaciones al repetir o perder una respuesta. No hay generación mensual automática ni cambios retroactivos en meses anteriores. La edición de filas usa versión para detectar ventanas obsoletas; alta usa requestId reutilizado en reintento. GET no crea hojas ni registros. Compartir no envía correos.

## Biblioteca

Compartir disponible en tarjetas, carpeta abierta y menú contextual para Proyecto, Producto/país, Subproducto/diplomado y Carpeta personal. OWNER ve y administra todos los accesos, incluidas carpetas creadas por ADMIN. Un creador no OWNER administra únicamente su proyecto o los hijos cuya creación está registrada; compartir el contenido no convierte al receptor en administrador de permisos. Categorías/subproductos antiguos conservan el propietario del proyecto como administrador; no se deduce creador histórico.

Acceso a usuarios concretos o «Todos los usuarios · actuales y futuros», por defecto desactivado. La concesión superior se hereda por contenido y descendientes futuros sin copiar listas de usuarios. Las concesiones específicas no se borran al desactivar un grupo. OWNER conserva acceso por rol. Las restricciones de cuenta, módulo y Observador permanecen. Un permiso de hijo muestra sus padres para navegar, sin conceder acceso completo a sus hermanos o al contenido privado del padre.

Las carpetas personales heredan por su parentesco físico o ancla nativa con acceso completo. La organización visual privada no cambia permisos. Compartir una carpeta personal concede lectura de sus archivos; no de prompts, diseños, versiones, claves o costes privados de los proyectos originales. Las imágenes compartidas se validan contra los derechos actuales de la cuenta que las colocó, vigencia del archivo y revisión; perder el acceso de origen elimina esa delegación. Solo el endpoint de bytes/miniatura y selección explícita ZIP admiten delegación; diseño/edición/historial conservan la autorización de origen. El ZIP delegado no usa nombres de proyectos privados. Los documentos conservan autorización de carpeta/destino actual, incluso al buscar. OWNER conserva el acceso global de Biblioteca. No se comparten pruebas de conexión con otros roles.

## Datos y despliegue

Migraciones aditivas `202611060002_folder_sharing` y `202611060003_fixed_costs`. Compose ejecuta migraciones antes de aplicación/worker. No se modifica publicidad, cuentas Meta, importes de Ventas ni datos históricos financieros. Pruebas en BD sintética exclusiva; compilación no acredita despliegue ni migraciones en Hostinger.

## Auditoría visual

Miniaturas independientes en WebP, máximo 64 KiB, plazo predeterminado de 30 días desde la creación de cada versión. La política OWNER puede cambiar el plazo. La caducidad impide mostrarlas; limpieza elimina los bytes. Eliminar la miniatura conserva el original y el registro de actividad. Abrir Auditoría no crea copias nuevas. Estas reglas no se modifican en esta entrega.
