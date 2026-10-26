# Efectividad: hoja por alias y país

Módulo lateral OWNER independiente de productos/subproductos del generador. Tablas lógicas con nombres editables; Diplomados inicial conserva los alias previos. La columna A tiene nombre propio editable: Diplomado, Producto, Artículo, etc. Cambiar ese encabezado no cambia el nombre de la tabla ni de los alias. Renombrar un alias mantiene su ID y cambia su nombre visible en todos los países.

## Hoja y asignación

Vista continua sin tarjeta ni márgenes centrales, filas compactas, columna de alias/país fijas horizontalmente y cabecera fija dentro de la hoja. Enter/Tab/salir guarda las celdas; Escape descarta. V/CF son manuales; B/G conservan su origen Meta y admiten ajustes explícitos de presentación, incluidos0 y N.A. Los originales de Meta no se escriben. Mantener borrador ante error, revisión congelada al comenzar y cola por día para guardar V/CF rápidamente sin pisarse. No hay reintentos automáticos de mutaciones.

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

## Calendario y filtros de visualización

Un solo botón abre calendario estilo Meta: períodos a la izquierda, dos meses, mes/año elegibles, rango resaltado y Cancelar/Actualizar. Hoy/ayer/7/14/28/30 días, semanas lunes/domingo y meses completos respetan Lima y hasta31 días; sin fechas futuras. Cancelar no cambia los datos. Popup móvil acotado al viewport. Recientes solo refleja elecciones aplicadas en esa sesión; no hay controles ficticios de comparación.

La tabla continúa directamente de Moneda a las fechas, sin columnas adicionales de total/promedio. La instrucción más reciente reemplaza Filtros del período por **Filtro de parámetros**: selección múltiple con nombre completo y sigla de las columnas existentes: Ventas (V), Base (B), Gasto (G), Costos fijos (CF). No se inventa una métrica de presupuesto: G es gasto importado. Buscar nombre o abreviatura solo limita las opciones de la lista; marcar/desmarcar cambia la proyección de columnas para todas las fechas del rango. Todos selecciona el catálogo completo, incluso con búsqueda escrita; desmarcarlo deja ninguna columna métrica y una indicación explícita. Cabeceras de fechas/filas/alta se adaptan al número de columnas, sin colSpan0.

**Filtro de alias** permite elegir uno o varios IDs del catálogo de la tabla, buscar por palabras sin distinguir mayúsculas/acentos y restaurar Todos. Se intersecta con país, rango y parámetros visibles: un alias + Ventas produce solo sus filas y V por cada fecha. Todos es un estado explícito que incluye alias nuevos; nunca se infiere país ni se unen datos de países distintos. Alias sin campañas siguen disponibles. Elegir otra tabla abre su propio catálogo y filtros en Todos. Ninguna selección se interpreta como ninguna fila/columna, no se convierte silenciosamente en Todos.

Filtros puramente locales, sin escrituras ni consultas publicitarias externas. Ocultar/mostrar no borra datos, cambia moneda, asigna alias ni mueve manuales. El orden asc/desc por día y alias/país/moneda sigue disponible; si la métrica ordenada deja de verse o la fecha sale del rango se usa orden por alias. Desconocidos al final en ambos sentidos; los importes de monedas diferentes se ordenan dentro de cada moneda.

País y moneda conservan desplegables con buscador propio en filtro, cabecera para todas, fila individual, nueva fila y pegado. Admiten nombre español o código sin distinguir mayúsculas/acentos (Chile/CL, dólar/USD). Escribir solo busca: elegir o Enter confirma; Escape/cerrar descarta la búsqueda. Listas de países/monedas/parámetros/alias usan las variables del tema claro/oscuro, incluidas opciones nativas del calendario. La acción individual conserva la revisión al abrir y los errores no cambian el valor guardado. Escape devuelve foco al botón; casillas admiten Tab/Espacio y búsqueda de coincidencia única con Enter.

## Anchos y ajuste del texto

Anchos iniciales de Alias:174.2px escritorio y120.6 móvil (33% menos que260/180); País45/37.5px, Moneda35px y cada parámetro diario36px (50% menos que90/75,70 y72). La tabla utiliza colgroup y suma explícita: no rellena el ancho sobrante ampliando columnas. Los encabezados de fecha abarcan exactamente las métricas visibles, incluidas ampliaciones individuales.

Arrastrar el borde derecho de cada encabezado cambia su columna, independientemente de otras fechas. Flechas ajustan5px, Mayús+flechas20px; Inicio o doble clic recuperan el ancho inicial. Alias y País siguen fijos horizontalmente y su separación se adapta al ancho actual de Alias. Los anchos se guardan en localStorage por usuario, tabla y columna/fecha, y se restauran al recargar o volver desde otro menú en ese navegador. Doble clic/Inicio restablece el ancho inicial. Si el navegador impide guardarlos se informa; no se escriben preferencias remotas.

