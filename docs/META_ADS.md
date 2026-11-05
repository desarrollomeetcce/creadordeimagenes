# Meta Ads: consulta y análisis

## Paginación de fechas compacta al pie izquierdo · 2026-11-04

Ampliación del mismo bloque: se retiran del toolbar financiero Sincronizar o vincular columnas, Pegar inventario y Subir archivo. Se elimina montaje/estado/import del panel de sincronización inaccesible; vínculos almacenados y rutas siguen intactos, aviso conserva procedencia sin dirigir a botón retirado. Pegado de celdas existente conserva flujo propio. Filtros/Colores/Selección/Activar/Desactivar/Eliminar seleccionadas se ordenan en flex compacto, con controles28px y grupos que fluyen en una línea si hay espacio, sin anchuras forzadas móviles.

Se retira la franja grande superior de Período completo/Fechas siguientes. Hoja financiera muestra al pie de la tabla, tras el desplazamiento horizontal, solo Anterior · Página N de M · Siguiente. Tamaño10px y ancho ajustado al contenido, sin fondo/franja ni expansión móvil. Fechas completas y aviso de que las acciones afectan fechas visibles permanecen en tooltip accesible. Asesores mueve también su paginación compartida al pie; useReportDayPages conserva algoritmo/contexto y usa misma presentación compacta.

194 unitarias existentes correctas, typecheck/build y4 recorridos Chromium: tres controles retirados y barra restante en una línea1920px; pie menor de300×38px al borde inferior izquierdo sin banner superior, navegación ida/vuelta en ventanas31 días exactas, estados deshabilitados y pantalla390px en una línea sin errores/escrituras. FuenteV1/G10.25, asesor/país/activación intactos y fixture exclusivo retirado. Evidencia compact-date-pages-{unit,types,build,browser,cleanup}.txt. No cambios de rutas, permisos, fechas calculadas, consultas, registros o fuente CAC. Hostinger continúa sin comprobación directa desde el entorno.


## Asesores: orden compartido por arrastre y teclado · 2026-11-04

Hoja de Asesores añade asa ⠿ junto al nombre para arrastrar a otra fila; Alt+↑/↓ permite lo mismo con teclado. Orden completo de IDs se guarda en config.advisorOrder de la pestaña, nunca en localStorage. Todos los lectores reciben el mismo orden del reporte; se conserva en F5, filtros/fechas y usa refresco existente30s para otras vistas abiertas, sin nuevo sondeo. EDIT puede cambiarlo, VIEW no muestra asas y servidor rechaza sus escrituras. Buscar no elimina otros asesores: movimiento usa lista completa y conserva filas ocultas. Nuevos miembros se añaden al final, referencias ausentes/duplicadas guardadas se normalizan al leer.

PUT advisors/order valida lista activa, miembros completos únicos del mismo documento y SHA256 del orden efectivo. Bajo884411 revalida permiso vigente/capacidad de escritura, rechaza otra hoja, revocación, altas concurrentes u orden obsoleto409 sin cambio parcial. Preserva config ajena desde lectura bajo bloqueo y rechaza configuración no objeto; una escritura/auditoría por cambio, no-op sin auditoría duplicada. Revisión depende del orden/miembros, no de importes. No renombra personas ni modifica revisión de asesor, asignaciones, asistencia, ventas, bases o publicidad. Reporte reutiliza config ya leída y ordena localmente; guardar aplica acuse sin volver a consultar métricas, invalida respuestas anteriores y bloquea doble interacción.

Validación:1 unitaria de normalización/movimiento/inmutabilidad y7 integraciones, incluidas regresiones de BC y compartidos. Tres roles reciben mismo orden; VIEW/otra hoja/duplicados/stale/nuevo miembro/revocación rechazados; config, personas y asistencia exactas. Typecheck/build correctos.6 recorridos Chromium con tres sesiones reales sintéticas: asa accesible, arrastre nativo Donasys→Ana1 PUT, lector independiente ve orden y403 al escribir, EDIT mueve por teclado, OWNER/VIEW conservan nuevo orden en F5 y vista estrecha sin errores ni otras mutaciones. Snapshot completo de personas/asistencia/asignación/filas/días y configuración ajena idéntico; exactamente2 cambios y limpieza exclusiva confirmada. Evidencia advisor-order-{unit,integration,types,build,browser,cleanup}.txt en /workspace/work.

Calendario/evaluación/Bajo gasto aún del bloque anterior ya publicado en0f8e938, Vercel dpl_2ae7Hdr431Ht7VfbKAYRKVScKBFo READY y alias exacto. Este bloque completa el siguiente pedido de orden compartido; Hostinger generator.agenciamagneto.org continúa sin verificación autenticada y no se reordenaron datos reales desde este entorno.


## Evaluación completa por calendario, fuente Meta compartida y bajo gasto · 2026-11-04

Meta añade Evaluar por fecha al menú Estado con calendario existente.14 días inclusivos por defecto,7/14 y demás presets, rango propio incluso histórico y desde inicio: el período explícito se respeta al evaluar/ordenar, mostrar fechas y abrir detalle.14 conserva preset rodante y preferencia válida; no reemplazar el rango elegido por una ventana reciente. Calendario abre/cancela localmente; aplicar reutiliza consultas existentes, sin Graph ni lecturas por celda.

Lista de Diplomados y hojas incluyen menú compacto de orden Crítico→Normal/Normal→Crítico y Evaluar por fecha en Estado. Preferencias personales usuario/hoja,14 por defecto, fechas visibles. Hojas usan siempre CAC/estado de gasto Meta, incluso Vista manual sin presupuesto anotado; fuente, país, fechas y reglas son los mismos del inventario. financialCatalogStatus acepta fechas/fromActivation y conserva permiso/contexto. Lecturas acotadas a fechas cuando es CAC-only; desde activación consulta metadatos de inicio de campañas en un solo lote bajo demanda, prioriza scheduledStart/createdTime del país y usa primer registro/actividad disponible como respaldo, sin inventar eventos ni mover hechos. Ambas proyecciones reciben mismo inicio y todos los hechos de ese período. Detalle de inventario hereda fechas de evaluación en lugar de11 días fijos.

Con Meta acreditado y sin ventas para calcular CAC, gasto por debajo de zero(default25) indica Bajo gasto aún y CAC—; desde25 Revisar,50 Grave y65 Crítico, respetando límites personalizados. Falta de anotaciones conserva ventas null y marca provisional; cero confirmado no se divide ni se vuelve CAC infinito. Sin gasto conocido/FX/vínculo/cobertura correspondiente sigue pendiente. Resúmenes de diplomados seleccionados aplican misma regla solo con cobertura compartida completa. Estado no se excluye por etiqueta organizativa Sin usar. Pendientes quedan al final en ambos órdenes.

Ordenar un país con Top elegido solo ordena sus miembros, conservando banda y todas las filas externas; sin Top conserva orden global elegido. Menús nativos posicionados fuera de cabecera, compactos, accesibles, con ajuste de viewport; no aumentan altura de tabla al abrir.

206 unitarias y9 integraciones correctas. Integración comprueba fechas7/14/históricas/activación y proveedor por país, igualdad completa CAC hoja/inventario, permisos y orden global antes de paginar.10 recorridos Chromium:14dCAC110.25 crítico, bajo gasto con CAC—, abrir/cancelar sin consulta,7dCAC10.25 normal, rango propio cero ventas crítico sinCAC, activación, Top limitado, F5, hoja manual idéntica, móvil, Meta7/inicio y ausencia de mutaciones. Build/typecheck correctos; evidencia evaluation-calendar-{unit,integration,types,build,browser,cleanup}.txt en /workspace/work. Snapshot completo de fuentes sintéticas y limpieza exclusiva verificados antes de publicar. Hostinger sigue sin acceso autenticado; publicar código no acredita cambios de datos reales.

Nuevo pedido de orden compartido de asesores queda como siguiente bloque: asa de arrastre, persistencia de hoja para todos los lectores y permiso de edición, sin preferencia local que oculte orden común.


## Evaluación:14 días predeterminados y riesgo sin ventas · 2026-11-04

Por aclaración posterior del usuario, evaluación reciente usa14 días inclusivos por defecto;7 días explícitos permanece independiente. Meta incorpora agregado14 en la misma consulta agrupada local, sin Graph ni consultas por campaña. Caché cambia versión una vez, también conserva agregados vacíos válidos; selección carga solo período elegido+14. Ventanas antiguas no sustituyen estado actual.

Gasto Meta acreditado en PEN sin ventas anotadas permite alerta provisional por gasto: desde zero(default25) Revisar, desde severe(default50) Grave y critical(default65) Crítico; cero confirmado escala también. CAC y ventas ausentes permanecen null, no se fabrican ventas0 ni CAC infinito. Ventas positivas mantienen gasto/ventas y umbrales existentes. Moneda incompatible, falta de FX, campañas sin vincular/compartidas o gasto no disponible conservan protecciones. Resumen CAC de inventario aplica riesgo con gasto convertido conocido, incluso sin presupuesto manual. No cambios de activación/publicidad/ventas.

204 pruebas unitarias específicas correctas; integración CAC/hojas y campañas con pruebas de permisos, separación de países/fuentes, orden antes de paginar y períodos14/7; typecheck/build comprobados antes de publicación. Calendario específico Evaluar por fecha y unificación visual de fuente entre hojas/inventario siguen pendientes: este bloque no acredita que estén implementados ni datos reales Hostinger corregidos. Todo código previamente listo pendiente queda incluido; cambios anteriores de grupos ya estaban publicados en2f685c8. Sin verificación autenticada del dominio generator.agenciamagneto.org.


## Grupos: estados por país, uso en lote y orden de columnas · 2026-11-04

Editar grupos muestra bajo Detalle el estado operativo de cada diplomado/país: Activado, Desactivado, Por hacer campaña o Por desactivar. Se calcula con estados, filas y tareas de las lecturas agrupadas existentes, respetando países lógicos de cada hoja; sin registro se indica Sin registro y fuentes contradictorias Varios estados. No se deduce activación de la marca de uso, ni se añaden consultas por celda. Crear/Top conservan su presentación.

Seleccionados incorpora Marcar usado y Marcar sin usar. Diálogo compacto exige escoger países explícitamente o Todos los países; confirma cantidad de diplomados y marcas. USAGE_BATCH valida permisos, catálogo autorizado y SHA256 de revisiones solo de celdas elegidas bajo884411; un cambio concurrente rechaza todo sin escritura parcial. Una actualización JSON, una revisión y una auditoría por lote; respuesta compacta fusionada localmente sin recargar el directorio. No modifica membresías, activaciones, campañas, finanzas ni historia automática.

Encabezados de países permiten arrastrar para reordenar o Alt+flechas con foco. Preferencia personal por usuario/lista conserva orden al cambiar grupo y F5; códigos estables mantienen datos/anchos asociados a cada país. No se mueven hojas ni registros. Preferencias desconocidas/duplicadas se normalizan; países nuevos se incorporan al final.

Verificado:296 unitarias,29 integraciones, typecheck/build y8 recorridos Chromium. Arrastre nativo México tras Paraguay, teclado Honduras, F5 y móvil; estados limitados a Editar e independientes de uso; selección explícita/Cancelar sin cambios; doble clic genera un POST, lote2×2 y Todos24 marcas, conflicto concurrente409 sin actualización parcial y sin GET posterior. Snapshot completo de alias/filas/países/activaciones/eventos/asesores/publicidad/importes y grupos/ciclos idéntico; solo dos lotes aprobados y una marca concurrente esperada. Limpieza exclusiva confirmada. Evidencia group-country-status-{unit,integration,types,build,browser,cleanup}.txt en /workspace/work.

Reconectando y Unable to verify model access aparecen en el chat, no en la aplicación; no hay diagnóstico interno que permita atribuir causa o corregir acceso al modelo desde este repositorio. Los archivos y verificaciones locales se conservaron. Hostinger generator.agenciamagneto.org sigue sin verificación autenticada: el proxy bloquea CONNECT, no equivale a un error HTTP del sitio. Publicación main/Vercel no acredita datos reales ni despliegue Hostinger.


## Añadir: rectángulos directos y aceptación por etiquetas sin alerta · 2026-11-04

Nombres exactos Añadir diplomado, Añadir categoría, Azar y Azar por categoría. Los dos rectángulos de categorías ofrecen directamente categorías del catálogo. Al elegir para añadir, despliegan Principales y luego Secundarias en popover local anclado, sin modal extra; búsqueda/cambio/limpieza mantiene elecciones. ResizeObserver y resize mantienen límites de pantalla, se limpian al cerrar; eventos toggle de selectores hijos no cierran el padre. Azar por categoría usa cantidad de franja y abre revisión directamente. Azar general ya admite sin categoría y varias opciones de la misma categoría; muestreo único excluye miembros/cola/ocupados.

Añadir: y Seleccionados: permanecen independientes. Aceptar añadidos incorpora todos al borrador desde la misma fila, sin confirmación/alerta emergente; X cancela solo propuesta/alta no guardada. Guardar cambios mantiene MEMBERS completo con revisión.293 unitarias, typecheck/build y8 recorridos Chromium: cuatro textos exactos y captura de franja; azar categorizado; azar6 elegibles con sin categoría/misma categoría; popover directo y roles primario/secundario/cambio/limpieza; aceptación inline sin diálogo ni API; un guardado de4 altas a2 originales; F5/móvil/resize; Crear separado. Snapshot DB de todos los hechos igual, catálogo10, ciclos originales y otro grupo intactos. Limpieza exclusiva confirmada. Evidencia /workspace/work/add-rectangles-{unit,types,build,browser,cleanup}.txt y add-rectangles-toolbar.png.

