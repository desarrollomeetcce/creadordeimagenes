# Recomendaciones determinísticas de Meta Ads

Motor `rules-2`. No utiliza modelos generativos, servicios de IA ni tokens. No predice con certeza la eficacia de un anuncio ni ejecuta publicidad al leer una vista.

## Uso

En Rendimiento, junto a Ver tabla / Ver tarjetas, elegir Recomendaciones → Nocturna o Diurna. La modalidad elegida permanece visible al actualizar los datos o recargar la página, hasta elegir Ocultar recomendaciones, Volver a vista normal o una pestaña de nivel. No se abre si nunca se seleccionó o si se ocultó explícitamente. Volver a vista normal conserva los filtros, el periodo, la vista y las selecciones actuales. Las recomendaciones toman únicamente las cuentas y campañas seleccionadas; no heredan filtros de estado, alias, búsqueda o periodo que ocultarían parte de una campaña. Por defecto se revisan todas las campañas activas; también pueden incluirse campañas desactivadas. Cada campaña se evalúa independientemente.

Se revisa el inventario local de campañas, conjuntos y anuncios, incluidos pausados y sin entrega. No se descargan anuncios de Meta al abrir Recomendaciones. «Actualizar desde Meta» conserva su función existente. Las campañas se consultan en páginas de 10 y se analizan progresivamente; cada conjunto muestra hasta 25 anuncios por página y no monta tarjetas mientras está plegado. El análisis de una campaña admite 5000 elementos más su cabecera; superar el límite produce un mensaje explícito en lugar de una recomendación basada en un subconjunto silencioso.

## Datos y fórmulas

Atribución única: `7d_click,1d_view|impression`. Conversaciones: `onsite_conversion.messaging_conversation_started_7d`. No se suman acciones de distintos objetivos ni campañas + conjuntos + anuncios.

Costo agregado = suma del gasto / suma de las conversaciones. Con cero conversaciones el costo es desconocido, no cero. Los periodos de hoy, ayer, 3, 7, 14, 15 y 30 días y el acumulado disponible usan el propio anuncio. El acumulado se identifica como desconocido cuando no existe `MetaAdTotal`. Solo puede derivarse de diarios completos si toda la vida del anuncio, desde su creación, está contenida en el rango recibido; los anuncios anteriores al rango nunca obtienen un falso acumulado de 30 días.

La clasificación principal es excluyente: NUEVO por fecha de creación (<24 horas por defecto); después SIN GASTO cuando el acumulado conocido y actualizado al día tiene gasto <0.30 PEN; después CON HISTORIAL. Ausencia de datos no equivale a SIN GASTO.

Las decisiones requieren inventario confirmado y estadísticas recientes del día local con menos de una hora, informe correspondiente al día y credencial verificada vigente. Puede acreditarlo el sincronizador global completo o la lectura específica de campaña descrita abajo. Un fallo del acumulado histórico global no invalida diarios actuales confirmados de la campaña. Los objetos y padres deben pertenecer al inventario confirmado. Fuera de esa cobertura se muestran las cifras realmente recibidas como parciales, sin convertir ausencia en cero ni proponer estados con datos no confirmados.

## Nocturna

1. Evaluar hoy primero, con mínimos configurables (3 conversaciones y 1.50 PEN de gasto iniciales).
2. Conservar todos los anuncios que producen con costo aceptable y sin deterioro sostenido; no reducir una campaña eficiente a dos anuncios.
3. Comparar dos ventanas completas, iguales y no solapadas de 3 días anteriores a hoy. El cambio es `(costo reciente / costo anterior - 1) * 100`. Se exige evidencia mínima en ambas y al menos dos aumentos entre días recientes con muestra suficiente para proponer deterioro. El umbral inicial es 30%.
4. Una mejora suficiente hoy frente al propio historial evita aplicar automáticamente una señal de deterioro anterior. Un precio alto aislado no propone pausa.
5. Si hacen falta candidatos: todos los nuevos elegibles, después pausados sin gasto significativo, después pausados con volumen, costo y entrega reciente aceptables. Nunca activar otra vez un anuncio ya activo sin gasto: revisar entrega.
6. Ideal orientativo de 2 viables por conjunto y mínimo de 2 por campaña, sin máximo. Si todos los activos funcionan y ya hay al menos dos por campaña, no exigir pruebas innecesarias solo para completar cada conjunto.
7. Si solo queda un anuncio viable, conservarlo y reponer pruebas; no forzar otro caro. Sin candidatos, proponer preparar creatividades nuevas. Ubicar pruebas primero en conjuntos con eficacia actual, después con historial previo favorable/deterioro, luego con evidencia insuficiente; crear otro conjunto solo si no hay uno adecuado. No inferir saturación o causa creativa/audiencia sin evidencia.

Bandas iniciales en PEN: favorable <1, contextual hasta1.50, revisión de tendencia hasta2 y revisión prioritaria por encima de2. Son referencias contextuales, no instrucciones automáticas de pausa.

## Diurna — instrucción adicional del usuario

Revisión manual habitual a las 08:00 de Perú; abrir la vista no programa acciones. Usa el día local de cada cuenta, indicado en pantalla.

- Proponer EVALUAR PAUSA al alcanzar 0.50 PEN de gasto hoy sin conversaciones.
- Proponer EVALUAR PAUSA con conversaciones y costo por conversación >=2.00 PEN, incluso si es el único anuncio que produce y no queda ninguno activo.
- Conservar anuncios con conversaciones y costo <2.00 PEN.
- Por debajo del gasto mínimo sin resultados: continuar observación.
- Los anuncios nuevos y candidatos históricos aparecen como alternativas de prueba, no como eficacia garantizada. La regla diurna de gasto/costo puede aplicarse también a un anuncio nuevo por instrucción expresa del usuario.