Texto, cifras y borradores se mantienen en una línea con fuente que disminuye si hace falta, sin cortar su contenido; al ampliar vuelve hasta el tamaño normal. Un observador por tabla mide con Canvas y agrupa lecturas/escrituras en animationFrame, incluido input y resize. Los controles se miden con ancho fijo disponible para evitar encogimiento acumulativo. Las celdas País/Moneda muestran código completo; los nombres completos siguen en el desplegable buscable y title. No se alteran valores, revisiones, fórmulas ni permisos.

## Valores y estado por país

Valores ofrece Todos, Igual a0, Mayor que0 y N.A. Muestra filas con alguna celda visible coincidente, cruzando alias, país, estado, fechas y parámetros. Sin dato no es0 ni N.A. Desde el mismo menú se completan las celdas visibles con0/N.A. o se restauran sus originales; el alcance se muestra antes de pulsar. Hasta1000 filas/31 días por operación atómica. No hay asignación automática de domingos: se elige la fecha y se marca explícitamente.

Las anotaciones de lote/B/G se guardan como overlays por campo/día en MetaEffectivenessDay.annotations. Los originales V/CF y diarios Meta se conservan; editar V/CF numéricamente elimina solo su overlay. Cualquier parámetro admite número o N.A.; vaciar B/G restaura su importado. N.A. se excluye de sumas/promedios y0 sí cuenta. Ajustes positivos monetarios conservan moneda de entrada para conversión diaria;0/N.A. no requieren moneda. Ajustes identificados por color/tooltip, con originales/factores disponibles.

PATCH effectiveness/cells valida OWNER aprobado, tabla, campos/tipos/rango y token de revisiones por fila bajo lock884411; conflictos409 no escriben parte del lote. Un upsert parametrizado JSON a recordset evita consultas por celda. Solo esta ruta admite cuerpo JSON<=1MB; otras mantienen100KB. Sin reintentos de escrituras inciertas.

MetaEffectivenessState guarda activación por aliasId+país, independiente de la presentación. País obligatorio para cambiar estado; default activado sin fabricar una fecha anterior. Icono verde lleno frente a naranja/atenuado, filtro Todos/Activados/Desactivados y detalleⓘ. No cambia disponibilidad/asignación de alias ni campañas de Meta, ni bloquea edición de cifras. Cambiar país no transporta su estado al país nuevo.

MetaEffectivenessEvent registra transiciones reales, fecha/hora, actor y snapshot inmutable: rango/moneda, parámetros seleccionados/cantidad y totales/cobertura/N.A. de V/B/G/CF. Datos posteriores no reescriben snapshots. Detalle muestra horas de Lima y páginas de50 eventos. PATCH effectiveness/state requiere revisión y bloqueo; concurrencia/repetición409 sin duplicar evento. GET effectiveness/history valida OWNER y cursor de la misma pareja. Migración202610250001 aditiva conserva días, importes y revisiones previas.

## Vistas y Totales por hoja de origen

Manual es la vista inicial, con Ventas (V) y Presupuesto (P). Automática muestra V/B/G/CF. Ambos botones son visibles; cada vista conserva su selección de parámetros. V es el mismo dato en ambas vistas: cambiar de vista no duplica ni reemplaza ventas. P es un importe manual por alias/país/fecha, con moneda de ingreso registrada en annotations; usa las mismas tasas diarias de presentación que otros importes. No se calcula a partir del gasto ni modifica presupuestos publicitarios. La leyenda está al lado de Efectividad.

Totales abre una hoja con fechas verticales. «Hojas de origen» permite elegir una o varias tablas, por nombre y búsqueda; abre con la tabla actual. Cada bloque lleva el nombre de su hoja de origen (por ejemplo Diplomados/Tienda). V siempre suma exclusivamente los alias de esa tabla; nunca se combinan ventas entre bloques. Las filas se separan por país y moneda de presentación. No hay una suma de dinero entre países/unidades distintos. Se incluyen alias activados y desactivados: el estado visual no borra histórico.

Total manual abre por defecto con V/P calculados y BM (Base manual), GT (Gasto total) y CF editables. Estos tres datos son propios de la hoja de totales, no son los B/G/CF de los alias. Total automático calcula V/B/G/CF de los datos de la hoja, incluidos sus ajustes manuales explícitos previos. Ninguna vista escribe Meta. Las sumas incluyen ceros, excluyen N.A., marcan * cuando faltan alias/datos y no dan subtotal monetario cuando falta una conversión necesaria. Rangos de hasta31 días, misma selección de fechas para los bloques. Elegir país y moneda permite iniciar totales manuales incluso en una tabla sin alias.