Usuario confirmó que utiliza generator.agenciamagneto.org. Su captura muestra controles anteriores; no se confirma si el servidor o el cliente conservan esa versión. curl al dominio falla en CONNECT con403 del proxy del entorno; environment_status confirma dominio fuera de lista permitida, sin secretos/capacidades de VPS. GitHub del commit anterior solo reporta Vercel success, sin comprobación Hostinger. Publicar main dispara el mecanismo automático previamente autorizado, pero no acredita actualización final del dominio. No se modificó configuración de red, credenciales, instalación o datos reales.


## Grupos: añadir por diplomado/categoría y azar por categoría · 2026-11-04

Franja de Editar ordenada con Añadir por diplomado, Añadir por categoría, Al azar y Al azar por categoría, cantidad y controles existentes. Selector por categoría permite buscar/limpiar/cambiar categoría y acumular varios diplomados, primero Principales y después Secundarias. Doble rol aparece una vez; al limpiar se ve inventario elegible sin perder elecciones. Ventana compacta con X, ampliación y arrastre compartido.

Etiquetas Añadir muestran cola separada de Seleccionados. Quitar selección/Limpiar filtros no borra cola. Añadir(n) revisa nombres y Aceptar incorpora al borrador sin marcar casillas; Guardar cambios persiste MEMBERS completo con revisión. No permite guardar una cola sin aceptar. Altas aceptadas pendientes de guardar conservan etiquetas y X que cancela solo alta local. Muestreo por categoría incluye ambos roles, sin miembros/ocupados/cola/repetidos, con revisión previa; en Editar aprobar prepara cola, en Crear mantiene su selección existente. Al azar conserva diversidad previa y su revisión. Chips con altura acotada para conservar espacio de tabla. Sin nuevas lecturas, rutas, modelos ni cambios de hechos/campañas.

292 unitarias (2 casos nuevos de separación/deduplicación/inmutabilidad y muestreo/exclusión/límites),14 integraciones, typecheck/build y8 recorridos Chromium correctos: cuatro controles, diploma a cola; propuesta categorizada cancelar/aprobar; azar; roles principales/secundarios, cambio/limpieza/búsqueda, multiselección/X; etiquetas independientes y confirmación por lote; guardar exactamente4 altas a2 originales con1 MEMBERS; F5/móvil/maximizar; Crear separado. DB: grupo1 revisión2→3,4 ciclos nuevos y originales intactos; grupo2 exacto, catálogo10 y snapshot completo de alias/hojas/países/V/costos/días/eventos/asesores/vínculos/MetaG idéntico. Limpieza exclusiva confirma baseV1/G10.25. React revisado: efectos acotados, estado funcional, claves/etiquetas accesibles, listas locales y sin consultas por interacción. Sin operaciones en datos reales Hostinger ni verificación directa de ese despliegue.


## Editar grupos: buscar desde el encabezado Diplomado · 2026-11-04

Buscador visible bajo Diplomado filtra solo miembros del grupo/borrador abierto, con búsqueda por palabras, fragmentos, mayúsculas y tildes mediante matchesSearchWords existente. Reutiliza consulta local por grupo y reset de página; Limpiar filtros restaura filas sin desmarcar. Crear conserva cuadro de búsqueda propio; Añadir inventario mantiene selector independiente. Enter no envía el formulario ni guarda un borrador sucio.

290 unitarias, typecheck/build y4 recorridos Chromium: búsqueda local en cabecera sin requests, selección oculta conservada, seleccionar filtrados y restaurar casillas, exclusión de diplomado externo, Enter con nombre editado sin escritura, Crear/Editar y grupos con consultas/borradores separados, Limpiar filtros y móvil/maximizar. Snapshot DB exacto de nombres/payloads/revisiones/ciclos de ambos grupos y de todas las hojas/filas/días/estados/eventos/asesores/objetos/gasto; catálogo5 intacto. Fixture exclusivo retirado. Sin rutas, modelos ni datos reales modificados; Hostinger no verificado desde este entorno.


## Hojas: Por asignar y Por desactivar siempre antes de grupos normales · 2026-11-04

Partición local compartida de las hojas de países: Por asignar primero, Por desactivar después y luego agrupación normal por asesor/categoría. STOP se separa antes de comprobar falta de asesor/moneda para que no caiga en Por asignar. Nueva banda ámbar y borde en nombres; pendientes quedan fuera de cabeceras normales. Se respeta el orden elegido dentro de cada bloque y los filtros existentes. pendingAssignmentAt heredado no devuelve una fila inactiva a Por asignar tras confirmación.

No se modifican tareas al cambiar de vista, ordenar o recargar; no se añaden lecturas ni sondeos. La desactivación manual existente cambia estado y limpia tarea en servidor; el bloque desaparece solo para esa fila, conservando las restantes.290 unitarias (nuevo caso de precedencia/transición/inmutabilidad),26 integraciones de activación, typecheck/build y6 recorridos Chromium: EC con2 STOP y PE con1, faltante de asesor, categoría/asesor, órdenes asc/desc/estado, tabla ampliada, manual/automático, F5, desactivar y móvil. Snapshot exacto conserva todos los alias/hojas/países/asesores/cifras/días/eventos previos/vínculos/estado publicitario/gasto, permitiendo solo1 desactivación explícita y su nuevo evento/revisión. Auditoría1, controles de otras filas intactos. Fixture retirado con baseV1/G10.25. Sin cambios en registros reales Hostinger ni comprobación de ese despliegue desde este entorno.


## Editar grupos: mismo formato compacto de reemplazo del Top · 2026-11-04

Se reemplaza la tabla de5 columnas del diálogo por selector individual o lista compacta de parejas, según la cantidad. Encabezado Reemplazo en el grupo con nombre y tono violeta diferencia esta acción del Top verde. Filtro de grupos y azar/categorías permanecen locales, sin filtro de activación/país. Individual muestra buscador/Antecedentes/Confirmar y destino del saliente; múltiple muestra Sale/Entra y destino por pareja. X, Cancelar y ampliación conservan propuesta; antecedentes abre informe existente bajo demanda.

No cambia REPLACE_MEMBERS ni permisos, revisiones, validación, intercambio de ambos grupos o protección de doble clic. No se utilizan endpoints de Top ni se mueve uso por país, hojas, asesores, activaciones, ventas, gasto o campañas.289 unitarias,14 integraciones, typecheck/build y6 recorridos Chromium correctos: individual compacto/color distinto; antecedentes/Cancelar; confirmar/doble clic; lote2/filtro insuficiente/destinos; intercambio doble aprobado; F5, uso por país y móvil390px con ampliar/restaurar. Verificación DB de2 mutaciones, grupo1 revisión2→4 y grupo2 1→3, pertenencias exactas, catálogo5/ciclos anteriores conservados y snapshot completo de aliases/filas/días/eventos/asesores/objetos/daily idéntico. Limpieza exclusiva confirmada con baseV1/G10.25. Hostinger real no verificado desde este entorno.


## Top: individual original y lote compacto · 2026-11-04

Una selección o un bloque de un solo diplomado abre el selector individual original. Dos o más usan revisión de lote con máximo1100px, controles de grupo/uso/azar juntos, títulos Sale/Entra una sola vez y una línea por pareja; detalle permanece disponible. No cambia esquema, validación ni confirmación del reemplazo.4 recorridos Chromium adicionales verifican selección1/bloque1, lote2 <280px de alto, ancho acotado, filtros que reinician propuesta, categoría insuficiente, completar manualmente, antecedentes, Cancelar y móvil390px. Cero escrituras durante revisión; snapshot completo de alias, días, activaciones, eventos y campañas idéntico, catálogo6 y revisiones de grupos1 intactos. Fixture exclusivo retirado. La publicación conjunta incluye el ajuste anterior de grupos; Hostinger real sigue sin comprobación.


## Grupos: filas bajas, añadir con aceptación y reemplazo por grupo · 2026-11-04

Acciones de fila reducidas a Antecedentes/Reemplazar en una línea con ancho inicial170 ajustable; azar/categoría quedan dentro de revisión y Quitar del grupo sigue en selección masiva. Detalle no parte la palabra. No se fuerza una altura que oculte los nombres/categorías. Selector de sustitutos limita la propuesta y búsqueda a Todos los grupos o grupo elegido; cambiarlo limpia pares incompatibles y errores, conserva validación por categoría y confirmación del intercambio con ambas revisiones. No se aplica filtro de país al intercambio organizativo. Top mantiene uso por país y simplifica etiqueta Todos los grupos.

Añadir diplomado abre confirmación con nombre/grupo; Cancelar no toca selección ni miembros. Aceptar añade solo al borrador y Guardar cambios persiste. Antecedentes omite solo fila sin país, uso, historia ni cifras; un registro material sin país conserva acceso y etiqueta Sin país registrado. No se borra información ni se añaden consultas de presentación/Graph.

Validación:289 unitarias,14 integraciones de reemplazo/administración, typecheck/build y7 recorridos Chromium con datos exclusivos. Fila simple <80px, dos botones alineados, añadir/cancelar/guardar, retiro pendiente local, filtro por grupo y categoría insuficiente, invalidación de sustituto fuera de alcance, intercambio aprobado con revisiones, Top, historial vacío/material y modal móvil. Snapshot físico PE/BO/HN idéntico, baseV1/G10.25 y campañaG42.55 conservadas; solo1 alta y1 intercambio guardados, catálogo5 y ciclos previos conservados. Fixtures retirados. Se corrigieron dos aserciones del arnés (esperar opciones renderizadas y dato sintético por período) y se repitió el recorrido completo con éxito. Hostinger real sin comprobación desde este entorno.


## Uso binario por país · 2026-11-04

Crear, Editar, catálogo y reemplazos comparten Usado (✓) desde12 horas registradas y Sin usar (—) por debajo del umbral o sin evidencia suficiente. Manual Usado/Sin usar prevalece; Automático restaura el cálculo. Se retiran interrogación, reloj, En prueba y Uso sin confirmar de esta vista. Filtro Todos solo reúne ambos estados; Sin usar primero mantiene prioridad. Preferencias antiguas TEST/UNKNOWN se muestran como Sin usar sin vaciar el selector.

Historial bruto conserva TEST/UNKNOWN y horas nulas para informes, sin modificar eventos, activaciones, hojas, vínculos, finanzas ni grupos. No se añaden lecturas ni Graph. Verificado con289 unitarias,27 integraciones, typecheck/build y5 recorridos Chromium: umbral, ambos overrides, AUTO, F5, reemplazo y filtros locales. Snapshot completo de hechos idéntico, solo5 correcciones manuales aprobadas en fixture; limpieza exclusiva completada. Hostinger real sin verificación desde este entorno.


## Proponer con aprobación y quitar solo pertenencia (2026-11-04)

Proponer al azar abre revisión local con nombres/categorías y cantidad, sin modificar selección hasta Aprobar propuesta; excluye IDs ya incluidos. Aprobar añade al borrador; Crear/Guardar persiste según flujo existente. Cancelar no cambia nada. Cuadro compacto con X, Cancelar y ampliación.

Quitar del grupo sustituye X por fila y acompaña Reemplazar seleccionados. Confirma nombres y explica que conserva diplomados/hojas/ventas/campañas/historial. Pendientes se retiran localmente; persistidos usan REMOVE_MEMBERS existente con revisión base y cierre de ciclos, nunca eliminación de catálogo. CAS obsoleto rechaza todo; acuse actualiza base/borrador y recarga solo metadatos guardados. No Graph ni API inventory/remove.

Cabeceras de todas las columnas quedan sticky en su scroll, con selector específico sobre regla genérica products-catalog, fondo opaco y esquina encima de nombres fijados. Desplazamiento real800px comprobado en normal/maximizado y controles del encabezado interactuables. Solo UI/CSS: sin migración de esquema ni cambios de endpoints.

## Guardar sin cerrar y destino de grupo en preparación (2026-11-04)

Crear/Guardar conserva diálogo y expansión, muestra el grupo guardado en Editar y permite continuar. Crear otro parte de borrador limpio/requestId nuevo. Pendiente por ref evita doble clic; si se confirmó la escritura y falló actualizar la vista, se informa y bloquea repetirla hasta recuperar directorio. Solo X/Cancelar cierra; F5 conserva la elección guardada.

Asignar a grupo ofrece nombre del borrador «En preparación» en acción masiva/celda, separado de guardados y disponible antes de guardar. Aceptar conserva IDs en memoria del borrador, sin API ni grupo persistido hasta Crear grupo; etiqueta sigue nombre y requiere nombre no vacío. Si el diplomado pertenece a otro guardado, se conserva y avisa: no se traslada silenciosamente a grupo inexistente. Elegir destino guardado desde celda confirma únicamente esa fila, independiente de otras selecciones. Servicios vigentes revalidan permisos, nombres y pertenencia al persistir.

## Último grupo seleccionado y navegación sin reiniciar (2026-11-04)

Crear/Editar comparten ventana estable, con borradores separados por vista/grupo en memoria. Crear no vacía la elección de Editar. Preferencias locales por usuario/lista guardan último grupo, pestaña y estado abierto/cerrado; F5 vuelve a los datos guardados autorizados, no a hechos financieros copiados del navegador. Un ID ya no disponible se descarta. Cerrar evita reapertura automática al recargar; abrir manualmente recupera la elección.

Navegación usa directorio cargado y mapas/memorias de catálogo/pertenencia/categorías; no GET ni Graph por cambiar pestaña. Documento/grupo actualizado entra automáticamente si el borrador estaba limpio; cambios pendientes mantienen su revisión base y CAS impide sobrescribir otros cambios. Mover/renombrar/reemplazar propios actualizan esa base, conservando incorporaciones/retiros pendientes no incluidos en la operación. Medición sintética local768×12/página50 reduce mediana417.5→361.7ms; no acredita latencia real de Hostinger.

