# Criterios para cerrar la plataforma

La estimación actual de 85–90% corresponde al desarrollo funcional; no certifica producción ni se calcula a partir del número de pruebas. El esfuerzo restante depende también de la validación real del proveedor y del alojamiento. Este listado impide marcar 100% por tener una interfaz o un despliegue que compila.

## Verificados

- Acceso OWNER, cuentas y cuatro roles; permisos por proyecto/producto/subproducto en servidor.
- Prompts heredados, configuraciones reutilizables, adjuntos, marca, galerías y descargas privadas.
- Miniaturas privadas de adjuntos y reemplazos que conservan referencias anteriores; historial y borrado protegido.
- Auditoría visual de nuevas versiones exclusiva OWNER, plazo/cuota configurables, aviso a todos los roles y limpieza independiente.
- Historial legible con nombres, resúmenes, detalles desplegables, búsqueda completa paginada y nombres conservados en operaciones nuevas.
- Generación/edición y cola con contratos simulados, presupuestos, idempotencia, cancelación y cargos inciertos sin reintento automático.
- Generaciones retirables/restaurables sin borrar consumo; límites particulares editables/eliminables y precomprobación de presupuesto compartida con reservas. Estado de IA actualizado sin presentar catálogo como garantía de generación.
- Configuración IA cifrada, modelos consultables realmente, lista de pasos de preparación y generación bloqueada sin verificación. Prueba opcional verificada de extremo a extremo con adaptador simulado, sin certificar proveedor externo.
- Recuperación asistida y emergencia OWNER con código preparado de un uso.
- Restauración de espacios, filtros/selección por sesión y salida móvil.
- Mantenimiento con cola persistente de borrado, reintentos, resultados OWNER y ruta de programación autenticada; recepción real de Vercel pendiente.
- Cola completa paginada, selección/cancelación de hasta 200 pendientes y cancelación de pendientes de lote con reservas/cargos inciertos protegidos. Lote de 200 completado con adaptador simulado; no acredita proveedor real.
- Consumo paginado con totales completos, filtros y CSV privado de hasta 2000 operaciones; importes exactos y costes desconocidos explícitos. ZIP de 200 PNG y 200 JPG validado con archivos locales simulados.
- 75 escenarios de integración, cuatro de correo previamente verificados, 17 unitarias, compilación, instalación y recorridos Chromium locales.
- Imagen Docker construida/arrancada como usuario no root con autenticación, fuentes y archivos verificados.
- Copia PostgreSQL local restaurada en base independiente: doce migraciones, 17 tablas y hashes de archivos/miniaturas BYTEA comparados.

## Pendientes que impiden declarar terminado

| Pendiente | Condición de cierre |
| --- | --- |
| IA real | OWNER configura su proveedor desde la interfaz, verifica modelos y autoriza una prueba que puede generar cargo. Comprobar imagen, referencias, texto/logos, edición y descarga reales. La revisión del 16/10/2026 encontró clave guardada y modelos seleccionados, configuración UNVERIFIED después del guardado y límites inicialmente cero. Una revisión posterior confirmó reserva por afiche/operación USD 3 y límites diario/mensual USD 10, pendientes de nueva verificación; no se leyó ni descifró la clave. |
| Correo real | Panel SMTP y envío de recuperación implementados y probados con transporte simulado. OWNER debe introducir su buzón Hostinger en Configuración de correo, verificar TLS/autenticación y comprobar recepción mediante envío explícito. No se ha enviado correo externo. La entrega manual y emergencia siguen disponibles. |
| Carga y consumo | Validar un lote grande con proveedor real, rendimiento, recuperación de infraestructura y conciliación de costes que informe el proveedor. |
| Producción elegida | Validar HTTPS, ejecutor externo, almacenamiento y cuota, monitorización, configuración de CRON_SECRET y recepción real de la limpieza diaria con el alojamiento inactivo y restauración conjunta de base/archivos/clave maestra en el servidor elegido. Las comprobaciones locales no sustituyen las del VPS o Vercel externos. |

No se han realizado llamadas facturables de IA ni enviado correos externos durante el desarrollo. Los secretos se introducen en sus interfaces o canales de instalación seguros, nunca en este documento.