Persistencia de totales: MetaEffectivenessTotalDay, clave(tableId,country,currency,day), values JSON para baseManual/totalSpend/fixedCost y revision. La unidad del total es explícita; cambiar la moneda de un alias no reclasifica cifras ya escritas en los totales. PATCH exclusivo OWNER aprobado bajo lock884411, revisión por día, auditoría y conflictos409. El cliente serializa campos del mismo día y conserva borradores al fallar; no reintenta escrituras inciertas. GET no sincroniza publicidad ni llama proveedores externos.

## Sincronizador de columnas entre tablas internas

Disponible en la barra de la hoja. Selecciona hoja de origen; el destino es la tabla abierta. Elige Alias→Alias y/o parámetros idénticos V→V, P→P, B→B, G→G, CF→CF. No admite mapear ventas a presupuesto/base. Usa el rango actual, hasta31 días y1000 filas fuente por operación. Las cifras exigen nombre literal exacto de alias, código de país no vacío idéntico y misma fecha. Nombres que solo difieren en mayúsculas no se consideran coincidencias exactas ni se fusionan. Los importes se guardan en la moneda de presentación de la fuente, conservando unidad, y se muestran en la unidad del destino con su tasa diaria.

Alias seleccionado añade nombres y parejas país del origen; los existentes del destino y sus otros parámetros no se borran. Para admitir el mismo nombre en hojas distintas,202610250003 cambia la unicidad de MetaAlias de global a(tableId,name), conservando todos los IDs/asignaciones Meta previos; la validación de duplicados insensible a mayúsculas queda dentro de cada tabla. Dos alias de hojas distintas siguen siendo entidades independientes, nunca ediciones compartidas por tener el mismo nombre.

La revisión muestra alias/filas nuevos, celdas con datos y omisiones; no escribe. Aplicar recalcula bajo bloqueo y valida token SHA256 del plan, configuraciones y revisiones; cambios posteriores devuelven409 sin escrituras parciales. Copia valores explícitos0/N.A.; un origen vacío o sin tasa no borra el destino. País vacío no autoriza copiar cifras. Cada celda queda como overlay con procedencia visible (nombre de hoja y marca azul), sin alterar sus originales ni el origen. Un cambio manual posterior es local, hasta sincronizar explícitamente otra vez. No copia la activación del alias ni escribe campañas.

MetaEffectivenessSync guarda origen, columnas y última sincronización. Se ejecuta al pulsar «Sincronizar ahora», sin programación implícita ni sincronización continua; la configuración se recupera al volver. Sin vínculos a Excel/Google Sheets externos. OWNER aprobado y auditoría, transacción y lote con un upsert SQL, sin reintento automático de respuesta incierta. Los totales usan los valores ya sincronizados de la hoja elegida como origen.

La cobertura parcial viaja en las anotaciones copiadas: marca * en la celda destino y en los totales/histórico, aun si no hay campañas etiquetadas en esa tabla. Copiar un subtotal conocido no lo transforma en cobertura completa.

### Disposición del libro y más hojas en Totales

La leyenda está en la cabecera superior con Efectividad. Los controles quedan arriba y las pestañas están inmediatamente junto al borde superior de la tabla; Totales es una hoja ámbar en esa misma franja, independiente del verde de alias. Manual azul/Automática violeta, sin depender solo del color: también nombre y selección accesibles.

En Totales, «+ Agregar hoja» permite buscar/elegir cualquier tabla no incluida. Se añade a la derecha con el mismo grupo de parámetros y fechas; cada bloque conserva su nombre de origen y sus propias cifras/manuales. El orden sigue la adición, no el orden alfabético. Hojas de origen permite ajustar la selección o Todos. No fusiona cifras de distintos países/monedas/tablas ni crea nuevos parámetros; usa los cálculos/guardados ya existentes. Crear +Tabla desde Totales abre la nueva hoja de alias.

### Selección y activación manual, búsqueda y orden de hojas

El check por fila selecciona una pareja alias+país; no cambia su activación. El interruptor sí permite activarla/desactivarla individualmente. Los botones Activar/Desactivar junto al contador aplican ese mismo estado manual a la selección visible. Check de cabecera para seleccionar/deseleccionar visibles; filas sin país no se seleccionan para cambiar activación. Las filas ocultas por filtros quedan fuera del lote. Hasta1000 por operación, permisos/revisiones y existencia validados antes de un upsert atómico; eventos solo de transiciones reales, preservando fechas/cantidades del historial. No estados de campañas ni datos Meta.

