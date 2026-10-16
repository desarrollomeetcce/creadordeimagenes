# Avance por fases · continuación del desarrollo

## Alcance

La referencia sigue siendo el prompt maestro completo (54 secciones) y el requisito obligatorio de administración visual de IA. Se conservan en docs/MASTER_SPEC.md y docs/MASTER_SPEC_PDF.txt. Esta continuación añade comportamiento real a la primera entrega y mantiene el mismo PR. La plataforma completa todavía no se declara terminada ni desplegada.

## Funciones implementadas

- Instalación segura de OWNER, login/logout, registro pendiente, aprobaciones, roles y protección del último OWNER activo.
- Proyectos independientes y proyecto inicial Cursos y Diplomados con su prompt completo. Categorías, creación de 1–20 subproductos por operación sin limitar el total de la categoría, formularios compactos y prompts versionados.
- Herencia operativa y resolución convencional de conflictos básicos comerciales, con vista previa y revisión humana. No se atribuye comprensión semántica completa al motor convencional.
- Adjuntos privados TXT/CSV, PDF/DOCX con extracción convencional de texto e imágenes PNG/JPG/WebP. SVG simples con lista permitida estricta, rasterización a PNG y rechazo de scripts, enlaces, entidades y elementos no admitidos.
- Configuración de IA exclusiva del OWNER: clave cifrada con AES-256-GCM y clave maestra externa, máscara, reemplazo y eliminación, consulta real de modelos, capacidades compatibles, parámetros, alternativas guardadas, presupuestos y prueba opcional con autorización de cargo. La generación se bloquea sin configuración verificada.
- Dirección creativa estructurada y composición editable activada por defecto. El modelo propone textos, posiciones, tipografías, colores y logos autorizados. Sharp conserva esos elementos independientes y renderiza textos exactos. En modalidad Texto no se solicita una fotografía al modelo de imágenes.
- Editor de ajustes manuales: mover elementos, modificar texto, tamaño, color, fuente y alineación; ajustar áreas de logos conservando su proporción; deshacer/rehacer en la sesión y guardar una versión nueva sin IA. Se rechazan desbordamientos y recursos ajenos. La vista HTML es orientativa; el servidor produce y valida el PNG final.
- Historial de versiones inmutables, vista de versiones anteriores y restauración como copia nueva. Control de revisión concurrente para evitar sobrescrituras.
- Edición con IA del fondo conservando las capas, o de la imagen completa con resultado aplanado; adjuntos en el prompt de variación; autorización de cargo obligatoria, reserva y auditoría. El original se conserva. Las ediciones simultáneas de IA de una variación se bloquean.
- Aprobación/rechazo, favoritos, duplicación independiente sin IA, papelera y restauración de afiches. Regeneración individual o selectiva de alternativas independientes, sin sobrescribir los originales.
- Cola persistente en PostgreSQL, snapshots, reclamación atómica, reservas transaccionales, idempotencia, cancelación de pendientes y reintentos autorizados. Las operaciones inciertas no se repiten automáticamente y retienen su reserva. Recuperación de trabajos RUNNING antiguos como inciertos.
- Biblioteca personal con carpetas/subcarpetas, búsqueda, traslado de afiches, renombrado y eliminación de carpetas vacías. Guardado explícito por usuario; un archivo no vuelve a temporal mientras otro usuario lo conserve. La limpieza temporal elimina también los archivos de versiones y sus fondos.
- Configuraciones reutilizables personales, compartidas y oficiales: guardar, duplicar, aplicar y eliminar según permisos. Las oficiales solo las administra OWNER, incluso si su autor fue degradado de rol. Se reutilizan prompts y parámetros; los adjuntos reutilizables de presets quedan pendientes.
- Límites globales y particulares por usuario/proyecto: reservas mensuales/diarias y cantidad diaria. Se validan dentro de la transacción antes de crear trabajos. Los costos reales no informados permanecen desconocidos: los importes son reservas, no una tarifa inventada ni un techo garantizado de factura.
- Descargas privadas PNG/JPG/ZIP y adaptación de las siete proporciones. Compartición por proyecto, supervisión ADMIN de proyectos USER y acceso global OWNER, auditoría y papelera persistente.
- Dockerfile, compose.yaml y guía de VPS preparados para web, PostgreSQL, migraciones y worker separados, con datos persistentes y web ligada a localhost detrás de HTTPS. Su construcción Docker y el despliegue en VPS aún no se han verificado.

## Validación

- Cliente Prisma generado y migración aditiva aplicada correctamente en PostgreSQL temporal.
- TypeScript y compilación de producción aprobados.
- 15 pruebas unitarias aprobadas: incluyen cifrado, herencia, contratos de IA simulados, documentos, proporciones, edición gráfica, logos y SVG.
- Suite de integración ampliada contra HTTP/PostgreSQL reales: edición/versiones, concurrencia, IA simulada, revisión, duplicación, cancelación, biblioteca, presets, límites particulares, regeneración selectiva y limpieza. Resultado: 33 escenarios aprobados (34 resultados contando el contenedor de la suite).
- No se han utilizado credenciales reales de IA ni efectuado llamadas facturables. Las pruebas de proveedor usan transporte simulado explícito; no establecen conectividad real con OpenAI.

## Estado por fases

| Fase                         | Estado                                                       | Pendientes principales                                                                                                                |
| ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Base                     | Funcional con pruebas                                        | Mejora semántica de herencia, acciones secundarias y reemplazo/miniaturas de adjuntos                                                 |
| Configuración IA obligatoria | Implementada                                                 | Validación externa con credencial real en instalación privada                                                                         |
| 2 · IA                       | Adaptador y flujo completos en código, con pruebas simuladas | Generación real autorizada, validación visual y conciliación del consumo                                                              |
| 3 · Producción masiva        | Funcional parcial                                            | Selección granular de subproductos, métricas de rendimiento y pruebas de carga reales                                                 |
| 4 · Edición y calidad        | Funcional parcial                                            | QA en navegador, detección de superposiciones, dirección creativa y fidelidad de fotos/logos con IA real                              |
| 5 · Productividad            | Funcional parcial                                            | Identidades de marca, adjuntos reutilizables en presets y descargas transversales por proyecto/categoría                              |
| 6 · Administración           | Funcional parcial                                            | Recuperación de contraseña, gestión avanzada, conciliación tarifaria, estadísticas y retención separada de miniaturas administrativas |
| 7 · Producción               | Preparada parcialmente                                       | Construcción Docker, VPS privado, HTTPS, backups ensayados, revisión de seguridad y monitorización                                    |

El flujo comercial de 120 afiches reales con logos y revisiones visuales no se considera validado hasta efectuar la prueba externa autorizada. La entrega sigue en borrador y no se ha habilitado para trabajadores.