## Editar grupos sin confundir selección y pertenencia (2026-11-04)

Casillas de trabajo son independientes de miembros/borrador; editar abre grupo completo desmarcado. Quitar selección/desmarcar no retira integrantes ni afecta Guardar. Añadir inventario y Proponer al azar incorporan al borrador sin sustituir existentes; nuevos quedan marcados y Ver seleccionados filtra explícitamente. Mis grupos/fijado abre edición directa sin listado pequeño duplicado; administrar por desplegable o ⋯/clic derecho, sin Eliminar grande ni Unificar dentro de grupos. Unificar duplicados se conserva en catálogo general. Detalle queda escrito debajo de ✓/— con nombre completo accesible del país.

POST inventory/trials MOVE_MEMBER requiere source groupId/revision, itemId, targetGroupId/targetRevision/since; bajo884411 valida ambos grupos de la misma lista y pertenencia exclusiva, conserva ciclos anteriores y no toca datos físicos. REPLACE_MEMBERS recibe grupo fuente, revisiones de todos los grupos afectados, pares itemId/replacementId/replacementGroupId, mode ANY/SAME/OTHER/DIVERSE y since. Cuadro local muestra ambos grupos y destino del saliente; solamente Aprobar escribe. Sin otra pertenencia el saliente queda sin grupo; con pertenencia se intercambian. Pares/revisiones/categorías/asignaciones se revalidan íntegramente antes de escribir; cambio concurrente bloquea, sin lote parcial ni reintento automático. Historial de ciclos se conserva. Uso registrado por diplomado/país, hojas, ventas, gasto, estados y campañas siguen al diplomado sin cambios ni Graph. Modelos existentes, sin migración de esquema; límite100 pares por aprobación.

Países de Grupos usan columnas compactas48px, encabezado abreviado3 letras con nombre completo accesible y símbolos ✓ usado/— falta usar; ◷ en prueba y ? desconocido conservan significado. Detalle ↗ y corrección manual siguen accesibles; anchos se pueden ajustar. Verificación Chromium con12 hojas configuradas confirma matriz completa sin scroll horizontal a1660px y cambio manual→AUTO sin tocar hechos.

## Grupos: asignar y unificar sin perder hojas (2026-11-04)

Crear conserva borrador/selección al buscar grupos/inventario, fijar o limpiar filtros. Pines son preferencias de usuario/lista en el navegador; no definen membresía. Fijar es opcional, X solo desfija; clic derecho/⋯ abre acciones accesibles. Editar grupos muestra grupos y matriz de uso por país (automático12h o corrección manual existente). Asignar a grupo agrega por ADD_MEMBERS con revisión, sin retirar miembros; otra pertenencia causa rechazo. Nombres activos equivalentes se rechazan en servidor bajo884411; CREATE idempotente se respeta. Eliminar grupo confirma ARCHIVE conservando diplomas/hechos/ciclos/publicidad. Eliminar diplomados ya no aparece en Grupos; solo la lista general conserva su confirmación. Quitar selección solo desmarca y está a la derecha.

POST inventory/unify-preview recibe listId/sourceIds/targetId exactos, exclusivo OWNER actual, sin consulta externa. POST inventory/unify requiere token y requestId UUID, bajo884411 con revalidación completa y recibo auditado para reintentos. Identidad física de alias/tabla/país/filas/estados/objetos no cambia: se normaliza el nombre al oficial, por lo que campañas vinculadas siguen automáticamente la identidad canónica con aliasId/country/advisor conservados. No se copian ni suman ventas/gasto. Metadatos compatibles de catálogo se conservan en oficial y las fichas origen se retiran solo después; grupos/ciclos y marcas manuales siguen el nombre oficial. Colisiones en hoja, temarios/categorías/uso contradictorios y pertenencias/ciclos incompatibles bloquean sin cambios parciales. Auditoría registra nombres previos, alias físicos, grupos y config anterior. No requiere migración de esquema; usa modelos existentes. Datos reales no unificados desde esta sesión, sin acceso a Hostinger.

## Efectividad: rendimiento de lectura y asociaciones (2026-11-03)

Las evaluaciones en segundo plano conservan los datos ya recibidos del mismo ámbito mientras actualizan. Cambiar columnas de países de una misma tabla usa la información ya cargada; cambiar de tabla/período o perder permisos exige lectura autorizada nueva. Las lecturas no toman el bloqueo reservado a guardados. El CAC reciente de las hojas carga sus14 días y mantiene la fórmula; el histórico completo se conserva en sus vistas. Recargas independientes tras editar se ejecutan en paralelo.

Se retiró el aviso grande de asociaciones; Revisar asociaciones conserva la inspección de registros/orígenes y las restricciones para casos no comprobados. Retirar el aviso no traslada fichas, cambia países ni borra ventas. Corregir registros de la instalación real requiere acceso autenticado a esa instalación.


## Sincronización por diplomado y país, sin repetir configuración (2026-11-03)

Desde una fila de Lista de Diplomados o una hoja, el cuadro toma diplomado y país del contexto. Asesor y moneda se recuperan al abrir; si solo hay un asesor guardado en Meta se sugiere sin cruzar países ni reemplazar historia. Las otras vistas usan el mismo registro canónico. Campañas es opcional en la lista: puedes guardar únicamente los datos de la ficha y vincular campañas posteriormente desde Meta Ads. Los vínculos existentes se muestran automáticamente y no hay que guardarlos otra vez.

Verde Sincronizado indica asesor/moneda configurados; ámbar Por sincronizar indica que falta completar/revisar esa configuración. No equivale a verificar que el gasto está al día. Si Meta y la hoja muestran asesores distintos se indican ambos orígenes y se confirma la propuesta, conservando titular/historial. Ventana compacta con Cancelar accesible, arrastre y botón para ampliar/restaurar.

El aviso de asociaciones de país compara registros adicionales country con la identidad de la hoja. AR es Argentina y PEN solo es moneda. Origen del aviso muestra tipo de registro, ID y código; no atribuye el dato a una importación ni verifica segmentación. Datos vacíos sin días ni vínculo Meta quedan bloqueados para traslado. Un país sin hoja verificada no crea una hoja automáticamente. Revisa el registro concreto antes de corregir; la fila visible puede estar correcta.


## Corregir asociación de país (2026-11-03)

En Lista de Diplomados → Asociaciones de país por revisar se ofrece Corregir asociación por fila y Corregir asociaciones de país para el lote. Solo OWNER actual. La revisión muestra diplomado, país guardado, origen y destino. Confirmar traslada los compatibles a su hoja del mismo país; si no existe se crea. No cambia el país ni presupone que el nombre visible de una hoja renombrada sea su identidad.

Conserva identidades de filas/estados y todos sus días/aprobaciones/eventos; Meta continúa vinculado por alias/país, sin alterar campañas ni gasto guardado. Los totales/bases manuales generales quedan en su hoja original. Si hay información material de destino que colisiona, activaciones/asignaciones incompatibles, varios destinos o columnas vinculadas, el caso queda en revisión sin sobrescribir. La vista previa es solo lectura; confirmación valida de nuevo permisos/datos bajo bloqueo y conserva recibo para reintentos. No se ejecuta al cargar la página. Etiquetas de países reconocidos no repiten nombre por tildes/mayúsculas; no se fusionan datos por cambiar una etiqueta.


## Filas por página y actualización sin Ctrl+F5

El pie indica cuántas campañas, conjuntos o anuncios hay en la página actual, el total y el número de página. Escribe de1 a100 en Por página y pulsa Aplicar o Enter; se guarda para ese usuario y conserva filtros/selección. Cambiarlo no descarga todo Meta. Las consultas recientes se mantienen en turnos de hasta25 elementos.

Mientras el análisis está abierto, se aprovecha la comprobación de progreso para detectar cambios en los datos guardados. La tabla se actualiza sola cuando cambia esa versión, sin necesitar Ctrl+F5 ni volver a consultar el catálogo. El resumen conserva sus cifras mientras llega la nueva lectura del mismo ámbito. Los filtros de fechas/cuentas siguen definiendo qué datos se muestran.

Si hay ventas en30d pero no están registradas en7d, se muestra esa explicación; el CAC de7d continúa sin valor hasta disponer de ventas de su propio período. No se sustituyen por ventas de otra ventana ni se convierten ausencias en cero.


## Conservar informes al recargar o cambiar de página

La confirmación de un informe reciente se conserva por campaña, conjunto o anuncio dentro de su mismo período y credencial. Consultar otra página no vuelve a poner pendientes las filas ya completadas. Cada una conserva su hora real; cambiar la credencial o pasar al día siguiente requiere la comprobación correspondiente.

Los importes se leen de los datos guardados, no de estas confirmaciones. Un informe realmente pendiente continúa identificado y las ventas ausentes no se convierten en cero. El CAC reciente necesita ventas registradas en ese mismo período; tener ventas en30d no permite calcular automáticamente un CAC de7d sin esas ventas.


## Conexión pendiente y autorización rechazada

Un token guardado que aún no terminó su verificación puede comprobarse con el informe reciente de los elementos visibles. No es necesario recorrer todas las cuentas para esa lectura. La conexión se marca verificada únicamente tras recibir correctamente el informe, conservando la revisión y permisos vigentes.

Si el aviso procedía de una verificación local pendiente, el sistema vuelve a comprobarlo de forma acotada. Si Meta rechaza realmente la autorización, el aviso muestra HTTP/código y se detienen los reintentos de esa conexión hasta renovar la credencial. HTTP401 o código190 requieren reconectar mediante Facebook; una fecha de caducidad futura no descarta revocación. No se borra el gasto guardado ni se presenta como cero.

Esta lógica es común para todas las cuentas, incluidas las principales y las secundarias cuando solicites su actualización. Una conexión rechazada no debe generar peticiones cada segundo por tener una hora de reintento antigua.


## Principales automáticas; secundarias a voluntad

Las cuentas marcadas Cuenta principal y con sincronización habilitada reciben actualizaciones automáticas. Las secundarias conservan sus informes e histórico, pero se consultan cuando pulses Actualizar. Entrar en una secundaria, volver a la pestaña o dejarla abierta no activa un refresco periódico. Si la marcas como principal, pasa al ámbito automático compartido.

Una importación que solicites expresamente de una secundaria puede continuar en segundo plano hasta completar su ciclo y después se detiene. No reinicia ciclos periódicos. Actualizar vista puede consultar solo los estados/informes recientes visibles; Actualizar catálogo e histórico mantiene su alcance explícito. Estos controles afectan a la importación de datos del sistema, no a la entrega de anuncios en Meta.

Ventas, gasto por período y evaluación se calculan con registros guardados: mostrar esas columnas no vuelve a descargar todo Meta. Los datos se actualizan con las lecturas recientes y la sincronización autorizada.


## Consultas de estados y gasto

El gasto de hoy/ayer se sigue actualizando en cada ciclo visible. Los estados que ya confirmó el fondo o un refresco hace menos de dos minutos se reutilizan con su hora original; los estados faltantes o más antiguos se comprueban otra vez. Comprobar Meta fuerza la comprobación explícita. Consultar gasto no convierte un estado antiguo en recién verificado.

Un envío agrupado de estados contiene un GET por cada elemento; por eso repetirlo para25 filas podía consumir más cuota de lo que aparenta una sola petición HTTP. Los sondeos de progreso consultan nuestra base de datos, no Meta. Las cuentas pueden compartir límite por conexión/usuario; una pausa común no prueba que todas estén descargando su histórico. El origen exacto de un límite requiere su código y registro del servidor.


## Recuperar una pausa guardada

Si aparece Meta en pausa, Comprobar Meta permite comprobar una vez los estados y el gasto de hoy/ayer de la página visible. Sirve para recuperar esperas antiguas retenidas por la app sin reiniciar catálogo o histórico. Si Meta responde, se actualiza la tabla; si rechaza la consulta, se muestra la nueva espera. No se borran ventas, vínculos ni anuncios.

La comprobación explícita se limita por conexión/ámbito compartido: espera al menos un minuto tras un límite y no permite liberar otra pausa interna durante15min. Los plazos explícitos Retry-After recibidos desde esta versión se respetan. No se puede deducir retrospectivamente si una pausa antigua procedía de un Retry-After o del cálculo anterior; el botón realiza una comprobación limitada y no garantiza disponibilidad. Los refrescos automáticos nunca pulsan esta recuperación.


## Actualización reciente y pausa de Meta

Actualizar vista consulta hoy y ayer de los elementos visibles, sin esperar a descargar el histórico. Si Meta limita las consultas, el botón indica Meta en pausa y el símbolo ⓘ muestra cuándo se intentará de nuevo, con hora Lima. Ordenar, buscar o volver a la pestaña no interrumpe esa pausa. Los valores guardados se conservan; un informe pendiente no significa gasto cero. Meta puede entregar métricas con retraso.

Mientras se consulta una página, el histórico de cuentas que comparten credenciales cede prioridad temporalmente; conserva su avance. Los nuevos límites sin plazo explícito usan espera gradual1–15min; se respeta un plazo mayor informado por Meta y no se borra una pausa vigente.

Para cambiar el nombre de una hoja, haz clic derecho en su pestaña y elige Editar nombre. El nombre visible no cambia sus vínculos Meta ni el país original de la hoja, sus diplomados o sus ventas. El campo superior Nombre de tabla se retiró para evitar ediciones accidentales. Renombrar Perú como Uganda no transforma los registros peruanos en ugandeses ni cambia segmentación publicitaria.


