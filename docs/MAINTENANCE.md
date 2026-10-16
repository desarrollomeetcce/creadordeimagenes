# Mantenimiento y limpieza

El OWNER consulta **Mi cuenta → Espacio para archivos → Mantenimiento del sistema**. Puede ejecutar una pasada, actualizar el estado y consultar las diez ejecuciones recientes con fecha de Lima, origen, resultado y aviso comprensible de fallo. El panel no devuelve rutas privadas, secretos, cuerpos de errores de almacenamiento ni prompts.

Cada pasada procesa hasta 25 afiches temporales vencidos, 200 miniaturas de auditoría vencidas y 100 archivos (también limita a 20 segundos el inicio de nuevos borrados). La marca de caducidad y el encolado de todos los archivos/versiones/fondos se confirman en la misma transacción, bloqueando el afiche frente a guardado concurrente en biblioteca. La cola queda persistida antes del borrado. Una caída después de borrar permite volver a comprobar la ausencia del archivo sin perder el registro pendiente.

Un fallo conserva el elemento en AssetDeletion, aumenta sus intentos y retrasa la siguiente comprobación cinco minutos. No se guarda el mensaje técnico de la excepción. Un archivo ya ausente se considera retirado correctamente: el contador de archivos incluye esos casos idempotentes. La limpieza conserva metadatos del afiche, versiones e historial, y excluye afiches permanentes y adjuntos. También recoge archivos de afiches caducados por versiones anteriores de la aplicación cuando aún no tienen filesQueuedAt. No recupera archivos ya retirados ni cambia plazos de conservación.

Las ejecuciones simultáneas se rechazan con 409. Un registro RUNNING sin confirmación durante 15 minutos queda INTERRUPTED al iniciar otra pasada; se revisan de nuevo las operaciones de almacenamiento idempotentes. Los trabajos de IA renuevan actividad cada30 segundos y antes de llamadas. Al faltar confirmación durante15 minutos, hasta100 por pasada se clasifican UNCERTAIN y conservan su reserva para revisión del consumo; los ejecutores vivos no se recuperan por su antigüedad de inicio. La recuperación genera historial y evita publicar resultados tardíos. El mantenimiento no genera ni reintenta afiches, no llama al proveedor de IA y no envía correo.

## Vercel

vercel.json incluye GET /api/cron/maintenance una vez al día a las 10:00 UTC (alrededor de las 5:00 a. m. de Lima). La puntualidad efectiva depende del plan/proveedor; no se promete una hora exacta.

Para autorizarlo hay que configurar **una sola vez** CRON_SECRET en las variables Secret del entorno Production de Vercel, con al menos 32 caracteres aleatorios, y volver a desplegar. Usar un gestor de contraseñas para generar/conservar el valor. No reutilizar una clave API, la clave maestra ni el token de instalación. No pegar el valor en GitHub, documentación, URL o registros. El programador de Vercel lo envía en Authorization: Bearer; la ruta compara sin revelar el secreto. No acepta sesiones de usuario como sustituto, rechaza otros métodos y bloquea despliegues Preview.

Sin secreto válido devuelve 503 y no accede a los archivos. Con autorización ausente/incorrecta devuelve 401. Tener el secreto configurado solo muestra **preparada**: el panel indica ejecución recibida únicamente después de un resultado CRON persistido; avisa cuando no se recibe otro en 48 horas. Una prueba local no verifica el programador externo. Si hay más pendientes que el límite de una pasada, usar limpiezas manuales adicionales o ajustar el plan/programación conociendo los límites del alojamiento.

En esta entrega no se configuró el secreto externo ni se ejecutó mantenimiento sobre los archivos reales del usuario. El acceso disponible no permite gestionar las variables del proyecto Vercel (403 en comprobaciones anteriores). La limpieza manual del OWNER funciona sin CRON_SECRET.

## VPS / Hostinger VPS

`npm run maintenance` ejecuta una pasada sin iniciar generaciones, usando el mismo DATABASE_URL y, si procede, STORAGE_PATH y permisos del servidor web. Sus salidas solo contienen conteos y estado o un error genérico. Puede programarse con cron/systemd, cargando secretos desde el gestor o archivo protegido del alojamiento; no incluir valores en argumentos ni en el repositorio.

El worker existente ejecuta mantenimiento aproximadamente cada cinco minutos mientras esté activo; sus ejecuciones aparecen con origen Ejecutor del servidor. No necesita CRON_SECRET para esa modalidad. Mantenerlo supervisado y comprobar su última ejecución en el panel. La programación por calendario y el arranque después de reiniciar el VPS requieren validación en el servidor elegido.

## Migración

202610160012_maintenance es aditiva: añade Variation.filesQueuedAt, AssetDeletion y MaintenanceRun con índices. Aplicarla con el migrador versionado antes de desplegar. No borra archivos al migrar ni cambia usuarios, contraseñas, claves de proveedor, biblioteca o plazos. La cola comienza vacía; la próxima pasada procesa únicamente los vencidos conforme a las reglas anteriores.