Buscador directo de alias por palabras (sin distinguir acentos/mayúsculas) cruza filtros; Filtro de alias sigue disponible para selección múltiple. «Valores» se denomina ahora «Filtro de valores».

Arrastra una pestaña de alias antes/después de otra, o usa Alt+flecha izquierda/derecha. El orden queda en localStorage por usuario (en este navegador) y se restaura al volver/recargar. Nuevas tablas al final; +Tabla sigue a la última hoja de alias y Totales queda a continuación. Mover no cambia nombres, datos, permisos ni identidades de las tablas. Si el navegador bloquea almacenamiento, se avisa que el orden no pudo guardarse.

### Asesores y vinculación de tres campos

La columna Asesor sigue inmediatamente a Alias en ambas vistas; ofrece un desplegable buscable del catálogo de la hoja Asesores. Su ancho se arrastra/restaura y persiste con los demás anchos. Primero debe elegirse el país. Cada fila alias+país tiene un asesor actual opcional, sin asignación automática ni propagación a Meta. La selección de alias en Meta solicita tabla, alias, país y asesor; quitar alias limpia también país/asesor. La API permite asociaciones anteriores sin asesor por compatibilidad, pero nunca aportan B/G automáticos.

Solo campañas con el mismo aliasId de la misma tabla, el mismo país y el mismo advisorId no nulo de la fila contribuyen a B/G; se suman cuentas distintas que cumplan los tres campos, y se excluyen conjuntos/anuncios para evitar contar dos veces. IDs de asesor mantienen la identidad al renombrar. No se reetiqueta ni borra información original de campañas, ventas, presupuestos o ajustes al cambiar una selección.

Asesores es una hoja especial azul, fuera de los alias y de los orígenes de Totales/sincronizador. Permite crear/renombrar asesores, buscar por palabras, elegir calendario (hasta31d) y hoja de origen de ventas. Cada día presenta Asistencia (Presente/Ausente/N.A./Sin registrar) editable manualmente y Ventas (V) calculadas con las mismas V de ambas vistas, sumando las filas asignadas al asesor. Las ventas no se editan en esta hoja. La asistencia es por asesor+fecha e independiente de la hoja de ventas seleccionada. La asignación actual se aplica al histórico; no se ha creado una atribución por intervalos. Todas las hojas es una elección explícita e incluye también filas copiadas por sincronización: para evitar contarlas otra vez debe elegirse la hoja de origen. Vacíos son desconocidos, cero es conocido, N.A. no suma; cobertura parcial lleva asterisco.

Migración 202610260001_effectiveness_advisors: catálogo MetaAdvisor, asistencia por ID+fecha y FKs opcionales en campañas/filas. No modifica valores existentes ni inventa asesores. Guardados OWNER con aprobación actual, bloqueo884411, revisión optimista de fila/asesor/asistencia, validación de país/recurso y auditoría; GET no importa ni genera publicidad. El despliegue requiere ejecutar las migraciones versionadas habituales.

### Estado, controles por parámetro y reglas de colores

Activos antes que desactivados en cualquier orden de columna; cada grupo conserva el orden asc/desc elegido. En una fila desactivada, cada fecha consultada proyecta N.A. en los parámetros vacíos. `automaticNa` distingue esos N.A. del dato manual; no se escribe ningún valor ni día nuevo al desactivar. Al reactivar desaparecen solo las proyecciones y vuelven los vacíos. Números/cero/overlays/N.A. manuales se conservan. Si hay un importe real sin moneda/tasa sigue pendiente de conversión, sin presentarlo como N.A. Totales y filtros consumen esa misma proyección; N.A. no se suma como cero. El sincronizador numérico omite automaticNa, y tokens incluyen estado/revisión para rechazar acciones preparadas antes de cambiar el estado.

Cada encabezado de parámetro diario, incluidos V/P y B/G/CF, tiene Todas con opciones0/N.A. Se aplican a las filas visibles de esa fecha y ese parámetro, con el guardado atómico y revisión existentes. Las demás fechas, parámetros y filas ocultas quedan fuera de esa acción. Se conservan los originales mediante annotations como en el llenado previo.

Botón Colores: diez colores definidos, valor numérico o N.A., parámetros seleccionables, Aplicar y Fijar y aplicar. Reglas persistentes por tabla, activas dentro de su rango de fechas inclusive; se comparan con el valor mostrado (importes redondeados como la celda, en su moneda visual). No colorea ausencias como0; N.A. gris por defecto, salvo una regla explícita del usuario. Última regla coincidente prevalece. Fijar muestra un acceso para volver a aplicar valor/color/parámetros al período actual del calendario sin seleccionarlos otra vez; actualiza las fechas de esa regla. Si el mismo color ya está fijado para otro valor, se muestra aviso con Usar igualmente/Elegir otro color antes de guardar. Quitar elimina formato, nunca cifras.

