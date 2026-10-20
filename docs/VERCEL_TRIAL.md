# Prueba inicial en Vercel y futura migración a VPS

Publicar la interfaz no crea automáticamente una base de datos ni usuarios. La aplicación usa PostgreSQL para cuentas, sesiones, proyectos, prompts, permisos, versiones, trabajos, consumos y auditorías. Las claves de IA se conservan cifradas con una clave maestra externa a la base.

## Paso inicial: acceso y proyectos

1. Conectar una base PostgreSQL persistente al proyecto Vercel. Neon es una opción mediante Marketplace; también puede usarse otro PostgreSQL compatible.
2. Configurar secretos del servidor en Vercel: DATABASE_URL (conexión de aplicación), DIRECT_DATABASE_URL si el proveedor entrega una conexión directa separada para migraciones, APP_ORIGIN (URL HTTPS exacta), AI_MASTER_KEY (32 bytes base64) y BOOTSTRAP_TOKEN (aleatorio, mínimo 32 caracteres). Nunca poner estos valores en GitHub ni compartirlos por el chat.
3. Ejecutar `npm run db:deploy` en un entorno con acceso autorizado a esa base. Esto crea las tablas de la aplicación en una base vacía o aplica migraciones pendientes; no contrata una base nueva. El migrador prefiere DIRECT_DATABASE_URL si existe.
4. Desplegar o redesplegar el proyecto con su configuración. La pantalla distinguirá la instalación pendiente del inicio de sesión. Crear la cuenta OWNER inicial mediante el token de instalación; retirar después ese token del servidor.
5. Probar ingreso, proyectos, categorías, subproductos y prompts.

No se incluyen cuentas públicas predeterminadas. Un usuario o contraseña de ejemplo no permite entrar: primero debe existir realmente la cuenta en la base conectada a ese despliegue.

## Archivos y procesamiento en esta etapa

En Vercel (`VERCEL=1`) el almacenamiento se selecciona automáticamente como PostgreSQL y utiliza la tabla privada StoredAsset. La migración `202610160004_stored_assets` debe estar aplicada antes de cargar archivos. No se utiliza el disco efímero de la función como biblioteca. En VPS continúa el almacenamiento local por defecto; `STORAGE_BACKEND=postgres` permite conservar todos los archivos en PostgreSQL también allí. Las referencias antiguas locales y las nuevas con prefijo pg: conservan su mecanismo de lectura correspondiente. No existe un endpoint público para leer StoredAsset directamente.

Este adaptador es para la prueba inicial: límite lógico predeterminado de 2 GiB de archivos, ajustable mediante STORAGE_LIMIT_MB (16–65536), con cuota comprobada bajo bloqueo transaccional; máximo 16 MiB por recurso procesado. El límite de archivos no incluye índices, tablas, historial de Neon, copias ni otros conceptos de facturación, y no garantiza un techo de factura. La capacidad lógica no amplía el plan contratado de Neon. Para producción masiva sigue pendiente incorporar almacenamiento de objetos y ensayar cargas externas.

Los adjuntos en Vercel se limitan a 3 MB por archivo y el cuerpo multipart a 3,5 MB para quedar dentro del límite de solicitud del alojamiento. En VPS se mantienen los 10 MB. Almacenamiento permite originales de hasta 1 GiB con solicitudes separadas de 2 MiB, pausa/reanudación por archivo y descarga autenticada por rangos, sin cargar todo el original en memoria. Los originales se guardan completos; generación usa una copia gráfica optimizada o un extracto acotado. El explorador interno permite vincular carpetas e imágenes en proyectos, productos y subproductos. La prueba local transportó un archivo real de 1 GiB con SHA-256 idéntico; estos volúmenes aún no se han ensayado en Vercel/Neon de producción. El build configurado en vercel.json aplica las migraciones pendientes antes de compilar.

En **Generaciones → Procesar pendientes en esta pantalla** se ejecutan secuencialmente trabajos que ya fueron autorizados. La pantalla debe permanecer abierta para iniciar los siguientes; pausar detiene el avance después del actual. El servidor reclama cada trabajo atómicamente y admite uno en curso por cuenta. Comprueba permisos, vigencia de configuración y espacio antes de la llamada. Una operación de IA interrumpida no se repite automáticamente. Los presupuestos y el consentimiento previo siguen siendo obligatorios.