Estas reglas sustituyen el apartado inicialmente pendiente del documento: el usuario las especificó después. No se incorporaron supuestas reglas diurnas de terceros.

## Proyección del costo del siguiente día

Se calcula únicamente con al menos cuatro días recientes con gasto y conversaciones suficientes; el último debe estar dentro de los últimos tres días. Se excluye hoy, aún parcial. Se usa regresión ponderada del logaritmo del costo, con separación real entre fechas (sin rellenar huecos con ceros).

`x = días respecto a hoy`, `y = ln(gasto/conversaciones)`, `w = min(conversaciones,30) * 0.85^(antigüedad ordinal)`. La pendiente es la covarianza ponderada / varianza ponderada de x, acotada a +/-0.15 por día. La proyección es `exp(media_y + pendiente * (1-media_x))`. La banda descriptiva usa dos desviaciones residuales ponderadas, con amplitud mínima0.15 en escala logarítmica.

Es una extrapolación estadística orientativa del costo típico, condicionada a condiciones comparables. No estima probabilidad calibrada de éxito, volumen futuro ni efecto causal de activar un anuncio. La banda describe variación, no un intervalo validado de cobertura. No se usa una proyección aislada para ordenar por costo más bajo o imponer cambios. Antes de automatizar cualquier uso predictivo futuro se necesitaría validación temporal contra resultados reales fuera de muestra.

## Configuración y persistencia

Reglas editables solo por OWNER, centralizadas por código de moneda en `MetaRecommendationRules`. PEN tiene valores iniciales explícitos. Para otra moneda deben introducirse sus importes, sin conversión ni traslado automático de umbrales de soles. Se validan orden de bandas, ventanas, límites y tipos.

`MetaRecommendationAnalysis` mantiene un resultado por campaña/modo, parámetros, versión, huella de los datos y fechas de cálculo/caducidad. La huella incluye inventario/estado/nombres/alias, revisiones y desconexión de la credencial, sincronización, cambios de hechos diarios/acumulados, moneda, reglas y día local. La vigencia termina también al alcanzar el límite de antigüedad de un anuncio nuevo. Los permisos actuales se revalidan al leer incluso una entrada válida. Guardar el caché no concede acceso.

No hay consultas por anuncio: metadatos, hechos diarios agrupados y acumulados se leen por campaña. Se conserva el sincronizador existente y su avance global. La lectura explícita por campaña actualiza únicamente los hechos realmente devueltos por Meta, sin borrar estadísticas fuera del rango.

## Aprobación manual

Los interruptores existentes siguen siendo manuales. Para varias recomendaciones, seleccionar anuncios y pulsar Revisar y aprobar seleccionados. La confirmación enumera las operaciones y los padres pausados que deben activarse, deduplicados y antes que sus hijos. Activar un padre puede reanudar la entrega y el gasto de otros anuncios ya activados dentro de él.

Se llama secuencialmente a la ruta existente de estado, con `confirmed:true` y estado anterior esperado. Solo OWNER con permisos reales de Meta puede ejecutarla; `canSync` no concede gestión publicitaria. Cada operación mantiene validación remota, fencing y auditoría existentes. Un fallo detiene el lote y conserva los resultados individuales; ninguna escritura incierta se reintenta automáticamente. Las recomendaciones no crean anuncios, conjuntos ni presupuestos.

## Lectura explícita por campaña y evidencia verificable

«Traer datos de Meta y analizar» lee metadatos de campaña, todos sus conjuntos/anuncios activos y pausados (excluye archivados/eliminados), diarios de los últimos 30 días inclusivos y acumulados disponibles en Meta. No basta pulsar Actualizar recomendaciones: ese botón vuelve a calcular con los datos guardados. Cada POST a `recommendations/:id/data` procesa una sola página; las estadísticas se consultan en bloques de hasta 50 IDs confirmados. El GET de estado y abrir/recargar la vista nunca consultan Meta. El bucle visible puede detenerse después de guardar la página y conserva el cursor; no sigue solicitando nuevas páginas en una pestaña oculta.

`MetaRecommendationSource` conserva avance, rango, IDs confirmados y revisión de credencial por campaña. Usa el lease compartido de cuenta y las cuotas/backoff existentes, con revalidación de usuario, canSync, propietario, conexión y revisión antes de guardar. Esperar por otra importación o por cuota no reinicia el cursor. La lectura no habilita cuentas ni declara finalizada la sincronización de toda la cuenta. Los diarios completos pueden analizarse aun si falla después el acumulado; el botón permite continuar.

Cada anuncio muestra gasto y conversaciones reales, la división que produce el costo, los importes y fechas exactas de ambas ventanas históricas y la fórmula de variación. El origen indica cuántos anuncios tienen filas de hoy, acumulados pendientes, frescura y atribución. Cero conversaciones no tiene costo calculable. Muestra corta aparece «En observación» con cifras y mínimos; si produce hoy y su historial reciente estable respalda un costo aceptable, la nocturna propone mantener en observación, sin contarlo como viable confirmado ni forzar un cambio de estado.

## Posición de pantalla

Los cambios de filtros reservan únicamente la altura de resultados necesaria para conservar el viewport actual durante carga o listas vacías. Se evita el anclaje automático de scroll en Meta y el foco de calendario/selector usa preventScroll. Refrescar la misma campaña conserva el resultado visible mientras llega el reemplazo; no desmonta sus grupos expandidos. No se fuerza scrollTo ni se bloquea el desplazamiento manual.