Sincronizar colores: elegir otra tabla de origen, revisar cantidad y sustitución, y pulsar Sincronizar colores ahora. Copia reglas, fechas y fijados, reemplazando la configuración del destino; no cambia números ni otras tablas y no crea una réplica continua. Revisión de origen/destino y transacción impiden copiar una previsión obsoleta. Migración aditiva202610260002 añade MetaEffectivenessColors por tableId con rulesJSON y revisión; permisos/auditoría siguen el flujo OWNER/884411. Las pestañas finales quedan alias…/+Tabla/Totales/Asesores.

### Corrección posterior: colores globales y cabeceras para todos los activos

Los colores ya no se limitan por calendario. Cada regla aplica a su valor/parámetros en todas las fechas; es solo presentación. Fijados aparecen como accesos de color junto al botón, con una X que elimina la regla y retira su formato de la vista sin modificar datos. Se conserva la paleta10, aviso de color repetido, prioridad de última coincidencia, persistencia por tabla y sincronización explícita entre tablas. La migración202610260003 retira since/until del JSON previo, conserva orden/IDs/valores/colores/fijados y aumenta revisión; no altera ninguna celda financiera. La regla nueva es estricta y no admite fechas. El argumento de día del helper anterior permanece por compatibilidad interna, pero no limita la comparación.

El antiguo Todas de cada parámetro diario se llama Activos. Se puede escribir un número y pulsar Enter/Aplicar, o usar0/N.A. Aplica a todos los alias activos de esa hoja, incluso si país/alias/estado/búsqueda/valores los ocultan. No está limitado a las filas visibles. Los desactivados quedan intactos. La operación afecta solo a esa fecha y ese parámetro. El importe se interpreta en la moneda de cada fila; cantidades V/B son enteras y las demás admiten decimales. Si falta moneda para un importe positivo, cambia el conjunto de activos o alguna revisión, se rechaza todo; no se llena parcialmente. El modo allActive exige todos los tokens, una fecha y una métrica en la misma transacción. El llenado de visibles del filtro de valores permanece como acción distinta, con su etiqueta explícita.

El buscador por palabras y el multiselector de alias están ahora en la cabecera de la columna Alias/Diplomado. Se intersectan con los demás filtros; Todos vuelve a incluir el catálogo completo, y cambiar el filtro no escribe datos. Se retiraron las dos copias de la barra superior. Nombre de columna y orden siguen editables.

En Totales la etiqueta GT ahora es GD (Gasto diario); el almacenamiento conserva totalSpend para no perder importes anteriores ni crear otro campo. En Asesores las dos cabeceras diarias son A y V, manteniendo nombres completos accesibles y al pasar el cursor. La ayuda local explica A=Asistencia y V=Ventas.

### Horas ausentes y detalles

Asesores presenta A (Asistencia), V (Ventas) y H (Horas ausentes). H acepta horas decimales (0,5=30 minutos) o intervalos de reloj: guardar salida sin regreso y completar después. Un intervalo abierto se marca pendiente; no se estima su duración. Se suman solo intervalos cerrados, hasta24h/día, sin solapamientos incluso con el día contiguo. Regreso al día siguiente exige casilla explícita. Modos manual/reloj sustituyen H de ese día; A se guarda por separado. Revisiones evitan sobrescrituras silenciosas. La migración202610260004 añade MetaAdvisorAbsence sin inventar registros antiguos.

El catálogo de asesores es global y se ofrece en cualquier hoja y en su fila nueva antes de guardar. Si se elige asesor al importar/agregar, cada alias requiere país; asignación y creación se confirman atómicamente. Una pareja existente con otro asesor no se reasigna al importar: se cambia desde su columna.

Detalle del asesor incluye calendario, filtros de hojas/alias/país, barras/línea V/H/A y desglose diario por alias+país+asesor. Todos es inicial para alias/país. V es compartida entre vistas y solo suma filas con país y asesor coincidentes; asistencia/horas siguen siendo por persona/día, independientes del producto. La asignación actual también se aplica al histórico; Todas las hojas incluye copias sincronizadas y puede contarlas, como indica la interfaz. Vacío, cero y N.A. permanecen distintos.

Detalle del alias presenta solo cambios reales Activado/Desactivado con fecha/hora Lima, barras por día y métricas seleccionables V/P/B/G/CF en gráfico y tabla diaria. Tiene calendario propio hasta31d. La línea base proviene del último evento previo; no se inventa estado antes del primer evento ni duración futura. Snapshots históricos se conservan para auditoría, aunque ya no se repiten en la vista.

