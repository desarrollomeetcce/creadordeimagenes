# Países en Totales de Ventas

El encabezado Argentina corresponde a una hoja fuente. Su informe podía incluir también grupos configurados de México y Paraguay sin ningún dato. La vista Todos mostraba esos grupos vacíos junto a AR, haciendo parecer que pertenecían a Argentina.

En Todos, una fuente con países que contienen datos en la moneda visible omite sus grupos confirmados vacíos (`hasData=false`) si tampoco tienen valores ni ediciones manuales. No se deduce el país por el nombre de la hoja ni se mueve, borra o combina ninguna cifra. Bolivia y los demás grupos con registros se conservan. Un cero es un dato; N.A. explícito y metadatos desconocidos tampoco se eliminan. La selección explícita de país conserva su plantilla editable, y una moneda sin registros mantiene sus propias plantillas.

Solo cambia la selección de columnas en el navegador; la API, permisos, cálculos y registros quedan intactos. La reducción de bloques actualiza también colgroup, encabezados, celdas y enlaces de detalle mediante el modelo existente.

Verificado el19/11/2026 con381 pruebas y compilación. Chromium muestra AR y BO en Todos con encabezados de8columnas cada uno; permite seleccionar MX y al volver a Todos retira MX/PY vacíos. Cero escrituras o errores del navegador. Los informes de la prueba son sintéticos: no prueban la configuración de la cuenta productiva ni el despliegue del VPS.
