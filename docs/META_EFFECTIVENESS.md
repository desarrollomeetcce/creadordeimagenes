# Efectividad: hoja por alias y país

Módulo lateral OWNER independiente de productos/subproductos del generador. Tablas lógicas con nombres editables; Diplomados inicial conserva los alias previos. La columna A tiene nombre propio editable: Diplomado, Producto, Artículo, etc. Cambiar ese encabezado no cambia el nombre de la tabla ni de los alias. Renombrar un alias mantiene su ID y cambia su nombre visible en todos los países.

## Hoja y asignación

Vista continua sin tarjeta ni márgenes centrales, filas compactas, columna de alias/país fijas horizontalmente y cabecera fija dentro de la hoja. Enter/Tab/salir guarda las celdas; Escape descarta. B/G son solo lectura; V y CF editables. Mantener borrador ante error, revisión congelada al comenzar y cola por día para guardar V/CF rápidamente sin pisarse. No hay reintentos automáticos de mutaciones.

En Meta Ads se elige primero tabla y después uno de sus alias; opciones de tablas vacías disponibles al OWNER. Administradores solo reciben metadatos de tablas con objetos autorizados. Cambiar de tabla limpia el alias preparado sin guardar nada. Una tabla vacía no permite Guardar; quitar alias es una acción explícita que limpia también el país. Asignación individual/lote conserva permiso OWNER aprobado, auditoría y lock884411; no cambia targeting ni hereda alias a hijos.

Pegar alias abre revisión para una columna de nombres o columnas nombre[TAB]país[TAB]moneda, sin encabezados. También TXT/TSV/CSV<=100KB y hasta500 filas por lote. CSV valida comillas y delimitadores fuera de ellas. País acepta código ISO o nombre español. Nombres existentes reutilizan ID; un alias ocupado en otra tabla o una fila inválida rechaza toda la importación. Nuevas filas heredan solo los defaults elegidos explícitamente en cabecera; ambos vacíos si no se eligieron. El límite del catálogo es1000 alias. Crear tabla no ejecuta DDL arbitrario.

## País y moneda

País es una etiqueta explícita para cruzar datos, nunca inferida de moneda, audiencia, cuenta o nombre. Cada fila agrupa un aliasId + país, incluso entre administradores/cuentas. Un país diferente es otra fila. País vacío no reúne campañas de países conocidos.

Las cabeceras País y Moneda permiten aplicarlos a todas las filas o vaciarlos sin botones/renglones adicionales. La edición individual puede sobrescribir esos defaults. «Todas» afecta la tabla completa, no solo el filtro visual. Si aplicar un país único colisiona con varias filas del mismo alias,409 y ningún cambio: no fusionar manuales silenciosamente. Los valores de cabecera son defaults para próximas altas; una excepción individual no cambia el default.

La moneda es **de visualización**. No filtra ni reclasifica gasto de Meta. Se suman campañas del alias/país aunque sus cuentas tengan monedas diferentes, después de convertir cada importe. Elegir USD o EUR no exige que la cuenta publicitaria use USD o EUR. Moneda vacía deja G/CF sin expresar; B/V son conteos y permanecen disponibles. CF guarda el importe y la moneda en que se escribió; cambiar presentación no reescribe ese original. V es número de ventas, no importe monetario.

## Fórmulas y fuente de tasas

Para un día d, alias a y país p:

- C = campañas autorizadas con aliasId=a AND aliasCountry=p, activas o pausadas.
- `importe_destino = importe_origen × tasa_EUR[destino,d] / tasa_EUR[origen,d]`.
- `G(d) = Σ convertir(spend(c,d), moneda_cuenta(c), moneda_fila, d)` para c∈C con diario disponible.
- `B(d) = Σ actions[onsite_conversion.messaging_conversation_started_7d](c,d)` sobre esos diarios.
- `V(d)` = ventas manuales. `CF(d)` = costos fijos manuales convertidos desde su moneda original al destino para ese día.

Se usa solo scope `7d_click,1d_view|impression`. Nunca sumar conjuntos/anuncios, totales con diarios ni dos scopes. B son conversaciones iniciadas atribuidas por Meta, no personas únicas ni conversaciones recurrentes. Ausencia de esa acción en un diario válido es cero; ausencia de diario es sin dato. — no equivale a cero; * indica menos campañas con diario que campañas etiquetadas.