### Eliminar una tabla completa

Clic derecho sobre una pestaña de alias (o tecla de menú/Shift+F10) abre Eliminar tabla. Revisión muestra alias, filas/días, estados, asignaciones, totales, colores y conexiones afectadas. Confirmar exige escribir el nombre exacto. Token de contenido impide borrar una revisión obsoleta; eliminación atómica bajo884411 y OWNER aprobado, con auditoría. Borra la tabla y contenido propio; desvincula alias/país/asesor en asociaciones internas Meta y retira sincronizaciones vinculadas. No envía solicitudes a Meta ni borra sus objetos/estadísticas originales; conserva asesores/asistencias/horas y valores ya copiados en otras tablas. Asesores y Totales no tienen este menú. Si se elimina la última tabla se puede crear otra y seguir abriendo Asesores.

### Atribución histórica de ventas por asesor (sustituye la asignación actual aplicada al pasado)

Al cambiar el asesor de una fila se confirma inicio en Lima: Todo el día desde00:00 o Desde una hora. En modo horario el sistema captura automáticamente el total diario registrado al confirmar; no se escribe un corte adicional. El corte pertenece a los tramos anteriores; solo el incremento posterior pertenece al entrante. Si hay varios cambios el mismo día, se usan diferencias entre cortes acumulados. Volver a un asesor anterior abre otro tramo, sumado a los que ya tenía, sin duplicar el total. No se inventa hora por venta ni se reparte proporcionalmente al tiempo. Un tramo sin asesor queda sin atribuir.

Ejemplo: A hasta12:00 con corte5; B hasta16:00 con corte8; vuelve A y el día acaba en12. A suma5+4=9 y B suma3. Cambiar el responsable no modifica esas12 ventas originales. Los días completos otorgan esa fecha al entrante y sustituyen los cortes anteriores de esa misma fecha, conservando todos los eventos de auditoría; fechas previas intactas. Cambios deben seguir orden cronológico salvo esa sustitución dentro de la fecha más reciente. Fechas futuras y cortes decrecientes/superiores al total conocido se rechazan. La captura y el cambio se guardan bajo el mismo bloqueo; la revisión de fila impide cambios concurrentes de responsable.

Si se edita después el total diario por debajo de un corte existente, la atribución queda pendiente/parcial en vez de generar negativos. Corrige el total o establece la asignación de día completo para resolver esa fecha. Si el total aún es desconocido, los cortes ya confirmados mantienen su parte conocida y el último tramo permanece pendiente. N.A. no es cero.

El historial es por ID de alias y país, aunque cambien los nombres. Asesores suma únicamente los tramos de esa combinación y del responsable, dentro del calendario y filtros elegidos. A/H permanecen por persona/día. Filas previas sin historial conservan la atribución anterior hasta el primer cambio registrado, indicando que no existe inicio histórico registrado. Nuevos alias importados con asesor también permiten elegir inicio por fecha/día/hora, con corte0 porque no tienen ventas anteriores; si un cliente anterior no envía esa opción, comienzan hoy00:00. Editar país mueve el historial con la fila y no permite mezclar con otro historial ya existente. No se modifican campañas/asignaciones Meta al cambiar el responsable en Efectividad.

El botón de detalle junto al selector de Asesor abre su progreso con alias/país de esa fila, calendario editable, V/A/H, barras y línea, desglose y tramos/cortes. En la hoja Asesores sigue disponible Detalle ↗ con Todos inicial en filtros. MetaAdvisorAssignment (migraciones202610260005/006) mantiene eventos; el segundo índice permite reemplazar la asignación de día completo sin eliminar eventos previos. Eliminación de tabla incluye cantidad/revisión de ese historial y lo elimina con los alias, conservando catálogo y A/H.

### Inventario y controles de presentación

Inventario sustituye el término Alias en los textos de Meta Ads/Efectividad: asignación, selectores, búsquedas, detalle, sincronización y mensajes. Es un cambio de presentación; claves aliasId/rutas y relaciones históricas siguen iguales. El título genérico guardado Alias aparece como Inventario, mientras que nombres personalizados como Diplomado se conservan editables. Orden de columnas: Inventario, País, Asesor, Moneda. El usuario reconsideró quitar el requisito de país: se mantiene antes de asignar asesor. La elección de inicio de asesor por día/hora sigue disponible. Anchos persistidos usan las mismas claves y los offsets de columnas fijas siguen el nuevo orden.

