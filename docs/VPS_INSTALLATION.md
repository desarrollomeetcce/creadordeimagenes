# Preparación para un VPS privado

La aplicación necesita un VPS con Docker Compose, dominio y proxy HTTPS. Los archivos Dockerfile y compose.yaml preparan web, worker, migración y PostgreSQL en servicios separados. La imagen se construyó y probó localmente como usuario node (UID 1000), con autenticación/PostgreSQL, fuentes y escritura privada. No se ha instalado en un VPS del usuario.

Procedimiento para la persona que realiza la instalación:

1. Usar un VPS de pruebas o una instalación aislada de los servicios existentes. Crear un usuario operativo y acceso SSH limitado.
2. Obtener la rama main y crear un `.env` privado, nunca en Git. `POSTGRES_PASSWORD` debe ser hexadecimal para evitar caracteres especiales en la URL. Generar una contraseña aleatoria, `AI_MASTER_KEY` con 32 bytes en base64 y BOOTSTRAP_TOKEN de al menos 32 caracteres. Definir APP_ORIGIN con el dominio HTTPS exacto.
3. Construir con `docker compose build`. Si el servidor usa una CA de proxy corporativa, pasarla mediante el secreto de BuildKit `proxy_ca`; no copiarla a capas ni desactivar TLS.
4. Ejecutar `docker compose up -d`. La migración espera a PostgreSQL y web/worker esperan a la migración. La base no publica un puerto externo. Web escucha solo en 127.0.0.1:3000, detrás del proxy HTTPS del VPS.
5. Crear el OWNER por la pantalla inicial con el token de instalación. Retirar BOOTSTRAP_TOKEN del entorno y recrear web/worker. Las claves del proveedor se administran únicamente desde Configuración → Inteligencia Artificial.
6. Verificar la conexión real de la cuenta, seleccionar modelos y límites y autorizar una única prueba con posible cargo. Probar generación, corrección manual, edición con IA, biblioteca y descargas antes de invitar a trabajadores.
7. Configurar backups de los volúmenes postgres y assets, y copia independiente de la clave maestra. Ensayar restauración. No usar `docker compose down -v` para una actualización: elimina los volúmenes.

No entregar contraseñas ni claves por el chat. El acceso al VPS y la configuración de secretos requieren el canal seguro de la instalación. Todavía faltan QA de navegador y prueba externa autorizada antes de uso productivo.

## Verificación local realizada

Docker construye y ejecuta como node después de instalar fuentes/fontconfig/CA con root. COPY asigna los archivos al usuario correcto; la caché de fuentes y el directorio de assets son escribibles. Se verificaron HTTP, PostgreSQL de prueba por socket, login Argon2, sesiones, consulta de proyectos, bloqueo OWNER y logout. Sharp renderizó texto usando DejaVu sin errores de configuración. Esto no verifica el VPS remoto, HTTPS ni el proveedor de IA.

En un entorno con proxy corporativo, se usó el proxy configurado y el secreto opcional proxy_ca sin desactivar TLS ni copiarlo a la imagen. La resolución del proxy dentro de Docker debe existir en ese entorno. Una copia PostgreSQL sintética se restauró en otra base con conteos y hashes BYTEA iguales; falta ensayar el conjunto base/volúmenes/clave maestra del servidor definitivo.