## Ampliar Lista de Diplomados y ajustar columnas de reemplazo

En Lista de Diplomados → barra de acciones, Maximizar inventario amplía toda la tabla con sus encabezados, áreas/categorías, grupos, países y demás columnas. Restaurar, minimizar, cerrar o Escape devuelven el catálogo a su vista habitual conservando selección, filtros, borradores y desplazamiento. Ampliar no vuelve a consultar el inventario.

En Reemplazar diplomado, arrastra la división del borde derecho de cada encabezado para cambiar su ancho; con el control enfocado, las flechas ajustan y Shift acelera. Doble clic o Inicio restablecen el ancho inicial. Los anchos quedan guardados para ese usuario y lista, incluso tras cerrar/reabrir. La cuadrícula separa las celdas y los nombres largos ocupan varias líneas dentro de su columna. Ajustar anchos no cambia estados, ventas ni decisiones de reemplazo.


## Buscar diplomados sin repetir filas

En la hoja, marca diplomados y pulsa Buscar (acción resaltada). Agregar es secundaria: solo incorpora los que faltan en esa hoja y país; si ya existen todos, queda deshabilitada y explica que uses Buscar. Si seleccionas existentes y nuevos, envía únicamente los nuevos. Usa el país filtrado o el predeterminado de la hoja; se mantiene la protección de unicidad del servidor y los estados existentes. No agrega al escribir ni al buscar.

Al desplazar horizontalmente, nombre y país fijados permanecen por delante del asesor para que no tape el texto ni intercepte sus clics. En análisis de ventas, Menor a mayor muestra primero los ceros confirmados, después sin registros (—) y luego positivos. El guion sigue indicando ausencia de datos. Titular y apoyos tiene Cancelar rojo al principio y al final, sin guardar cambios al cerrar.


## Menú Estado y actualización eficiente

El botón Estado junto a CAC abre un menú con Mostrar estado (Todos, Crítico, Grave, Revisar, Sin ventas, Normal y Datos pendientes) y dos órdenes: Crítico → Normal o Normal → Crítico. El orden de criticidad es Crítico, Grave, Revisar, Sin ventas, Normal; pendientes al final. El filtro considera todas las campañas del ámbito antes de paginar y actualiza el resumen para las campañas mostradas. Se conserva la misma ventana de evaluación indicada por campaña.

Cambiar únicamente orden o página conserva el resumen del mismo ámbito, evitando recalcularlo y evitando parpadeos de los contadores. Fechas, filtros, cuentas, selección y actualización de datos invalidan esa reutilización; no se retienen métricas con TTL. Las lecturas de ventas para evaluar candidatos son agrupadas y acotadas a la ventana reciente, sin nuevas llamadas Graph. La posición de la página y del desplazamiento horizontal se conserva al ordenar y al reducir resultados.


## Fila compacta de Rendimiento

Se retira el filtro superior Evaluación y sus valores previamente guardados dejan de aplicarse en Rendimiento. Evaluación · estado de cada campaña y los botones de orden CAC/Estado se mantienen; la sección Alertas conserva su propio ámbito. Los demás controles aprovechan el espacio disponible. En escritorio amplio, resumen, fecha y acciones quedan en una fila compacta con Asignar inventario al final, después de Sincronización. En móvil se adaptan al espacio disponible.


## Ordenar por CAC o estado

Junto a Desde el inicio, las campañas ofrecen CAC y Estado con flechas para alternar el sentido. El orden considera todas las campañas filtradas antes de paginar y usa el período indicado en Evaluación · estado (la misma regla de ventana reciente). CAC se ordena numéricamente dentro de cada moneda. Estado asciende Normal → Sin ventas → Revisar → Grave → Crítico y se invierte al volver a pulsar. Valores pendientes y ventas compartidas sin CAC individual quedan al final; no se convierten en cero.

Asignar inventario está junto a Sincronización en la fila de actualización. Mantiene los elementos seleccionados y permisos existentes. Tabla y tarjetas comparten el orden, que se recuerda al recargar. Estos órdenes usan ventas locales agrupadas y limitadas al período de evaluación; no solicitan todo el histórico de Meta ni consultan por cada campaña.


## Comparar ventas y gasto por día

En campaña → Ver detalle, el histórico usa un único gráfico: ventas por día en barras (izquierda) y gasto Meta por día en línea (derecha). Ambos selectores permiten ventas, resultados, gasto Meta y costo por resultado diarios; cambiar ejes reutiliza los datos descargados. El calendario conserva el rango elegido y consulta solo el período solicitado; por defecto se ofrecen siete días cuando no se recibe un rango inicial. El gasto del resumen corresponde al total del período y se etiqueta como tal.

Las fechas sin registro de ventas muestran Sin dato, distintas de cero ventas registradas; se incluyen fechas que solo tengan ventas. El asterisco señala ventas parciales. Las ventas compartidas se identifican y no representan atribución individual. Anuncios y conjuntos no muestran ventas propias. Las otras gráficas que reutilizan el componente mantienen sus etiquetas y unidades.


La primera entrega amplía la plataforma existente: Meta Ads en el menú lateral, tres niveles, tarjetas/tabla, cinco periodos simultáneos, calendario opcional, ranking con mínimo de resultados, alertas explicables y detalle de gasto diario. Solo lectura publicitaria: no publica, pausa ni cambia presupuestos. No llama a modelos de IA. La infraestructura y los servicios externos mantienen sus propias condiciones y límites.

## Conectar Marketing API

Como OWNER, abre Meta Ads → Conexiones → Mi app · Marketing API. Crea/configura tu app en Meta, solicita `ads_read` y acceso a las cuentas que administras; `business_management` puede ser necesario para determinados accesos empresariales. La revisión/verificación depende de Meta y del tipo de uso. El módulo no crea una app de Meta en nombre del usuario ni sustituye esa autorización.

Guarda nombre, versión Graph compatible con tu app, ID de app opcional y token de acceso. La versión inicial del formulario es v23.0, no una afirmación de ser la versión más reciente: se puede cambiar antes de guardar. Nunca enviar tokens por chat, Git ni logs. Pulsa Verificar y traer cuentas. La verificación comprueba lectura de cuentas; sincronizar comprueba los campos de objetos/estadísticas.

## Conectar mi propia app con Facebook (OAuth de Marketing API)

En OWNER → Meta Ads → Conexiones → Mi app · Marketing API, el modo **Autorizar con Facebook** permite una conexión nueva. Si ya existe PULPO ANALISIS Y AUTO, utiliza su tarjeta → **Conectar con Facebook · configuración OAuth de mi app** para mantener el vínculo de las cuentas y el histórico.

Guarda el ID y la clave secreta de la app desde Meta for Developers → Configuración básica, usando únicamente el campo PasswordInput protegido de la plataforma. El secreto se cifra en el servidor con contexto por conexión y no vuelve al navegador. No compartirlo por chat ni guardarlo en Git. Si la app exige Facebook Login para empresas, crea una configuración de **token de usuario** con ads_read y pega su ID opcional; no confundirlo con appId/cuenta publicitaria. No requiere Vercel Connect ni otra cuenta intermediaria y funciona también en el VPS.

Registra estas URI exactas en **Facebook Login → Configurar → URI de redireccionamiento OAuth válidos**:

- `https://generator.agenciamagneto.org/api/meta/marketing/oauth/callback`
- `https://creadordeimagenes-three.vercel.app/api/meta/marketing/oauth/callback`

Se pueden registrar ambas. Cada instalación utiliza la correspondiente a su APP_ORIGIN. En el VPS: `APP_ORIGIN=https://generator.agenciamagneto.org`; en Vercel: `APP_ORIGIN=https://creadordeimagenes-three.vercel.app`. Sin ruta, query o fragmento. La plataforma muestra la URI efectiva y bloquea autorización desde otro dominio. Una base compartida no sustituye una configuración de origen correcta; no se modificaron variables reales del VPS desde este entorno.

Ajustes de la pantalla de Facebook Login: inicio de sesión del cliente OAuth Sí; OAuth web Sí; HTTPS Sí; modo estricto de URI Sí. No se utiliza SDK de JavaScript, dispositivos o navegador integrado: dejar esas opciones No y dominios del SDK vacíos. Forzar reautenticación es opcional, no necesario para este flujo. La URL de autorización cancelada (deautorización programática) y la de solicitud de eliminación programática permanecen vacías: este cambio no implementa esos callbacks firmados. En Configuración básica, eliminación de datos usa **URL de instrucciones** con `/eliminacion-de-datos`, no el callback OAuth.

El validador de URI solo comprueba una dirección; no sustituye registrarla y guardar la lista de URI válidas. Abrir manualmente el callback sin state/código produce un error controlado: se utiliza regresando de la autorización iniciada por OWNER desde la plataforma.

El flujo usa código confidencial con App Secret, state de un uso y vinculación a navegador/sesión/revisión; no presume PKCE ni reutiliza cliente MCP. Intercambia un token de larga duración mediante el endpoint oficial, verifica identidad, permiso ads_read y consulta mínima de cuentas antes de sustituir la credencial. Después importa todas las páginas autorizadas antes de mostrar Acceso verificado. Solo consulta Meta, sin anuncios de prueba ni cambios en campañas. Se conserva un error específico y saneado ante rechazo. Denegar antes de guardar mantiene la credencial anterior.

Caducidad: se guarda la que Meta devuelva y se muestra en la tarjeta; si no se informa, se indica No informada. Un token de larga duración también puede vencer/revocarse y no dispone de una renovación perpetua: usa Reconectar con Facebook. Sesión revocada o app/credencial modificada durante el intercambio bloquean persistencia tardía. Roles elevados y asignaciones permanecen independientes de la identidad de Facebook. App en desarrollo y acceso de terceros siguen sujetos a las reglas y revisión de Meta.

Verificación propia: Meta está bloqueado por política de red en este entorno. Las pruebas usan dobles explícitos y base sintética exclusiva; no acreditan que la app real tenga acceso avanzado ni completan su revisión. La autorización real requiere que el usuario registre la URI, guarde sus credenciales oficiales y acepte el consentimiento en Facebook.

## Conectar MCP con OAuth

Como OWNER, entra en Meta Ads → Conexiones → Conexión MCP y pulsa **Conectar con Meta**. No hace falta copiar un token. La plataforma crea una conexión pendiente y consulta metadatos públicos del destino fijo `https://mcp.facebook.com/ads`. No abre una URL inventada ni considera ese intento una conexión exitosa.

Se comprueban recurso, emisor, endpoints oficiales previstos, PKCE S256 y compatibilidad con cliente público. Se usa documento público de cliente (CIMD) solo si Meta lo anuncia; de lo contrario, registro dinámico cuando Meta lo permite. Si exige cliente preaprobado, coloca su ID en «Cliente OAuth registrado · avanzado» de la conexión. No copies IDs de Claude/ChatGPT ni confundas un ID de app Graph con un cliente MCP autorizado. No se omiten errores de emisor o de registro.

URLs de esta plataforma:

- Retorno: `https://creadordeimagenes-three.vercel.app/api/meta/oauth/callback`
- Documento público de cliente, sin secretos: `https://creadordeimagenes-three.vercel.app/api/meta/oauth/client`

Meta debe admitir el cliente y esa URL de retorno. Publicar el documento no obliga a Meta a aceptarlo. Clientes que exijan secreto o métodos distintos a cliente público PKCE no están admitidos en este flujo. No se pide el secreto de tu app para aparentar compatibilidad.

Al regresar se comprueban sesión OWNER vigente, navegador, estado de un uso, revisión de conexión y emisor; se intercambia el código en servidor y se conserva el token cifrado. A continuación se inicia una sesión MCP, se descubre el catálogo de lectura y se consultan las cuentas accesibles. **Solo después de esas consultas exitosas se marca Acceso verificado.** Un token recibido/guardado permanece sin verificar si Meta rechaza la lectura. Una respuesta real sin cuentas no inventa cuentas ni habilita sincronizaciones. No se publican ni cambian campañas, anuncios o presupuestos.

El token manual queda en Configuración avanzada y se verifica al guardarlo. Debe estar emitido para ese servidor MCP; no existe aquí un token universal. No se asume que un token de otro cliente, una suscripción de chat o una clave de OpenAI sean válidos. Sesión revocada durante el intercambio o modificación de credenciales bloquean respuestas tardías. Un fallo vuelve a indicar conexión no verificada, sin mostrar códigos/tokens ni una pantalla falsa de éxito.

### Si Meta no admite OAuth para este cliente

Necesitas un cliente OAuth público **oficialmente admitido por Meta para el MCP**, con PKCE S256 y la URL de retorno registrada, o una credencial MCP emitida por su proceso oficial. No se puede fabricar una identidad autorizada ni utilizar credenciales de otro asistente. Si Meta no ofrece ese registro para tu caso, conserva la conexión pendiente o desconéctala y utiliza **Mi app · Marketing API**.

Para Marketing API necesitas tu propia app de Meta habilitada para acceso publicitario, token de usuario o usuario del sistema con `ads_read` y acceso a las cuentas correspondientes; `business_management` cuando el tipo de acceso empresarial lo requiera. Revisión de app, roles y verificación del negocio dependen de Meta. Configura versión Graph compatible e introduce el token solo en el campo protegido; pulsa Verificar y traer cuentas. No compartas contraseña, token ni App Secret por chat o Git. En la alternativa manual, el ID de app es informativo/opcional y no sustituye los permisos del token; en OAuth propio es obligatorio junto con su clave secreta.

### Resultado de esta verificación