El endpoint exige sesión y Origin correctos; solo el autor o OWNER pueden procesar un trabajo y se vuelven a comprobar los permisos del autor original. La función tiene maxDuration=300 y las llamadas de una ejecución interactiva comparten un plazo de 240 segundos. Un corte forzoso del servidor puede dejar RUNNING hasta que se ejecute mantenimiento después de 15 minutos; queda UNCERTAIN y conserva su reserva. Este modo interactivo requiere el navegador abierto. La opción duradera en segundo plano se describe más abajo; para VPS también sigue disponible el worker persistente.

**Mi cuenta**, para OWNER, muestra espacio utilizado y permite limpiar hasta 25 afiches temporales caducados por ejecución. La limpieza conserva los permanentes y los archivos de otras copias. También reconoce trabajos antiguos interrumpidos; no los reintenta. Las tres fuentes DejaVu admitidas se incluyen con su licencia y se incorporan al paquete del servidor para renderizar textos sin depender de fuentes del sistema.

Antes de una prueba facturable, OWNER debe configurar la IA en la interfaz, consultar modelos reales, guardar parámetros y presupuestos y verificar de nuevo. Ninguna prueba de desarrollo habilita ni valida una credencial de producción.

## Portabilidad

PostgreSQL es portable. Para pasar a otro servidor se exportan/restauran los datos, se trasladan los archivos de imágenes y adjuntos, se conserva de forma segura la misma clave maestra o se realiza una rotación controlada, y se actualizan las conexiones y el dominio. Vercel no obliga a alojar allí la plataforma permanentemente.

La base Neon externa está preparada. El usuario confirmó que ya pudo ingresar; también se verificó que hay un OWNER aprobado en esa base. El conector Vercel sigue sin autorización para consultar la configuración del equipo. Los cambios de código se integran en main; el resultado de su despliegue externo debe comprobarse por separado. Los límites y condiciones de cualquier plan se revisan antes de contratar o activar consumo facturable.

Documentación oficial consultada: https://vercel.com/docs/postgres y https://vercel.com/docs/builds/configure-a-build.

## Galería y navegación

Después del despliegue de esta entrega, usar **Ver afiches del proyecto** o **Ver afiches de la categoría**. Los filtros se aplican también a **Descargar todos los resultados**. **Seleccionar página** acumula hasta 200 seleccionados entre páginas; cambiar filtros limpia la selección. La comparación requiere exactamente dos seleccionados. Las miniaturas se preparan bajo autorización y no se conservan separadamente del original.

Se conservan en la dirección la sección y los identificadores del recurso para recarga y Atrás/Adelante. No se incorporan prompts, contraseñas, claves o tokens a esos enlaces. Los enlaces a recursos ajenos se rechazan en servidor. La selección, los filtros y la página se reinician al recargar.

## Lotes en segundo plano

Generaciones incorpora «Procesar pendientes en segundo plano» con Workflow SDK. Programa únicamente trabajos pendientes que ya tienen autorización y reserva. Puedes cerrar el navegador después de que la aplicación confirme el registro y regresar a consultar el estado. Detener termina el trabajo actual y deja los demás pendientes; para liberar sus reservas, cancélalos. Los trabajos con cargo incierto requieren revisión y una autorización nueva antes de un nuevo intento.

Vercel necesita tener activado Settings → Environment Variables → Enable access to System Environment Variables para exponer VERCEL_DEPLOYMENT_ID en compilación y ejecución. Si no está disponible, la aplicación deshabilita el botón y conserva el procesamiento interactivo. No configures WORKFLOW_TARGET_WORLD=local en Vercel. El SDK genera las rutas .well-known/workflow y la infraestructura de cola al desplegar. Su consumo está sujeto a los límites y tarifas vigentes de Workflow/Vercel, aparte de los cargos del proveedor de IA; la reserva de API no incluye alojamiento.

Se comprobó la ejecución real con el backend local del SDK y sin navegador; falta una prueba externa autorizada de generación real con el ejecutor de Vercel. En VPS sigue disponible el worker persistente y no es obligatorio contratar Vercel. No activar el backend local de Workflow como sustituto de una cola administrada en un sistema de archivos efímero.
