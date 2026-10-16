# Despliegue

Usar un servidor Node.js 24 o plataforma compatible con procesos persistentes, PostgreSQL administrado y un worker siempre activo. No depende del computador del usuario. El usuario ya desplegó una instalación de pruebas con Vercel y Neon; todavía no se ha desplegado ni validado el VPS.

## Instalación

Seguir README. Configurar variables de `.env.example` en el gestor de secretos del entorno. Usar HTTPS y `APP_ORIGIN` exacto. La clave maestra se genera una sola vez y se conserva fuera de la base; su pérdida impide descifrar credenciales existentes. No regenerarla en cada reinicio.

Ejecutar `npm ci`, `npm run db:deploy`, `npm run build`. Iniciar `npm start` detrás de un proxy TLS. Iniciar `npm run worker` como proceso independiente con reinicio supervisado. Ambos requieren las mismas variables y un volumen privado compartido para STORAGE_PATH. El usuario del proceso necesita escritura en ese directorio; nunca servirlo como carpeta estática.

Usar `NODE_USE_ENV_PROXY=1` en Node 24 cuando el servidor requiera proxy HTTP configurado. Mantener verificación TLS y CA corporativa. Permitir salida HTTPS a api.openai.com; la conexión se comprueba desde la UI. Las pruebas locales de esta entrega no tienen credenciales externas de IA y no acreditan esta conectividad.

El primer OWNER se crea con token de instalación secreto. Eliminar el token del entorno al finalizar. Las credenciales de proveedores se administran posteriormente por UI. Verificar modelo, presupuesto y worker antes de autorizar una prueba facturable.

## Operación

- Base y archivos deben estar en almacenamiento persistente.
- `npm run worker` ejecuta limpieza de originales no conservados después de 48 horas.
- Poner límites de factura también en el proveedor: las reservas locales no garantizan un precio externo máximo.
- No añadir logging de cuerpos de requests ni respuestas del proveedor; no exponer claves en herramientas de observabilidad.
- Ejecutar en una zona horaria UTC para cálculo de presupuestos diarios/mensuales; las fechas de interfaz usan America/Lima.
- Habilitar backups cifrados con `pg_dump`, snapshots de archivos y backup independiente de clave maestra en el gestor de secretos. Ensayar restauración juntos en un entorno aislado.
- Rotación de clave maestra pendiente de herramienta automática: requiere volver a cifrar credenciales con la clave anterior antes de retirar esta. El OWNER puede reemplazar credenciales individuales desde UI.
- Aislar permisos de DB: en producción usar un rol migrador y un rol de aplicación con mínimo privilegio. Reforzar AuditEvent como append-only para el rol de aplicación.

Antes de producción faltan validación visual con IA real, pruebas de carga, revisión avanzada de parsers, políticas de retención administrativas, observabilidad y prueba externa autorizada. La recuperación asistida y de emergencia está implementada; el correo automático sigue pendiente.

## Instalación aislada con Docker Compose

Se añadieron Dockerfile, compose.yaml y docs/VPS_INSTALLATION.md. Contemplan web y worker con almacenamiento compartido, PostgreSQL privado y migración previa al arranque. El contenedor incluye DejaVu para renderización de textos. El puerto web se liga a 127.0.0.1:3000 para usar el proxy HTTPS del VPS. La construcción y el arranque Docker están verificados localmente como usuario node, con PostgreSQL, login, roles, fuentes y escritura. El despliegue externo no se ha probado; no se han utilizado servidores del usuario.

En Vercel, Workflow SDK genera el ejecutor administrado durante el build. Requiere las variables de sistema del despliegue habilitadas, especialmente VERCEL_DEPLOYMENT_ID; no usa claves de IA en el historial del runtime. Sin ese requisito, el procesamiento en segundo plano se deshabilita y se conserva el interactivo. Los pasos de IA no reintentan automáticamente. El backend local de Workflow es exclusivo de pruebas con almacenamiento persistente explícito; no reemplaza el worker supervisado de VPS. Consultar docs/VERCEL_TRIAL.md para pausa, estados y límites.

## Copias y recuperación de acceso

Se ensayó una copia custom de PostgreSQL con snapshot consistente y restauración en otra base local: ocho migraciones, conteos de 11 tablas y hashes de archivos BYTEA idénticos. Esto valida el procedimiento con datos sintéticos; no acredita restauración del VPS externo ni de archivos locales o claves maestras. Las copias reales deben cifrarse, mantenerse fuera de Git y probarse junto con archivos/secretos. Se excluyen backups y códigos de emergencia de Git/contexto Docker como protección adicional.

OWNER puede preparar un código de emergencia desde Mi cuenta y guardarlo fuera de la plataforma. Cambios de contraseña/rol/estado lo revocan; debe generar otro después de recuperar la cuenta. El código no sustituye el backup de AI_MASTER_KEY.
