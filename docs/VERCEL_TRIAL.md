# Prueba inicial en Vercel y futura migración a VPS

Publicar la interfaz no crea automáticamente una base de datos ni usuarios. La aplicación usa PostgreSQL para cuentas, sesiones, proyectos, prompts, permisos, versiones, trabajos, consumos y auditorías. Las claves de IA se conservan cifradas con una clave maestra externa a la base.

## Paso inicial: acceso y proyectos

1. Conectar una base PostgreSQL persistente al proyecto Vercel. Neon es una opción mediante Marketplace; también puede usarse otro PostgreSQL compatible.
2. Configurar secretos del servidor en Vercel: DATABASE_URL (conexión de aplicación), DIRECT_DATABASE_URL si el proveedor entrega una conexión directa separada para migraciones, APP_ORIGIN (URL HTTPS exacta), AI_MASTER_KEY (32 bytes base64) y BOOTSTRAP_TOKEN (aleatorio, mínimo 32 caracteres). Nunca poner estos valores en GitHub ni compartirlos por el chat.
3. Ejecutar `npm run db:deploy` en un entorno con acceso autorizado a esa base. Esto crea las tablas de la aplicación en una base vacía o aplica migraciones pendientes; no contrata una base nueva. El migrador prefiere DIRECT_DATABASE_URL si existe.
4. Desplegar o redesplegar el proyecto con su configuración. La pantalla distinguirá la instalación pendiente del inicio de sesión. Crear la cuenta OWNER inicial mediante el token de instalación; retirar después ese token del servidor.
5. Probar ingreso, proyectos, categorías, subproductos y prompts.

No se incluyen cuentas públicas predeterminadas. Un usuario o contraseña de ejemplo no permite entrar: primero debe existir realmente la cuenta en la base conectada a ese despliegue.

## Antes de generar afiches

La versión actual guarda archivos en disco y ejecuta un worker Node persistente. Publicar Next.js en Vercel no arranca ese worker ni proporciona un volumen privado compartido para los archivos. Para generar, adjuntar y conservar afiches hace falta configurar almacenamiento persistente y ejecución de trabajos compatible con el despliegue. No solucionar esto usando /tmp como biblioteca: los archivos no quedarían garantizados entre ejecuciones.

La primera prueba en Vercel puede limitarse a cuentas y organización de proyectos mientras se completa esta adaptación. El VPS preparado en compose.yaml ejecuta web, worker y almacenamiento compartido de forma conjunta. Una alternativa es alojar el backend/worker en un VPS y usar Vercel para la web, con integración y autenticación configuradas expresamente.

## Portabilidad

PostgreSQL es portable. Para pasar a otro servidor se exportan/restauran los datos, se trasladan los archivos de imágenes y adjuntos, se conserva de forma segura la misma clave maestra o se realiza una rotación controlada, y se actualizan las conexiones y el dominio. Vercel no obliga a alojar allí la plataforma permanentemente.

No se ha creado una base externa, una cuenta de acceso ni configurado el proyecto Vercel desde este entorno. Se necesita acceso autorizado a los servicios. Los límites y condiciones de cualquier plan se revisan antes de contratar o activar consumo facturable.

Documentación oficial consultada: https://vercel.com/docs/postgres y https://vercel.com/docs/builds/configure-a-build.