La barra comienza con Fecha, luego Filtros: País, Parámetros, Valores, Estado; después aparecen Colores/sincronización y otras acciones. Un color fijado queda seleccionado al crearlo. Pulsarlo deselecciona su formato sin desfijar ni perder valor/parámetros; volver a pulsarlo muestra su color otra vez. Indicador de selección y aria-pressed diferencian estados. La X elimina la regla como antes. enabled opcional en JSON controla esa selección: reglas antiguas sin campo siguen activas. No hay migración ni cambios en las cifras; revisión optimista/auditoría siguen iguales. Sincronizar colores copia también selección/deselección, junto a fijados y reglas. La última regla seleccionada coincidente prevalece; si se desactiva puede aparecer otra regla que siga seleccionada para ese mismo valor.

### Inasistencias y minimizar el detalle

Inasistencias (I) está en los selectores de barras/línea del asesor, con total confirmado del rango y tabla diaria. Ausente cuenta1 y Presente0; sin registrar/N.A. deja hueco, nunca inventa faltas ni ceros. Si no hay asistencia registrada, el total muestra raya en vez de0. La cobertura indica cuántos días tienen asistencia conocida. I/A/H son personales por día y no se duplican por inventario; H fraccionario no genera una inasistencia completa. En el mismo detalle, Minimizar está abajo: oculta la ventana y muestra Restaurar detalle. Restaurar o pulsar de nuevo el botón del asesor conserva fechas, filtros y parámetros; Cerrar detalle sí cierra esa instancia.

### Ventas automáticas al cambiar de asesor

Desde una hora ya no pide Ventas acumuladas al corte: muestra solo las registradas y toma el valor vigente al confirmar, en la misma transacción de asignación. Datos vacíos capturan0 sin rellenar V. Si había4 registradas antes de cambiar y después V sube a10, Asesores muestra4 para el saliente y6 para el entrante. A→B→A conserva los incrementos de cada tramo. El cliente no puede modificar el reparto enviando un corte distinto; los campos antiguos de corte/token se toleran por compatibilidad pero no eligen la cifra. Cambios de V mientras la ventana está abierta se capturan al confirmar sin exigir revisar/escribir nada. La revisión del responsable sigue protegiendo cambios concurrentes. Para Todo el día continúa siendo la fecha completa. La cifra capturada corresponde a lo registrado al confirmar para esa fecha: no reconstruye horas de ventas antiguas que nunca se registraron individualmente.

### Repartir V y aprobar pagos tardíos

En la celda V de una fecha con cambio aparece Cambio asesor (Aprobado después de confirmar). Abre una ventana con Asesor1, Asesor2, etc., nombres y ventas propuestos desde los registros; permite editar cantidades, agregar/quitar asesores y Aprobar. La suma puede cambiar: si estaban3 para A y2 para B y llega un pago tardío de A, escribe4/2 y aprueba. Se guarda V6 en esa fila/fecha y Asesores toma4 para A y2 para B. No cambia otra combinación de inventario/país ni B/G/CF/P, ni escribe publicidad en Meta. Sin asesor es un destino explícito que no se imputa a una persona. El total debe ser entero no negativo y los IDs no se repiten.

Asesores muestra el reparto automático desde el cambio, sin esperar aprobación; pendiente de aprobar se indica como parcial/propuesto. Aprobar guarda las correcciones del usuario y actualiza las vistas automáticamente. Base aprobada: total T y cantidades por asesor. Si se registra V nuevo sin otro cambio, el incremento V−T se añade al responsable que cerraba ese tramo; las cantidades ya aprobadas de otros asesores se conservan. Si cambia de nuevo el responsable con contador C, se atribuye C−T al responsable anterior y V−C al entrante. Así A→B→A no pierde créditos anteriores ni duplica V. Una corrección aprobada puede reducir un corte viejo: se usa la base aprobada para evitar negativos. Elegir Todo el día reemplaza la interpretación del día completo y vuelve a proponer el reparto. Cambios dentro del mismo minuto, incluido00:00, siguen orden de registro y cantidades, sin prorratear por duración.

MetaAdvisorSalesApproval almacena fila canónica+fecha, total, cantidades, base de eventos/responsable, revisión, actor y hora de aprobación. Token de fuente/revisión rechaza aprobación si otra ventana cambió V o el reparto mientras se editaba; Actualizar reparto permite revisar antes de confirmar, sin sobrescritura silenciosa. El cambio de asesor sigue capturando automáticamente ventas sin pedir corte manual. Su opción inicial ahora es desde una hora para conservar pagos del saliente; Todo el día permanece disponible. A/H/I son por persona/día y no se multiplican por inventarios.

