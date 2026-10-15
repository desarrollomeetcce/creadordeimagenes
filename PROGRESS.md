# Avance por fases · 15 de octubre de 2026

## Alcance de esta entrega

Se leyeron íntegramente las 54 secciones del PDF y su requisito adicional de administración visual de IA, y se conservan las referencias en docs/. El repositorio original solo contenía README.md. Se implementó software ejecutable con frontend, API, PostgreSQL, worker y pruebas; no se declara terminado el conjunto completo del prompt maestro.

## Funcionalidades implementadas y verificadas

- Inicialización exclusiva de OWNER con token secreto, sin credenciales públicas; seed idempotente de Cursos y Diplomados con prompt completo y editable.
- Login, logout, registro pendiente, aprobación/suspensión, roles y protección transaccional del último OWNER activo.
- Proyectos independientes, categorías, subproductos compactos, creación de 1–20 por operación y más de 20 por categoría; pegado de nombres y carga simple de líneas CSV.
- Prompts versionados; herencia operativa; vista de instrucciones efectivas; conflictos básicos de precios y países; excepciones particulares. La interpretación semántica general sigue siendo parcial.
- Adjuntos privados, propósito y validaciones. Extracción convencional probada de TXT, PDF y DOCX; PNG/JPG/WebP como referencias del adaptador. CSV se trata como texto. No se ejecuta IA por subir archivos.
- Configuración de IA exclusiva de OWNER: API key protegida, cifrado autenticado AES-256-GCM, máscara, reemplazo y eliminación, revisión de configuración y caducidad de verificación.
- Endpoint de comprobación real de modelos; catálogo de capacidades intersectado con la respuesta; modelos de imagen/creatividad, calidad, resolución, alternativas guardadas y presupuestos configurables.
- Prueba de generación opcional con autorización explícita de posible cargo; bloqueada sin credencial verificada y parámetros compatibles.
- Cola PostgreSQL, snapshots, reclamación atómica, idempotencia y reservas de lote transaccionales. Worker separado que continúa sin navegador.
- Registro de uso sin inventar costo real. Límite diario, mensual, por operación y cantidad. Prueba de competencia de reservas: solo una de tres solicitudes con cupo para una fue admitida.
- Galería individual, favoritos básicos, conservación opcional, descargas PNG/JPG y ZIP privadas; expiración de originales a 48 horas y limpieza en worker.
- Adaptación de siete proporciones mediante contain con márgenes: pruebas de dimensiones, sin deformación ni recorte.
- Compartición por proyecto, acceso global OWNER, supervisión ADMIN de proyectos USER, papelera y restauración sin eliminar auditoría.
- Documentación de arquitectura, datos, instalación, backups, pruebas y pendientes.

## Estado por fases

| Fase                            | Estado                                                     | Lo que falta para considerarla completa                                                                                 |
| ------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1 · Base                        | Parcial funcional                                          | SVG seguro, miniaturas/reemplazo de adjuntos, acciones avanzadas y resolución más fina de lenguaje natural              |
| Precondición · Configuración IA | Implementada; validación externa pendiente                 | Probar conectividad y generación con credencial real, revisar permisos/modelos de la cuenta                             |
| 2 · IA real                     | Integración implementada y probada con transporte simulado | Generación externa real, validación visual y conciliación de consumos con el proveedor                                  |
| 3 · Masivo                      | Parcial funcional                                          | Recuperación completa de leases, cancelación, selección granular y reintentos autorizados                               |
| 4 · Calidad/edición             | Pendiente                                                  | Capas, edición manual, edición con IA, versiones y verificaciones gráficas completas                                    |
| 5 · Productividad               | Parcial funcional                                          | Biblioteca con carpetas, presets, brand kits y descargas transversales por proyecto/categoría                           |
| 6 · Administración              | Parcial funcional                                          | Recuperación de contraseña, gestión avanzada, presupuestos por usuario/proyecto, estadísticas y miniaturas de auditoría |
| 7 · Producción                  | Preparada parcialmente                                     | QA en navegador, pruebas de carga y seguridad, S3, despliegue, monitorización y restauración de backups ensayada        |

## Validación ejecutada

- Generación de cliente Prisma sin motor nativo: correcta.
- Migración SQL aplicada en PostgreSQL temporal: correcta.
- TypeScript: correcto.
- Compilación de producción Next.js: correcta.
- 10 pruebas unitarias: aprobadas, incluyendo PDF/DOCX y contrato del adaptador.
- Suite HTTP/PostgreSQL: 21 escenarios funcionales aprobados (22 resultados del ejecutor al incluir el contenedor de la suite).
- Worker y descargas PNG/JPG/ZIP: probados con proveedor simulado explícito y almacenamiento local real.
- No se ejecutaron llamadas facturables ni se usaron credenciales reales de IA.
- No se realizó QA visual con navegador ni se desplegó un servicio público.

## Limitaciones relevantes

Los logos se envían como referencias; su fidelidad y exclusiones no han sido validadas con OpenAI. Los originales de este modo son aplanados. Las alternativas se guardan, pero no activan fallback automático facturable. Los presupuestos son reservas configuradas, no tarifas reales ni un techo garantizado de la factura externa. El costo real no informado se representa como desconocido. Algunas acciones secundarias del documento todavía no están implementadas.

El flujo completo de 120 afiches con logos, edición y revisión comercial real no se considera validado hasta completar las fases correspondientes y una prueba externa autorizada.
