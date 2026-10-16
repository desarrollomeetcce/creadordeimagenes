# Criterios para cerrar la plataforma

La estimación comunicada de ~80% corresponde al desarrollo funcional; no certifica producción ni se calcula a partir del número de pruebas. Este listado impide marcar 100% por tener una interfaz o un despliegue que compila.

## Verificados

- Acceso OWNER, cuentas y cuatro roles; permisos por proyecto/producto/subproducto en servidor.
- Prompts heredados, configuraciones reutilizables, adjuntos, marca, galerías y descargas privadas.
- Miniaturas privadas de adjuntos y reemplazos que conservan referencias anteriores; historial y borrado protegido.
- Generación/edición y cola con contratos simulados, presupuestos, idempotencia, cancelación y cargos inciertos sin reintento automático.
- Configuración IA cifrada, modelos consultables realmente y generación bloqueada sin verificación.
- Recuperación asistida y emergencia OWNER con código preparado de un uso.
- Restauración de espacios, filtros/selección por sesión y salida móvil.
- 65 escenarios de integración, cuatro de correo, 15 unitarias, compilación, instalación y recorridos Chromium locales.
- Imagen Docker construida/arrancada como usuario no root con autenticación, fuentes y archivos verificados.
- Copia PostgreSQL local restaurada en base independiente con comparación de datos y archivos BYTEA.

## Pendientes que impiden declarar terminado

| Pendiente | Condición de cierre |
| --- | --- |
| IA real | OWNER configura su proveedor desde la interfaz, verifica modelos y autoriza una prueba que puede generar cargo. Comprobar imagen, referencias, texto/logos, edición y descarga reales. La instalación consultada aún no tiene ProviderConfiguration. |
| Correo real | Panel SMTP y envío de recuperación implementados y probados con transporte simulado. OWNER debe introducir su buzón Hostinger en Configuración de correo, verificar TLS/autenticación y comprobar recepción mediante envío explícito. No se ha enviado correo externo. La entrega manual y emergencia siguen disponibles. |
| Retención administrativa | Completar miniaturas de auditoría y su conservación configurable independiente. Las miniaturas y el reemplazo de adjuntos ya están implementados y probados. |
| Carga y consumo | Validar un lote grande con proveedor real, rendimiento, recuperación de infraestructura y conciliación de costes que informe el proveedor. |
| Producción elegida | Validar HTTPS, ejecutor externo, almacenamiento y cuota, monitorización y restauración conjunta de base/archivos/clave maestra en el servidor elegido. Las comprobaciones locales no sustituyen las del VPS o Vercel externos. |

No se han realizado llamadas facturables de IA ni enviado correos externos durante el desarrollo. Los secretos se introducen en sus interfaces o canales de instalación seguros, nunca en este documento.