El entorno de desarrollo mantiene una política de red que bloquea los dominios Meta. **No se ha completado una autorización real contra Meta ni se confirma que admita este cliente concreto.** Se verificaron código, metadatos, flujo y rechazos con dobles explícitos en una base local exclusiva. La comprobación real se hace desde el servidor de la plataforma al pulsar el botón y requiere la autorización del OWNER en Facebook; nunca se simula éxito en producción.

Se consultaron reportes de reproducción de los clientes oficiales: [registro rechazado en Codex](https://github.com/openai/codex/issues/24103), [inconsistencia de emisor reportada en Codex](https://github.com/openai/codex/issues/38944) y [retornos no registrados en Claude Code](https://github.com/anthropics/claude-code/issues/55002). Son incidencias de esos clientes y fechas, no prueba del estado actual de Meta ni garantía de disponibilidad. Por ello el botón valida la respuesta actual y ofrece Marketing API si no es compatible.

El catálogo real puede no ofrecer los nombres, esquemas o métricas requeridos. La aplicación solo admite herramientas compatibles de lectura y resultados estructurados; no usa herramientas de publicación o ejecución genérica, ni IA para interpretar respuestas. Verificar cuentas no demuestra compatibilidad con todos los insights.

## Cuentas y roles

Las cuentas tienen identidad única, aunque se descubran por varias conexiones. Se conservan los orígenes verificados y OWNER puede escoger la conexión preferida de cada cuenta. Un cambio no duplica el histórico. Una verificación pendiente o credencial sustituida bloquea la sincronización.

OWNER gestiona conexiones, umbrales, habilitación y accesos. ADMIN solo consulta cuentas asignadas y sincroniza cuando se le concede ese permiso específico. USER/OBSERVER solo consultan cuentas asignadas, incluidas sus métricas de gasto publicitario. No concede acceso a proyectos ni a la configuración/costos de IA. Quitar una asignación bloquea inmediatamente nuevas consultas de panel, detalle y datos diarios. Desconectar conserva el histórico para OWNER y detiene sincronizaciones; otros usuarios no acceden mediante la conexión retirada.

Habilita una cuenta, elige resultado principal cuando el objetivo sea ambiguo, define costo objetivo en su moneda y mínimo de resultados. Sin umbral no se etiqueta un costo como bueno/crítico por inventar un valor universal.

## Datos, periodos y límites

Hoy,7,15,30días y desde inicio se muestran juntos; N días incluye hoy y N−1 anteriores, según la zona horaria de la cuenta. El calendario opcional no reemplaza esos comparativos. El costo se calcula con gasto agregado/resultados compatibles; nunca promediando costos diarios. Conversaciones iniciadas, leads y compras usan sus tipos propios y no se suman acciones alternativas duplicadas. Objetivos ambiguos quedan no identificados hasta elegir un resultado o disponer de configuración suficiente.

Atribución explícita común en esta entrega:7d_click+1d_view, por fecha de impresión. Para contrastar con Ads Manager, seleccionar la misma atribución y zona horaria. No se presenta como la configuración automática de todas las cuentas. No se suman monedas diferentes ni alcance único diario. Hoy puede ser parcial; la tendencia usa dos ventanas completas de7días sin solapamiento. Los rankings exigen el mínimo de resultados del periodo elegido y separan moneda/tipo de resultado.

Primera/última circulación son las primeras/últimas fechas **conocidas** de gasto o impresiones. No se sustituye circulación por creación. Antigüedad inclusiva en días calendario; días activos solo a partir de actividad diaria importada. El histórico se marca parcial/disponible porque la API puede limitar el pasado recuperable. No implica acceso a toda la vida del anuncio. Reconciliación de35días recientes reemplaza valores y retira filas que dejaron de aparecer al completar cada nivel; una respuesta incompleta no elimina estadísticas.

El ranking está acotado a10.000objetos por selección y lo informa cuando se supera; usar filtros para acotar. Exportación CSV de la página actual. La vista de detalle incluye tabla y barras de gasto diario de los últimos30días; no inventa días ausentes. Personalización extensa de columnas, XLSX, una puntuación0–100 validada y publicidad/automatizaciones de escritura quedan para una etapa posterior, sin botones que aparenten publicarlas.

## Segundo plano

Workflow durable reclama páginas por cuenta mediante lease y comparación de token/revisión, con pausa entre consultas. Persiste cursor y fase, sin conservar URLs con tokens. La primera importación solicita el máximo histórico que Meta ofrezca; siguientes lecturas actualizan35días. Un error conserva resultados previos y aplica espera antes de reanudar. Cambiar conexión, deshabilitar o revocar al propietario impide publicar respuestas tardías.

Sincronizar ahora despierta un workflow dormido; no depende de dejar una pestaña abierta. Worker persistente también toma trabajos vencidos. El cron existente de mantenimiento recupera programadores sin añadir una frecuencia incompatible al cron del alojamiento. Intervalo solicitado15–1440min; el real depende de cuotas, disponibilidad y ejecución del alojamiento. No afirmar15min garantizados en un despliegue no comprobado. `APP_ORIGIN` debe ser el dominio público correcto para OAuth.

## Verificación

Unitarias con fetch simulado para Graph/MCP/SSE y cálculos; integración HTTP/PostgreSQL exclusiva para roles, cifrado, cuentas duplicadas, actualización incremental, ceros, histórico y OAuth de un uso. Prueba Workflow local sin autorización comprueba rechazo antes de llamadas externas. Browser usa exclusivamente datos sintéticos en la base local, nunca los publica como estadísticas reales.

Frescura diaria: si la última importación completa es de otro día de la cuenta, la tarjeta avisa Datos atrasados, Hoy no se declara sin actividad y el ranking la excluye hasta actualizar. Los valores históricos siguen disponibles con fecha; no se convierten en una prueba de eficiencia actual.

## Diagnosticar «Verificar y traer cuentas» en Marketing API

Cada tarjeta API muestra su versión Graph persistida. La versión del formulario para una conexión nueva no actualiza conexiones anteriores. Si Explorer funciona con v26.0, introduce v26.0 en «Versión Graph guardada» de esa conexión y pulsa «Actualizar versión sin cambiar token»; luego «Verificar y traer cuentas». No es necesario borrar la conexión ni reemplazar su token por ese cambio. Nuevas conexiones parten de v26.0, versión confirmada por el usuario, sin afirmar que sea siempre la versión más reciente.

El primer paso es GET https://graph.facebook.com/{versión}/me/adaccounts?fields=id,name&limit=100. El token descifrado solo se envía en Authorization: Bearer, jamás en la URL. Si funciona, se consultan id,name,currency,timezone_name; después id,name,account_status y finalmente id,name,business{id,name}. Moneda/zona son necesarias para almacenar estadísticas fiables. Estado/business son opcionales: fallos compatibles de campo/permiso se informan sin impedir la importación; un error de token, cuota u otro fallo no se encubre como éxito. La paginación se reconstruye por cursor sin reutilizar URLs del proveedor. MCP conserva su contrato de lectura previo.

Los fallos muestran versión, endpoint, campos, HTTP, código, subcódigo y mensaje saneado de Meta. El registro estructurado meta_graph_error y la auditoría META_CONEXION_ERROR no contienen el token, cabeceras, URLs completas ni respuestas crudas. Se conservan conexión, token e histórico ante un error; guardar una credencial no equivale a verificarla. Si el mínimo funciona pero falla una ampliación necesaria, el mensaje lo distingue explícitamente. Solo ads_read/acceso a las cuentas se requiere para el mínimo; no se exige business_management para acreditar esa consulta.

Caso PULPO META ADS: la implementación anterior mezclaba campos opcionales en la primera solicitud, usaba v23.0 como valor inicial y descartaba el detalle de errores HTTP. Explorer del usuario funcionó con v26.0. Estas diferencias están comprobadas en código, pero no demuestran por sí solas cuál causó el rechazo real. No se dispone del cuerpo histórico ni acceso directo Meta en este entorno. La siguiente verificación publicada devolverá el diagnóstico concreto; comparte solo código/subcódigo/mensaje visible saneado si persiste, nunca el token. No se modifican ni publican campañas/anuncios durante estas comprobaciones.

Aclaración por capturas posteriores del usuario: la llamada visible es /me?fields=id,name (perfil), no /me/adaccounts?fields=id,name; por tanto esa captura no acredita ads_read ni acceso a cuentas. App PULPO ANALISIS Y AUTO sin publicar, permisos Listo para la prueba y contadores vacíos no prueban concesión en el token. Se añadió ayuda desplegable para roles aceptados, acceso de usuario a cuentas, app/token correctos y consulta publicitaria mínima. Pruebas propias pueden ser viables en desarrollo; usuarios externos quedan sujetos a publicación/revisión/verificación que Meta exija. No se accede al panel Meta autenticado ni se rellenan datos legales ficticios, no se confunde callback MCP con Facebook Login ni se generan500 llamadas artificiales para elevar el acceso.

## Varias conexiones y errores durante el guardado

Las tarjetas representan conexiones guardadas independientes; crear otra no reemplaza la anterior. Usa Eliminar conexión en la tarjeta que quieras retirar. La confirmación explica que se quita su token y se desactiva su sincronización, conservando cuentas/histórico y las demás conexiones. Las retiradas quedan ocultas inicialmente y se pueden consultar con Ver conexiones retiradas. Si una cuenta tenía como fuente principal la conexión retirada, selecciona una fuente alternativa verificada en Cuentas publicitarias antes de habilitar su sincronización; no se cambia silenciosamente de credencial.

La importación se guarda en bloques de10, con operaciones agrupadas y timeout explícito30s, para evitar el límite predeterminado5s de una transacción con muchas consultas remotas. Cada bloque revalida permisos/revisión; una importación parcial no acredita verificación completa. Los errores internos muestran el paso (lectura, validación, guardado o confirmación), código reconocido y referencia. Se conserva el historial sin registrar mensajes crudos del driver, que podrían contener consultas o secretos. El error de Meta mantiene sus propios código/subcódigo saneados. Refrescar la tarjeta tras un fallo no repite la consulta externa.

La captura con No se pudo verificar la conexión con Meta corresponde al antiguo fallback de excepción interna; no demuestra rechazo del token. El problema de transacción5s está identificado en código y probado con demora sintética, pero no se atribuye a producción sin diagnóstico real. No es necesario borrar ambas conexiones ni reemplazar un token que funciona para resolver un fallo interno.

## Encontrar tus cuentas y ordenar los resultados

Cuentas autorizadas enumera las devueltas por /me/adaccounts para el usuario del token, incluidas cuentas compartidas, no solo las del negocio que posee la app. No consulta el catálogo de WhatsApp. Para confirmar una cuenta, compara su ID act_ con Ads Manager: el nombre puede repetirse. Busca por nombre, ID con/sin act_ o negocio conocido tanto en Cuentas publicitarias como en el selector de Rendimiento; cambiar la búsqueda no retira selecciones. La gestión muestra25 cuentas por página.

Con gasto30d y Con campañas activas usan estadísticas/estados ya importados. Requieren la última importación completa del día local; las no sincronizadas, en curso o atrasadas aparecen en Sin datos actuales. Sincronización habilitada muestra las cuentas configuradas para importar. Un filtro vacío no significa que Meta confirme inactividad: incluye Toda la actividad, busca tus IDs y habilita/sincroniza únicamente las cuentas elegidas. Se calcula gasto de los últimos30 días inclusivos en la moneda propia y solo con filas de campaña en la atribución común, sin sumar otra vez conjuntos/anuncios.

Si falta business_management, puede faltar la agrupación por negocio: se informa sin inventar pertenencia ni bloquear búsqueda por ID. La app no descubre esa agrupación a partir de nombres. El permiso opcional denegado se omite en siguientes páginas de la misma verificación, con un solo aviso.

Ordenar por costo son botones de acción Hoy/7/15/30/Desde el inicio: un clic ordena menor primero, otro invierte. Las cinco métricas permanecen en cada tarjeta y no se filtran por el botón elegido. El calendario es opcional y conserva su propio botón; también permanecen órdenes por creación/antigüedad. Los costos de monedas/resultados distintos no se mezclan y los no disponibles quedan al final. Buscar o cambiar orden no consulta Meta ni usa IA.

Ajuste por nuevas referencias visuales: periodo de análisis separado del orden, con resumen de gasto/resultados/costo correspondiente y fechas de esa ventana. Cada tarjeta conserva sus cinco comparativos y añade cabecera de estado legible, jerarquía, primera circulación conocida y antigüedad. Evaluación mantiene colores discretos y explicita que usa7días/objetivo/volumen; no se inventan recomendaciones automáticas. Cambiar negocio limpia filtros descendientes y sus opciones se restringen a cuentas elegidas. El selector rápido de periodos usa datos ya recibidos; calendario conserva rango personalizado independiente.

Búsqueda por palabra permanece visible en Rendimiento/Ranking/Alertas y conserva texto al cambiar Campañas/Conjuntos/Anuncios. Coincidencia parcial del nombre sin distinguir mayúsculas, mediante consulta autorizada y debounce200ms; busca todo el nivel, no solo la página visible. No se sustituye por un desplegable ni se sincroniza Meta al escribir.

## Conservar selección y ver la importación

Las preferencias de Meta Ads se recuerdan por usuario en este navegador: cuentas, búsquedas de cuentas y palabras, nivel, sección, filtros, calendario/periodo, orden y vista. No se guardan credenciales ahí; cada lectura revalida acceso. Un ID que ya no está autorizado sale de la selección. Los ajustes de una cuenta (habilitación, resultado, objetivo e intervalo) se guardan en el servidor con Guardar cuenta; elegir un valor sin guardar no lo cambia para una recarga.

Automático · detectar tipo de resultado intenta identificar el resultado compatible de la campaña/conjunto. No equivale a sumar todos los objetivos. Si es ambiguo muestra resultado no identificado. Para analizar mensajes en esa cuenta selecciona Conversaciones iniciadas y guarda; para otros objetivos elige el tipo correspondiente o detección automática. Monedas/tipos distintos no se mezclan.

Sincronizar ahora comprueba una primera página inmediatamente, y continúa la importación durable en segundo plano. Las etapas son campañas, conjuntos, anuncios y resultados diarios de cada nivel. La barra cuenta etapas completas, páginas y registros recibidos; no es un porcentaje de bytes ni una estimación de páginas totales. En cola, error y sin avance reciente se distinguen de completado. Errores Graph o códigos internos seguros aparecen en la cuenta; los datos previos se conservan. Recargar no reinicia ni duplica la solicitud.

El progreso se consulta automáticamente mientras la pestaña está visible (5s importando,30s en reposo), mediante lectura local autorizada sin llamadas Meta/IA. Al completar una importación nueva se actualizan catálogo y tarjetas sin recargar manualmente. Puede cerrarse la página: el Workflow sigue siendo el ejecutor, sujeto a disponibilidad del alojamiento. Si el ejecutor no confirma avance se indica; solicitar sincronización manual comprueba otra página bajo lease sin duplicar un trabajo activo.

#### Continuar una sincronización detenida

Durante una importación pendiente, con error o sin avance reciente, el botón de la cuenta muestra **Continuar sincronización**. Conserva el cursor, la etapa, los contadores y los datos importados; consulta primero la página pendiente y continúa mediante Workflow. Ante error o atasco se sustituye el ejecutor detenido, sin reiniciar el histórico. Si una página ya está procesándose, se informa y se conserva su lease. **Reimportar histórico** sigue siendo una acción distinta y confirmada que vuelve a consultar el historial disponible. La continuación no corrige por sí sola permisos/token/cursor inválidos: cualquier nuevo error se muestra y el avance previo se conserva.

#### Token actualizado y errores anteriores

Reemplazar token invalida el lease y ejecutor previos de las cuentas vinculadas y retira su error, conservando el cursor y los datos. La conexión vuelve a Pendiente de verificar. Pulsa **Verificar y traer cuentas** en esa misma conexión y después **Continuar sincronización**; guardar no prueba que Meta acepte la credencial. Los ejecutores no arrancan con conexiones sin verificar. Una respuesta tardía de la credencial anterior no puede sobrescribir el estado nuevo. La tarjeta indica la conexión utilizada, su revisión y fecha/revisión del último intento; son metadatos sin contenido del token. Si actualizaste otra conexión, la cuenta conserva su conexión explícita hasta cambiarla con una fuente verificada. No es necesario generar otro token solo porque aún ves un error de un intento anterior.

### Importación rápida por periodo (Marketing API)

Las nuevas importaciones API empiezan por los últimos30 días locales, no por el catálogo completo ni estadísticas diarias `maximum`. En Cuentas publicitarias se puede elegir30/90/180 días y pulsar **Sincronizar periodo seleccionado**. Esta acción sustituye el cursor pendiente, conservando las credenciales, objetos, estadísticas anteriores y fecha de la última importación completa. Una página con lease vigente rechaza el cambio hasta finalizar. Continuar sincronización mantiene exactamente el plan/rango/cursor guardados, incluidos los de versiones anteriores.

Plan rápido de seis fases: estadísticas diarias de campañas/conjuntos/anuncios en el rango, después metadatos de esos objetos. Solo se consultan IDs con actividad retornada por Insights, mediante GET multi-ID en bloques de50, Bearer/proof existentes y validación de cuenta por objeto. Incluye pausados con actividad; no representa todo el catálogo ni garantiza mostrar activos sin entrega en ese periodo. Ausencias de metadatos quedan con estado desconocido. El panel y el contador de actividad no reutilizan como actuales los miles de objetos de una importación antigua ajenos al rango. Las cinco comparaciones se mantienen; Desde el inicio sigue siendo parcial y la primera circulación es la conocida por los datos importados.

El rango/plan/contadores se conservan en syncState y lastRun; la siguiente actualización automática utiliza el mismo número de días móviles. No requiere migración. La reconciliación de estadísticas solo afecta fechas/nivel/atribución consultados; el plan rápido no marca NOT_RETURNED objetos de fuera del periodo. **Reimportar histórico** mantiene el recorrido completo anterior y debe pedirse explícitamente para una cuenta nueva API. MCP mantiene su contrato y cursores anteriores; no se finge soporte multi-ID. Sin IA ni modificaciones de campañas o anuncios en Meta.

### Análisis semanal con histórico independiente (versión actual)

El módulo visible utiliza únicamente Marketing API, con OAuth propio y token manual como alternativa. Se retiraron las secciones MCP de la interfaz; no se borran conexiones, asignaciones ni datos históricos de versiones anteriores. Los adaptadores y callbacks antiguos se conservan por compatibilidad, sin ofrecer su configuración en el panel nuevo.

**Dos periodos diferentes.** El selector de cuentas «Activos o con entrega en» parte de7 días (opciones7/15/30/90). Determina qué campañas, conjuntos y anuncios entran al análisis; no limita la antigüedad de sus estadísticas. Se consultan Insights agregados del periodo en cada nivel y el inventario efectivo ACTIVE de cada nivel. Se incluyen pausados con entrega reciente y activos sin entrega. No se recorre el catálogo completo de elementos inactivos ni se exige que hayan sido creados esta semana.

El plan `focus` tiene11 etapas: selección por entrega de los tres niveles, selección de activos de los tres niveles, sus detalles de los tres niveles, comparativos diarios30 y acumulados históricos. Los detalles usan GET /{id} con IDs internos validados y máximo5 lecturas paralelas por paso. Se eliminó el GET raíz con `ids`, que la captura real del usuario acredita obsoleto en Graphv26.0. El adaptador legacy también traduce lotes a lecturas individuales; no se reintenta el endpoint obsoleto.

Los comparativos de hoy/7/15/30 proceden de hasta30 días diarios de los objetos seleccionados. Después se consulta GET /{id}/insights con date_preset=maximum y time_increment=all_days para el acumulado disponible en Meta: no se descarga el diario de años de todo el catálogo. MetaAdTotal guarda importe/acciones/rango real por objeto y atribución, con reutilización durante6 horas si el día final coincide. El costo se calcula dividiendo gasto total entre resultados totales; nunca se promedian costos diarios ni se mezclan campañas+conjuntos+anuncios en un total de cuenta. La disponibilidad de Meta puede ser menor que la vida del anuncio; no se garantiza histórico completo desde su creación.

`selectedAt`/`selectionSince` delimitan la selección persistida sin borrar objetos fuera de ella. Los comparativos se publican al completar la etapa10 y el histórico continúa en segundo plano; un fallo del histórico conserva los datos recientes disponibles. Lo no consultado se muestra pendiente/no disponible, nunca como costo cero confirmado. Una importación guardada de otro día se marca atrasada aunque termine hoy. La antigüedad visible usa creación si Meta la informa; primera entrega registrada y cobertura del acumulado no se confunden con esa fecha. Consultar/ordenar/buscar/cambiar Medir resultado trabaja con datos locales, sin IA ni consultas adicionales a Meta.

**Interfaz.** Conexión al principio de cada cuenta; selección temporal y acción principal; progreso compacto con detalle técnico plegado. Se retiraron Habilitar sincronización, Resultado principal por cuenta, mínimo de resultados, intervalo y Reimportar histórico. La sincronización se habilita internamente solo con la acción explícita autorizada; los ajustes internos previos se conservan. Medir resultado arriba selecciona la métrica que se calcula para las tarjetas (incluido automático); búsqueda por palabra siempre visible. Los filtros secundarios se agrupan en Más filtros y se pueden limpiar. Costo objetivo opcional y asignaciones de acceso permanecen disponibles.

**Pausar y cancelar.** POST /api/meta-ads/accounts/{id}/control con pause/cancel solo OWNER o ADMIN actualmente asignado con canSync. Origin/autenticación existentes y autorización revalidada bajo bloqueo884411. Pausar conserva fase y cursores; reanudar es explícito. Cancelar descarta únicamente el cursor de la importación y desactiva el ejecutor/actualización hasta otro inicio. Ambas acciones invalidan lease y scheduler; una respuesta que ya estaba en tránsito no puede escribir después. Los nuevos pasos durables comprueban también el token del programador antes de tomar una página. Ninguna de estas acciones pausa, cancela, modifica ni publica campañas/anuncios en Meta.

Migración038 aditiva: selección de cuenta/objeto y MetaAdTotal con índices. Aplicar con db:deploy, como ya exige el despliegue. No retirar credenciales ni eliminar el histórico para actualizar.

### Límites de consultas

Graph puede devolver HTTP400 con código17 y subcódigo2446079 («User request limit reached»). La importación conserva el cursor y muestra espera con próximo intento automático. No requiere reemplazar el token por ese error. La primera espera es30 minutos, ampliable con Retry-After o rechazos posteriores; no garantiza que Meta haya liberado la cuota al llegar esa hora. Pausar/cancelar sigue disponible; Continuar no adelanta las consultas.

Migración039: MetaApiQuota contiene solo digest SHA256 del ámbito, siguiente reserva y fechas/contador de bloqueo. Dentro de la misma base, conexiones OAuth del mismo usuario/app comparten presupuesto incluso al cambiar token; conexiones manuales del mismo token también. Dos instalaciones con bases distintas y otras herramientas externas pueden consumir el mismo límite de Meta: la coordinación local no lo elimina. Lecturas de sincronización espaciadas1s y lotes drenados antes de devolver errores; no se llama a Meta desde los filtros ni las consultas de progreso.

### Método de conexión y estados de entrega

Una conexión usa una sola credencial: manual o OAuth. Tener guardada la configuración de la app no significa usar dos tokens. Las entradas Manual (token), Conexión rápida y Agregar conexión OAuth abren opciones exclusivas; la rápida reutiliza una app configurada y abre Facebook sin crear otra conexión. Abrir un editor no cambia el método: se sustituye al guardar el token o completar correctamente OAuth. Un token manual de caducidad no informada no se anuncia como permanente.

La selección semanal incluye activos actuales y pausados con entrega en el periodo elegido. Las tarjetas/tabla muestran «Desactivado (pausado)», «Desactivado por campaña» o «Desactivado por conjunto», según effective_status de Meta. Los pausados conservan sus comparativos. Si la lista de activos incluye no activos, se validan primero cuenta e identidad y luego se omiten de ese inventario, sin abortar página ni perder su cursor. No se importa por defecto todo el catálogo antiguo pausado.

### Estadísticas agrupadas y disponibilidad

Los comparativos recientes se pueden abrir con «Ver análisis disponible» antes de terminar el acumulado. Las tarjetas se actualizan al completar grupos históricos; el progreso muestra elementos completados/total. El histórico usa Insights de cuenta con filtro obligatorio por IDs seleccionados/nivel (hasta50 por checkpoint); diarios30 agrupan3 IDs como máximo por consulta para acotar filas. Caché6h evita repetir acumulados vigentes. Se conservan cursores de ejecuciones previas, histórico y controles de pausa/cuota. El tiempo real depende de Meta y de los elementos seleccionados; los11 pasos no representan por sí solos cuántos objetos faltan.


## Corrección de estados y distribución · 02/11/2026

La actualización breve usaba un GET raíz con `ids`, que Graphv26 devuelve como obsoleto aunque el token siga siendo el mismo. Se sustituye por una envoltura POST `batch` con hasta50 subconsultas **GET por ID**: es lectura, sin activar/pausar campañas. Se valida cada respuesta, el ID, la cuenta autorizada y la revisión vigente; se mantienen cuota/cooldown, fencing, gasto hoy/ayer y cursores históricos. No se reimporta el pasado ni se sustituye la credencial. El lote reduce viajes HTTP; Meta puede contabilizar cada subconsulta en sus límites, por lo que no evita las cuotas del proveedor.

En Rendimiento, ACTIVE se muestra verde y PAUSED gris. Un estado antiguo conserva su color con borde ámbar y aviso de falta de verificación; no se desatura hasta parecer apagado. Los controles de solo lectura conservan el color sin conceder permisos de cambio. Los configurados ACTIVE van antes de PAUSED incluso al ordenar costos o paginar; dentro de los activados se prioriza entrega efectiva ACTIVE. Un elemento activado puede tener entrega limitada por su campaña superior: configuración y entrega son datos distintos.

Filtros/cuentas fijadas mantienen sus filas; resumen y periodo se alinean arriba, y actualización breve, catálogo e información de sincronización se distribuyen en una fila adaptable. Los avisos extensos se ajustan al ancho sin desplazar los otros bloques. La leyenda explica verde/gris/borde ámbar. El aviso técnico concreto de `ids` corresponde a la consulta, no prueba que el usuario haya cambiado mal su token. Otros errores de autorización o cuota requieren su diagnóstico correspondiente.

Validado con proveedor sintético, sin usar ni modificar credenciales reales y sin activar campañas. Para confirmar datos de una cuenta real, el VPS debe aplicar la actualización y completar una lectura autorizada de Meta; el éxito de las pruebas y de Vercel no confirma ese estado real.

## Asesores: Vista manual y Vista automática · 02/11/2026

La hoja de Asesores separa **Vista manual** y **Vista automática**. La elección es personal por usuario y hoja, se conserva al recargar y no modifica registros compartidos ni solicita datos adicionales a Graph.

En manual, el orden es **A, H, BM, BC, V** (BM/BC y el porcentaje manual conservan las reglas de Hoy/Ayer). BM permanece de solo lectura, recibido del reparto manual de Totales; BC sigue editable por asesor/hoja/país.

En automática el orden es **A, H, V, B Meta, Efect. Meta, G Meta, CAC Meta**. Solo A/H se registran manualmente. B y G son la suma original de las campañas atribuidas al asesor, para la misma fecha y los filtros autorizados de hoja/inventario/país; no usa anotaciones manuales de B/G ni las campañas de otros asesores. Se reutiliza `financial` ya presente en la lectura de Asesores, sin nuevas consultas o sincronizaciones.

Efectividad = **V / B ×100**, CAC = **G / V**. El gasto y CAC se presentan separados por moneda, sin convertir ni sumar importes incompatibles. N.A., datos ausentes, base cero o ventas cero cuando impiden dividir muestran —; un cero conocido permanece cero cuando corresponde. Registros incompletos o atribución parcial llevan asterisco, sin inventar reportes. B Meta respeta la responsabilidad histórica existente; no atribuye todo un día a un asesor cuando hubo un cambio intradía sin desglose suficiente.


## Vinculación con asesor distinto · 02/11/2026

El error «Esta fila ya tiene historial de asesor. Conserva su asesor o cámbialo desde la hoja» procedía de una protección de la asignación inicial. Al estar dentro de la transacción del vínculo, rechazaba también alias/país/hoja aunque esa coincidencia fuera válida. La protección del titular ahora se conserva sin cancelar el vínculo.

- Asesor igual: vincula sin error ni nuevo cambio histórico. Si se omite, toma el titular existente para el objeto vinculado.
- Asesor distinto o historial sin titular actual: vincula la campaña al mismo alias/país, conserva el titular actual e incorpora una propuesta `advisorReviews` en los controles internos del inventario. Se deduplica por asesor y aumenta revisión para impedir resolver con una vista antigua. Campañas pausadas pueden reabrir una fila oculta al vincularse explícitamente; la activación real sigue sus reglas anteriores.
- En la hoja aparece **Asesor por revisar**, en magenta, con botones para conservar al titular o revisar el propuesto. La fila adicional es una vista del mismo diplomado–país, con las mismas ventas, base y gasto; V abre el mismo reparto por personas. Kevin4/Ana2 se ve como6 en ambas vistas y se contabiliza una vez. No se crea otro diplomado en la lista de vigentes ni otro registro financiero.
- Resolver es una decisión manual mediante la asignación financiera existente, con permisos, fecha/modo, revisión y auditoría. Conservar el mismo titular elimina el aviso sin añadir un traslado histórico; elegir otro respeta el proceso de cambios/repartos. Reasignación no reescribe ventas registradas. La resolución limpia propuestas solo tras comprobar la revisión vigente; una propuesta nueva invalida una decisión abierta anterior.

Las métricas siguen llegando desde los objetos vinculados y sus informes sincronizados; un conflicto de asesor no impide su lectura. Vincular no consulta Graph ni activa/desactiva anuncios, no fuerza actualización externa y no fabrica métricas pendientes. País/moneda, hoja existente, permisos y selección de objetos siguen validados. Guardar un vínculo local no acredita sincronización o acceso a una cuenta real.


## Histórico financiero y contexto de asignación

En Efectividad, OWNER dispone de **Importar histórico**. Seleccionar archivo JSON v1, tres listas de destino (diplomados, asesores, totales), tabla existente o creación por país y equivalencias de nombres. Coincidencias únicas del catálogo se reconocen por nombre normalizado y por las equivalencias semánticas autorizadas por el usuario; varias fichas posibles quedan para revisión. Revisar archivo muestra sumas independientes, altas y conflictos antes de confirmar. Requiere revisión explícita y aprobación adicional para sustituir conflictos admitidos; repartos nominales diferentes bloquean la carga. Cambios concurrentes invalidan la revisión; repetir archivo y mismos destinos devuelve el recibo anterior. Ver datos importados abre las fechas/tablas elegidas mediante preferencias personales, sin cambiar vistas del equipo.

Formato v1: source con url/title/salesSince/salesUntil/marketingSince/marketingUntil/notes; diplomas con name/country/day/sales/administrator; advisors con name/country/day/sales; totals con country/day/sales; manual con country/day/metric/value/currency. metric es baseManual o totalSpend y moneda PEN; fechas ISO, países ISO2, ventas/BM enteras no negativas. Límite JSON del cliente1.8MB y cuerpo de rutas exactas2MB. API valida períodos, unicidad, importes, países y concordancia asesores–totales del archivo. El archivo no selecciona IDs del sistema: destinos/equivalencias se eligen aparte.

Las ventas por diplomado se registran con reparto Se desconoce cuando falta el vendedor original; el titular actual no se utiliza para inferirlo. Ventas históricas personales sustituyen V de esa persona/día en vista general autorizada, sin inventar desglose por diplomado; al filtrar un diplomado/período de responsabilidad no se adjudican ventas históricas sin correspondencia. Totales históricos del país sustituyen V de la misma tabla/país/fecha, no se suman a diplomados. BM conserva distribución desconocida, GM se guarda en su fecha en PEN; base/gasto originales de Meta permanecen independientes. Nuevos diplomados históricos se crean inactivos; importar no simula activación publicitaria. Procedencia/payload/estado anterior quedan en recibo servidor para revisión, sin interfaz de restauración completa ni promesa de versionado general.

Al cambiar país de un placeholder sin datos manuales hacia destino con historia, se reutiliza fila existente, retira placeholder y preserva datos/historia del destino. Diferencias de asesor generan revisión; historias con datos manuales conflictivos mantienen rechazo. Al eliminar Sin país se conserva tombstone/auditoría sin insertar estados/eventos con país vacío.

Meta Ads carga asesor/moneda de la fila al elegir diplomado/país. Si no hay asesor ni historia, único asesor activo del inventario es candidato; si hay varios, requiere elección. Cambiar asesor predefinido pide confirmación y usa revisión existente sin reescribir historia. Contexto incluye revisión de fila e inventario, validada bajo bloqueo al guardar. Consultar contexto no escribe ni llama a Meta.


### Enlace privado sin descargar ni subir archivo

Además de seleccionar JSON, OWNER puede abrir un enlace privado de carga preparada. El enlace contiene una clave aleatoria en su fragmento, nunca en query. Efectividad elimina esa clave de la dirección y la envía por POST autenticado a history-import/prepared. El servidor comprueba OWNER vigente antes de abrir el paquete AES-256-GCM comprimido, valida límite descomprimido1.8MB y esquema financiero y responde no-store. La clave no concede sesión ni permisos. Paquete cifrado solo de servidor; fuente legible y clave permanecen fuera del repositorio y del bundle cliente. No se conecta a Drive ni llama proveedores.

Abrir prepara el formulario sin escribir. Elegir listas/tablas/equivalencias, Revisar archivo y Confirmar importación mantiene todas las comprobaciones del importador. Si hay varias listas del mismo tipo no se elige automáticamente la primera. Repetir el mismo archivo con los mismos destinos devuelve el recibo previo. En una página ya abierta, un nuevo fragmento vuelve a preparar el diálogo; la clave solo vive en memoria durante esa lectura y no se guarda en preferencias. Publicar esta función no demuestra carga en la base productiva.


## Ventas de hojas en campañas · 02/11/2026

En campañas, cada comparativo muestra V en violeta bajo resultados: rango elegido, Hoy,7,15,30 y acumulado. Fechas exactas en tooltip; datos de hoja por diplomado y país, no conversiones compradas ni atribución del anuncio. Sin vínculo muestra Sin vincular, sin registro muestra pendiente, cero conocido se conserva y suma incompleta lleva asterisco. Si varias campañas autorizadas comparten el vínculo, se muestran ventas compartidas; resumen deduplica y CAC individual queda sin calcular.

Evaluación/estado muestra CAC y estado de adquisición en la misma línea, Por el período y efectividad debajo. Respeta el período seleccionado si es reciente (7–14 días con cierre hoy/ayer); para rangos antiguos o acumulados muestra explícitamente últimos7 días. CAC=G Meta/V registrado y efectividad=V/resultados Meta×100, con igual período, moneda de la cuenta, reporte disponible y vínculo único. Si faltan días de ventas, CAC/efectividad y estado con V positivo son provisionales y llevan asterisco; las ausencias no se convierten en cero. Reparto compartido, ausencia de registros o denominador cero muestran — según corresponda. Las reglas de estado se reutilizan del inventario, no de la meta de costo por conversación; no se inventa rentabilidad. Detalle incluye tabla de comparativos y diario, comienza con fechas del panel y permite consultar otros rangos mediante calendario existente. V por día llega en el mismo GET diario opcional sales=1 para campañas; filas de ventas sin informe no fabrican gasto cero. GET diario anterior sigue devolviendo array sin esa opción. Anuncios/conjuntos no reciben V; contador global anterior sigue mostrando ventas únicas de sus campañas padre.

Inicio/días permite ordenar desde la propia cabecera, conserva prioridad operativa de activos y preferencias personales. Tooltip muestra primera circulación guardada y creación; acumulado puede ser parcial y no asegura cuándo se creó el primer anuncio real. No se consulta Meta al pasar el mouse ni al ordenar.

V se lee de campos locales de hojas, agrupado por tabla/nombre/país y siguiendo vínculos/legados/anotaciones, incluso si se retiró la fila visual. Omitir consultas de FX, historia de asesores y reportes Meta en esta lectura; compartir sus resultados entre resumen y filas. No se añade consulta Graph, sondeo ni invalidación masiva del caché de informes. Actualizar vista conserva actualización visible acotada a hoy/ayer y catálogo/histórico sigue siendo explícito. Fecha y ambos botones están en una fila adaptable; detalles de frescura/leyenda se abren sin reflujo ni nuevos filtros. Actualización periódica y retraso del proveedor siguen aplicando: no afirmar entrega instantánea o continuidad100% por un cambio de interfaz.


### Equivalencias automáticas del histórico

Al abrir el enlace privado o seleccionar el JSON, el importador reconoce coincidencias únicas utilizando el catálogo y asesores que devuelve la plataforma, sin consultar Meta ni IA. Los campos ya quedan seleccionados: normaliza tildes/case/puntuación/plurales y usa reglas indicadas por el usuario para Acero, Criminalística, Deportiva/Forense, IA/EIA, Matemáticas, Veterinaria, restaurantes, lectoescritura y otras abreviaturas inequívocas. Prefiere coincidencia de la tabla/país y puede reutilizar título canónico de otro país; un país nuevo crea su hoja/alias con ese título, conservando una sola ficha de inventario.

Gregory/Gregori/Gregorick y variantes i/y o nombres de pila únicos se relacionan dentro de Asesores; dos personas posibles no se fusionan. Tampoco se fuerza una equivalencia de diplomado si hay varios candidatos. La pantalla pide resolver únicamente esas ambigüedades y mantiene reconocidos/nuevos en tablas plegadas; Ajustar una equivalencia permite corregir una selección. Listas estándar y países se proponen cuando son únicos; nuevos nombres sin candidato aparecen en revisión como altas.

Catálogo se envía por referencias item/alias, no por títulos confiados al cliente. El servidor valida pertenencia al inventario, rechazo de referencias ajenas, permisos OWNER actuales, revisión de catálogo y CAS antes de guardar. Dos abreviaturas del mismo destino/día/país se agrupan; no duplican alias ni ficha. Recibo adicional por identidad materializada permite reconocer la misma importación cuando el país/alias/persona recién creados ya tienen ID, incluso si cambia el nombre de la tabla. No se vuelve a sumar V. B/G Meta, BM/GM, procedencia y vendedor desconocido conservan sus reglas previas.


### Totales: bloques vacíos y tabla ampliada

Cada fuente/país/moneda conserva identidad y valores. El grupo plantilla Sin país se oculta al existir país asignado solo si no contiene registros; ceros/N.A. manuales lo conservan y el filtro Sin país permite consultarlo. Se omite una fuente homónima probadamente vacía frente a otra con datos, sin borrar ni consolidar tablas. hasData sale de lecturas ya existentes, distingue N.A. automático y se combina entre meses; desconocido no demuestra vacío.

62 fechas por página inicialmente, seleccionables hasta366; Hasta hoy mantiene Desde y usa America/Lima. Nuevo rango inicial comienza el mes anterior; preferencias previas se respetan. Tras importar histórico reciente se puede ver hasta hoy sin crear registros; fuentes antiguas no se expanden años. Una zona de desplazamiento vertical de datos en escritorio y navegación horizontal inferior; maximizar junto a fecha conserva tabla/posición, con manual/automático dentro. Scroll, tamaño y paginación son locales, no disparan Meta. BM sigue siendo manual e independiente de B Meta, y datos ausentes no se convierten en cero.


### Recuperar solo faltantes del histórico

Importar histórico permite activar Recuperar solo faltantes antes de revisar, o usar Revisar y recuperar faltantes desde el recibo manteniendo el mismo archivo. A diferencia de repetir una carga normal, este modo consulta el estado actual aunque exista recibo. Muestra celdas ausentes y filas retiradas que se restaurarán; conserva valores existentes diferentes y los muestra como diferencias, sin selector de reemplazo. Confirmar recuperación requiere revisión vigente; retry idempotente por token y nueva revisión vuelven a distinguirse.

Se muestran de nuevo filas retiradas y se recupera pertenencia al inventario para diplomados de la fuente; filas ausentes se crean. No activa diplomados ni publicidad. Solo repone V sin cifra/anotación/aprobación, personales sin registro, claves de totales históricos/GM inexistentes y BM sin fila; ceros, N.A. y repartos nominales quedan protegidos. Se reutilizan permisos, bloqueo884411, auditoría y copia anterior. No restaura todo el sistema ni sustituye una comparación de valores en conflicto. Sin nuevas consultas Graph/IA ni actualización periódica.


Hojas de evaluación con nombre exacto de país: se prioriza el país del nombre sobre default erróneo y selecciones extranjeras sin identidades. Argentina no adquiere columnas Perú/Angola por configuración sola. Países con filas/estados se conservan para revisión, sin trasladar/importar ventas entre países. Hojas genéricas mantienen múltiples países. Selector de hoja propone país del nombre y API rechaza agregar otro a una hoja nombrada por país, sin modificaciones parciales.


### CAC y estado de campaña por el período seleccionado

CAC y estado se muestran juntos; la línea siguiente dice Por el período y Efect. Las fechas exactas, fórmulas, cuatro límites y la provisionalidad aparecen en el tooltip. Estado Normal/Revisar/Grave/Crítico/Sin ventas usa los límites CAC del inventario enlazado; defaults PEN35/50/65, y gasto25 para revisar un período sin ventas conocidas. Otra moneda conserva sus cocientes nativos pero muestra umbrales pendientes, sin aplicar soles como si fueran dólares.

La falta de un día de V ya no oculta todos los cocientes: con V registrado positivo e informe Meta válido se presenta G/V y V/B de ese rango como provisionales; completar ventas puede cambiar ambos cocientes y el estado. Cero con cobertura incompleta no produce estado definitivo sin ventas. Sin vínculo, V desconocido, informe pendiente o ventas compartidas siguen diferenciados. Anuncios/conjuntos no tienen CAC/ventas individuales.

Detalle conserva comparativos y calendario7/14/Desde el inicio/rango, actualizando ventas, gasto, base/resultados, CAC, efectividad y estado conjuntamente. Reglas se leen una vez por solicitud mediante proyección SQL mínima y solo para inventarios de campañas autorizadas; ningún JSON completo de configuración se serializa. Reutiliza mismos GET de panel/detalle, sin nuevos Graph, FX, sincronizaciones completas o sondeos.


### Estado reciente y consulta histórica

La evaluación principal no rescata una clasificación de un mes/año anterior. Usa el rango elegido si tiene7–14 días y termina hoy o ayer, según zona horaria de la cuenta. Para Desde el inicio, rangos amplios o antiguos usa el comparativo existente de últimos7 y lo indica, con fechas completas visibles. Si tampoco existe una ventana reciente válida, muestra pendiente; no sustituye un Crítico antiguo. CAC, efectividad y estado siempre corresponden a la ventana indicada.

Al pulsar evaluación se abre exactamente esa ventana reciente. Ver detalle conserva las fechas del reporte elegido y permite estudiar otro período; estados de rangos antiguos/amplios se etiquetan Histórico junto a sus fechas, sin presentarse como estado actual. Las cifras parciales mantienen su asterisco. La selección y etiqueta son locales, sin nuevas lecturas de base, Meta o sondeos; no añade filtros.


### Gasto Meta en todos los comparativos

Tabla y tarjetas ordenan Por fecha/Hoy/7/15/30/Desde el inicio como costo por resultado, resultados, gasto Meta y ventas. La línea Gasto reutiliza spend original de ese mismo objeto/período y su moneda; incluye fechas de fuente en tooltip. No multiplica costo redondeado por resultados ni usa presupuesto/gasto manual. Sin reporte muestra guion; cero disponible sigue cero. Renderer común a cualquier cuenta/administrador y nivel; V sigue solo en campañas vinculadas. Sin nuevas consultas ni sincronizaciones.

Una selección diaria/Hoy no deja la evaluación principal en Ventas pendientes si la semana tiene registros: usa explícitamente últimos7 con sus fechas. Rango reciente elegido de7–14 días sigue respetado; detalle puede analizar Hoy sin inventar ventas y conserva etiqueta histórica para otros rangos.


### Refresco y coste de presentación

Carga inicial y eventos de foco/visibilidad/polling comparten una lectura de cuentas si la misma ruta light/full ya está en curso en ese componente. Al terminar o fallar se libera; el siguiente evento vuelve a consultar. Actualizaciones explícitas tras acciones mantienen lectura propia y se ignoran respuestas más antiguas que otra lectura ya iniciada. No se guardan respuestas financieras ni permisos en la caché de presentación.

Moneda/fecha reutilizan objetos Intl con límite32 por moneda/zona, manteniendo números recibidos y fecha actual por llamada. Se conserva carga ligera de cuentas en panel,25 filas por página y actualización breve de elementos visibles con sus60s/cooldown existentes. El gasto agregado se toma del payload ya recibido; tabla/tarjetas no agregan consultas. Optimización validada por comparación de solicitudes y constructores en QA, sin prometer una latencia global específica del servidor.

### Análisis por selección y sincronización en hojas

El detalle de toda la hoja admite Todos/Activos/Inactivos y conserva diplomados con cero ventas o sin registro. El detalle de selección usa únicamente sus alias/país. Cambiar ese filtro no consulta de nuevo el servidor. Las bases manuales de país no se atribuyen a un subconjunto de diplomados.

En Rendimiento, Maximizar amplía la misma tabla; Detalle compara hasta100 elementos seleccionados entre páginas con el mismo período, gasto Meta por moneda, V de campañas y evaluación reciente. Las ventas compartidas conservan su etiqueta y no reciben CAC individual; conjuntos/anuncios no reciben ventas individuales. El histórico diario completo se carga solo al expandir cada elemento.

Sincronización en cada fila o país del inventario abre el panel de vinculación con la identidad y el asesor/moneda guardados. Busca campañas ya importadas y vincula solo las marcadas; no consulta Graph ni cambia entrega. Desmarcar una campaña no elimina su vínculo existente. El servidor exige permiso Meta y revalida contexto/revisión; una campaña que ahora pertenece a otro diplomado/país requiere revisar nuevamente la selección.

CAC/estado de cabeceras de inventario proceden de gasto Meta; ventas parciales positivas muestran clasificación provisional con asterisco y FX incompleto queda pendiente. Las hojas con nombre de país solo generan columna de ese país; asociaciones de otros países siguen guardadas y accesibles en Asociaciones de país por revisar, sin reasignar ni borrar ventas.

### Calendario en Top/reemplazo

Últimos7 días es el rango inicial (hoy y seis anteriores, Lima). El calendario compartido de Meta permite rangos y Desde que se activó, que usa la última activación registrada de cada diplomado hasta hoy, incluso si fue reactivado. V, presupuesto registrado, CAC presupuesto y estado del Top usan ese rango; Desde/Días activos describen el ciclo. Presupuesto manual no se presenta como gasto Meta. Seleccionar fechas solo consulta el reporte; no cambia estados operativos ni registros. Otros consumidores mantienen sus14 días anteriores si no especifican rango.

La cabecera de la tabla Meta ampliada incluye búsqueda por palabra y selector editable de período con el calendario del panel. Ambos usan los mismos filtros que la vista normal y los conservan al restaurar. Abrir la ampliación o el calendario no consulta; cambiar palabra reutiliza el debounce y aplicar fechas actualiza el reporte una sola vez. En móvil la cabecera se adapta sin recortar los controles; Escape sobre el calendario mantiene abierta la tabla.

El refresco breve consulta hoy/ayer de los elementos visibles al abrir la vista y al regresar a una pestaña visible; usa el próximo turno autorizado por el servidor, normalmente60s. Ordenar los mismos elementos no vuelve a consultar Meta. Una lectura ya terminada por otro lector actualiza el reporte local una sola vez; estados confirmados se muestran aunque falle después el gasto. No recarga adicionalmente el directorio de cuentas ni importa histórico. El botón muestra la hora de la lectura completada; los límites de Meta siguen vigentes y el proveedor puede demorar sus métricas. Sin ventas registradas significa V ausente en la hoja para ese período, no facturas/deudas de Meta ni cero confirmado.

### Detalle por diplomado seleccionado

El detalle de campañas seleccionadas ofrece barras verticales y tabla de diplomados/países, búsqueda, clasificación de ventas, activos/pausados y orden por V. Puede alternar ventas y G Meta por moneda. Las ventas compartidas se deduplican; el gasto suma únicamente las campañas seleccionadas. Si faltan campañas del vínculo compartido, no se estima CAC con un gasto parcial. Monedas no se mezclan y distintos objetivos no generan un denominador único de efectividad. Evaluación reciente conserva sus fechas aunque se examine un rango histórico.

ReportedMeta indica cifras efectivamente guardadas; un rango incompleto las muestra con asterisco en vez de ocultarlas, sin declararlas completas ni clasificar CAC con ese gasto parcial. V ausente permanece sin registro. Una revisión automática actualiza números conservando filtros; buscar, ordenar y cambiar variable del gráfico reutilizan datos cargados. Evolución lee una campaña al elegirla, sin descargar todo el histórico de la selección. El desglose original sigue plegado.

Reemplazar abre el mismo flujo del inventario para el diplomado/país, evaluado con gasto Meta y el rango seleccionado. Prepara tareas de campaña según permisos y revisiones existentes; abrir no cambia anuncios ni ventas. Top de hojas que analizan presupuesto manual mantiene su origen y etiqueta.


## Grupos: uso y reemplazo por país (2026-11-04)

Crear/Grupos guardados usa columnas de las hojas configuradas de ese inventario, agrupadas por código de país; no consulta el catálogo mundial ni deriva columnas de asociaciones históricas extranjeras. Catalogo/directorio existente incorpora estados/eventos autorizados en lote, sin estadísticas financieras por fila ni Graph. Umbral12h sobre intervalos de activación guardados, fusionados si varios alias del mismo diplomado se solapan; desconocido conserva incertidumbre. inventoryGroupUsage en config guarda solo override USED/UNUSED con revisión UUID; AUTO retira override. API USAGE valida inventario, catálogo, país configurado, permiso vigente y expectedRevision bajo884411 y audita. No altera estados, eventos ni datos financieros. Marca manual es organizativa, no acredita frescura de Meta.

Selector de reemplazo individual/lote incorpora grupo y uso específico del país, con sin usar primero; desconocidos separados, manual respeta override. Propuesta y filtros son locales, activos/pendientes siguen excluidos y solo Confirmar ejecuta transacción existente. Antecedentes/Detalle abre pantalla existente bajo demanda. Tabla del editor pagina localmente y conserva checks al filtrar; anchos por usuario/lista mediante bordes compartidos sin botones vacíos.


## Fluidez de lista y estado de sincronización (2026-11-04)

Popover de asignación monta cuerpo/formulario solo abierto; cerrar no conserva miles de formularios ocultos. Celdas de fila conservan DOM ante selección y apertura de paneles, con invalidez por modelos/permisos y firma del país; callbacks de asignación usan selección actual. Hook financiero mantiene objeto ante respuesta idéntica y no alterna loading en fondo con datos presentes; conserva permisos vigentes, ámbito y abortos. Factor usa directorio actual hasta guardar con CAS. Ninguno de estos cambios añade consultas a Meta.

Directorio entrega snapshot ligero de sincronización por nombre canónico/tabla/país con aliasId y ready. Directorio/informe exigen fila de presentación currency vacía, asesor y displayCurrency guardados y ausencia de advisorReviews. Moneda por defecto de tabla no acredita configuración guardada. Evaluación ausente temporalmente usa snapshot de directorio, no degrada a gris; disabled mantiene color de estado sin conceder escritura. Datos/configuración siguen validados al abrir y guardar.

Maximizar tabla en grupos muestra búsqueda/resumen y cuerpo amplio con13px, plegando controles secundarios por CSS; Mostrar controles/Restaurar conservan misma tabla, preferencias, selección y borrador, sin recargar. Top mantiene expansión de ventana.


## Selección de grupos y controles separados (2026-11-04)

Estado local de ampliación de tabla independiente del tamaño de ventana. Tabla se controla junto a Diplomado; ventana junto a X. Franja única: nombre editable del grupo antes de Mis grupos y selector de guardados, visible también en foco de tabla. Buscar inventario separado y chips de selección con eliminación individual; limpiar consulta no limpia selección. Categorías desde encabezados usan diálogo compacto y buscable, drag/max/restaurar/X/Cancelar; aplicar cambia lista local, no asignaciones. Cuadro de uso conserva sus propias acciones de ventana. Operaciones de presentación no hacen GET ni mutan datos; guardar mantiene API, exclusividad de miembros, CAS e historial existentes.


### Ajuste de altura de grupos (2026-11-04)

Navegación ocupa header junto a controles de ventana, sin título visible redundante. Búsqueda independiente dentro de franja verde de nombre/Mis grupos; los chips aparecen debajo solo con selección. Estado, dos ampliaciones, anchos y guardado permanecen; no consultas por modificar distribución o buscar.


## Eliminación desde grupos y disposición final compacta (2026-11-04)

Solo ampliar ventana; controles en franja verde y una barra inferior con rango/paginación/Cancelar/Crear. Chips persisten entre búsquedas y Eliminar seleccionados abre preview+Aceptar/Cancelar sin palabra escrita. Modo wholeDiplomas en rutas existentes: catalogIds identifica explícitamente diplomados de lista autorizada; expansión por categoríaKey exacta incluye todas sus fichas/alias, sin semejanza semántica. Confirmar exige mismos IDs expandidos y tokens vigentes bajo884411, sin borrado parcial. Limpia miembros activos/config solo del ámbito eliminado, conserva otros miembros/ciclos, audita; días de registros seleccionados se eliminan según aviso. No opera sobre publicidad externa. UI poda IDs eliminados conservando borrador y búsqueda; máximo1000 hojas/fichas por confirmación.
