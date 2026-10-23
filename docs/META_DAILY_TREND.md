# Interpretación del histórico diario Meta

La interpretación aparece únicamente dentro de Ver detalle, debajo del gráfico. No reintroduce la vista de recomendaciones retirada. Función pura `lib/meta-ads/daily-trend.ts`, presentación `meta-daily-trend.tsx`. Sin LLM, tokens, lecturas Meta nuevas, escrituras publicitarias ni persistencia nueva. Usa los diarios autorizados ya obtenidos para el objeto abierto: campaña, conjunto o anuncio, con su moneda y métrica. No suma niveles jerárquicos.

## Periodos y magnitudes

Se excluye hoy según la zona horaria de la cuenta. Se ancla al final solicitado, nunca se ocultan huecos desplazando el final hacia días viejos. Ventanas consecutivas iguales de siete días dentro del rango elegido (mismos días de semana). Si el rango cerrado tiene menos de14 días, tamaño=floor(días/2), máximo7; se explicita que no se controlan días de semana. Menos de tres días por ventana queda en observación. La referencia histórica usa los días anteriores a la ventana reciente, dentro del rango, mostrando cobertura, sin sumarla a la comparación.

Costo ponderado=C=Σgasto/Σresultados; cambio=Creciente/Canterior−1; volumen/día=Σresultados/días registrados. No promediar costos diarios. Cero resultados implica costo no definido. Ausencias, resultados desconocidos, valores inválidos y fechas duplicadas no constituyen ceros ni evidencia completa. Ventanas incompletas solo describen los registros observados. Una fila por día no certifica importación finalizada ni atribución definitiva.

## Incertidumbre y reglas

Parámetros explícitos en `trendDefaults`: ventana7, mínimo3 días con gasto y10 resultados por ventana, cambio material20%, persistencia10%,1200 remuestras. Son criterios operativos iniciales, no umbrales aprendidos o calibrados por cuenta.

Bootstrap pareado circular por bloques de dos posiciones consecutivas (misma posición de día en ambas ventanas), PRNG LCG con semilla fija; percentiles2.5 y97.5 del cociente de costos. Bloques conservan parte de dependencia temporal, no toda. Remuestras no definidas no se eliminan selectivamente: si contaminan el extremo superior no se permite inferencia por intervalo.

Para no publicar incertidumbre cero con costos diarios iguales, se toma la envolvente conservadora entre los percentiles y el intervalo logarítmico de razón de tasas bajo un modelo de conteos Poisson con gasto como exposición: razón×exp(±1.96√(1/Ranterior+1/Rreciente)). Es una aproximación exploratoria, no cobertura95% garantizada ni probabilidad calibrada de desgaste; pocos días, autocorrelación, sobredispersión y cambios de público/presupuesto afectan la inferencia.

Mejora/deterioro sostenido requieren registros completos, mínimos anteriores, cambio de al menos20%, intervalo que excluya cero y ambas mitades recientes al menos10% en la misma dirección respecto de sus mitades anteriores correspondientes (mínimo3 resultados en cada mitad). Emparejar mitades evita confundir el patrón semanal con deterioro. Un pico aislado no cumple persistencia.

Estable exige cambio puntual≤10% e intervalo íntegro dentro de±20%. No excluir cero no demuestra estabilidad: lo demás es sin tendencia concluyente u observación. Sin gasto y gasto sin resultados tienen estados propios. Menor volumen con menor gasto se explica sin atribuirlo automáticamente a fatiga. Deterioro puede ser compatible con desgaste, pero no prueba fatiga creativa ni predice mañana. No usar el modelo para pausar automáticamente publicidad.

El panel muestra valores de ambas ventanas, variaciones, referencia histórica y detalles plegables de fórmulas/muestra/limitaciones. Cambiar barras/línea o el orden de la tabla no cambia la interpretación; cambiar el calendario sí recalcula el mismo modelo con ese rango.