Las ediciones y aprobaciones publican un aviso sin importes por ventana/BroadcastChannel/storage. Asesores vuelve a consultar inmediatamente en pestañas visibles; al volver al foco también actualiza y consulta cada5s como respaldo para cambios de otros clientes. Los refrescos conservan filas y editores abiertos. Los cambios de cantidades solo se publican tras guardarlos/aprobarlos, nunca por teclear un borrador.

### Pestaña Inventario sin países

Está inmediatamente después de Asesores. Lista una vez cada ID de inventario de las hojas del libro, con su nombre editable y hoja de origen; PE/CO no duplican el mismo nombre/ID aquí. Ofrece búsqueda por palabra, desplegable de inventario, filtro de hoja y Todos. Agregar crea únicamente un nombre en la hoja elegida, sin filas de país; el país y el responsable se configuran después en su hoja de Efectividad. Nombres iguales en hojas distintas siguen siendo registros independientes identificados por su hoja. Editar nombre conserva IDs/asignaciones/historial/cantidades y no renombra campañas Meta. No es el catálogo de productos del generador de imágenes.

### Pestañas independientes y catálogo compacto

Cada grupo tiene su botón: +Totales, +Asesores y +Inventario. Un clic normal abre la hoja. Para renombrarla, usar clic derecho → Editar nombre; Enter, Tab o salir guardan y Escape descarta. El menú de una tabla financiera también ofrece Eliminar tabla con la revisión y confirmación existentes. Los nombres y registros viven en servidor. Las preferencias de fechas/filtros de cada pestaña se conservan en ese navegador por usuario; no son una sincronización entre dispositivos.

Las listas nuevas de Inventario/Asesores empiezan vacías. Inventario añade ítems a una hoja financiera elegida, sin país; país/asesor se definen en la hoja. El mismo nombre en diferentes hojas aparece una sola vez, con las hojas al costado. Este agrupamiento visual exige nombre literal igual y misma lista, y conserva las identidades financieras separadas. Editar su nombre actualiza ese grupo completo de forma atómica. El botón Eliminar de las hojas muestra X junto a cada hoja; la revisión indica las filas/días afectados y confirmar quita únicamente ese ítem de esa hoja. Las otras hojas, asesores y datos originales de Meta permanecen. La operación elimina sus registros manuales e historial y no tiene deshacer; cambios concurrentes obligan a revisar de nuevo.

Cada lista de Asesores tiene sus personas y A/H propios. En Meta y en las hojas financieras se pueden elegir asesores de cualquier lista; el selector identifica la lista adicional junto al nombre. Ventas conservan su atribución histórica exacta inventario+país+asesor y los repartos aprobados, sin duplicarse al crear una pestaña.

Un Totales nuevo empieza sin hojas de origen: usar +Agregar hoja para seleccionarlas. Las sumas V/P/B/G proceden de esas fuentes; BM/GD/CF manuales están separados por pestaña de Totales, fuente, país, moneda y fecha. Elegir la misma fuente en dos resúmenes muestra los mismos hechos de venta, con entradas manuales independientes. Las migraciones202610260008/009 deben ejecutarse con npm run db:deploy antes de arrancar la versión nueva. Los registros previos permanecen en default-totals/default-advisors/default-inventory; no se reescriben cifras ni asignaciones.

### Selección y filtros en el catálogo Inventario

La cabecera de Inventario contiene la búsqueda por palabras (sin distinguir acentos/mayúsculas), el desplegable buscable con Todo el inventario y los checks. La cabecera Hojas filtra por hoja y conserva Eliminar de las hojas para activar las X individuales. Ya no se repiten esos filtros en una barra superior.

El check de una fila selecciona sus hojas asociadas; el check superior marca o desmarca todos los resultados visibles. Eliminar seleccionados revisa únicamente los checks de los resultados actualmente visibles. En la revisión se puede desmarcar cualquier hoja para conservar ese inventario y sus cifras. Cancelar no elimina nada. Confirmar valida lista/IDs y todas las revisiones antes de borrar en una sola transacción; un cambio concurrente rechaza el lote completo y permite Revisar de nuevo. Se mantienen los originales de Meta y las asociaciones/ventas de hojas no elegidas. Los checks no se guardan al recargar; los filtros mantienen su preferencia por usuario y pestaña. No requiere migración adicional a las ya publicadas008/009.


Los datos sincronizados y ajustes manuales conservan su procedencia en el detalle de la celda, sin fondo morado automático. El formato por valor depende de las reglas activadas en Colores: deseleccionar un fijado oculta su formato manteniendo la regla; la X la elimina. N.A. conserva el gris por defecto. La selección de una pestaña y la creación de nuevas pestañas no abren el editor del nombre. El menú contextual también se abre con Shift+F10 o la tecla de menú, permite navegar con flechas y Escape devuelve el foco a la pestaña.