Referencia pública diaria: [Currency API](https://github.com/fawazahmed0/exchange-api), endpoint fijado por fecha `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@YYYY-MM-DD/v1/currencies/eur.min.json`. Fecha del JSON debe coincidir exactamente; solo códigos fiat y coeficientes positivos/finítos. No se sustituye por hoy ni por otra fecha para completar un histórico. Misma moneda utiliza factor1. Tasa inexistente/incompatible deja el importe como Sin tasa; nunca suma solo las partes convertibles ni inventa tasa1. Fuente/fecha/factor y originales visibles en tooltip, vínculo a fuente en ayuda. Son referencias diarias, no cotizaciones bancarias de compra/venta. No reutilizar el cambio comercial de planes/pagos.

GET de hoja solo lee Neon. Cuando falta una tasa necesaria, POST explícito de la interfaz consulta hasta31 días, cuatro solicitudes concurrentes, timeout8s y enfriamiento15min ante falta de publicación. Caché pública por fecha; históricos exitosos se conservan para resultados verificables. Consulta de datos Meta importados cada30s visible, independiente de la descarga de tasas y sin llamadas Meta/IA. Hoy puede ser parcial; fechas de diarios conservan zona de cada cuenta. Tooltip de recepción se presenta en Lima.

## Persistencia y correcciones

Migraciones005/006/007 se conservan. Nueva202610240001 crea encabezados/defaults y caché MetaFxDay. Las filas originales con moneda pasan a ser fuentes legacy; sus IDs, días, importes, monedas y ventas permanecen intactos y se vinculan a una fila de presentación por alias/país. Si había varias monedas para ese país, G/CF se expresan conjuntamente al elegir destino. No se calculan tasas ni se convierten importes durante la migración. Las unidades existentes explícitas se conservan; nuevos defaults vacíos.

La fila canónica utiliza currency interna vacía; displayCurrency determina presentación. Un CF nuevo/edición explícita guarda fixedCostCurrency y un override, sin cambiar los originales legacy. Limpiar un manual es un override vacío, no resucita un valor legacy oculto. Revisión por día y fila evita escritura tardía tras corregir país/moneda.

Cambiar país mantiene la fila y sus fuentes manuales, consulta B/G del nuevo país y no cambia etiquetas de campañas. Marcador oculta la antigua pareja en esta hoja para que no reaparezca; gasto original sigue visible en Meta Ads. Agregar/importar explícitamente esa pareja la restaura. Destino persistente ocupado devuelve409. Filtros de alias+país en Meta siguen intersectándose antes de paginar/resumir.

## API

- GET effectiveness?tableId&since&until: hasta31 días, fila agregada, fuentes, factores y missingFxDays; solo OWNER.
- PATCH effectiveness: manuales por día; currency es la unidad mostrada al escribir CF y debe seguir vigente. B/spend no admitidos.
- PATCH effectiveness/identity: país/moneda por fila y revisión.
- PATCH effectiveness/columns: nombre de columnaA/defaults globales, transacción atómica y auditoría.
- POST effectiveness/import: hasta500 filas válidas, escrituras batch y reutilización de IDs.
- POST effectiveness/fx: solo referencias diarias públicas, OWNER aprobado, fechas válidas no futuras. Sin credenciales ni cuerpos de Meta.

Ninguna operación modifica el generador de imágenes, estados de publicidad, presupuestos o cobros.

## Calendario y resumen del período

Un solo botón abre calendario estilo Meta: períodos a la izquierda, dos meses, mes/año elegibles, rango resaltado y Cancelar/Actualizar. Hoy/ayer/7/14/28/30 días, semanas lunes/domingo y meses completos respetan Lima y hasta31 días; sin fechas futuras. Cancelar no cambia los datos. Popup móvil acotado al viewport. Recientes solo refleja elecciones aplicadas en esa sesión; no hay controles ficticios de comparación.

El bloque de4 columnas de resumen aparece dentro de la tabla, antes de los días. Selector Total del período/Promedio diario; cada V/B/G/CF tiene orden asc/desc y filtro mínimo/máximo. Cada métrica diaria y alias/país/moneda también se ordena. Contador de filas y limpiar en la cabecera, sin barra nueva. Datos desconocidos al final en ambos sentidos. Los importes de monedas diferentes se ordenan dentro de cada moneda; elegir moneda global única permite compararlos entre todas las filas.

Total = suma de valores conocidos del rango. Promedio diario = suma / número de días con datos; cero explícito participa, vacío no se convierte en cero. Cobertura incompleta se indica con* y n/días en tooltip; también campañas faltantes para B/G. Si un G/CF necesario está sin convertir, el resumen monetario no presenta una suma parcial: Sin tasa. Las conversiones diarias se realizan antes de sumar/promediar, nunca con una sola tasa sobre el total. Tooltip incluye fórmula y cifras. Filtros se aplican al modo visible y se limpian al cambiar Total/Promedio; no escriben datos ni consultan Meta. Tolerancia de redondeo IEEE evita excluir0.1+0.2 frente al límite0.3, sin redondear las cifras fuente.
