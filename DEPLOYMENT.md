# Despliegue

Usar un servidor Node.js 24 o plataforma compatible con procesos persistentes, PostgreSQL administrado y un worker siempre activo. No depende del computador del usuario. No se ha contratado ni desplegado infraestructura.

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

Antes de producción faltan QA visual, recuperación de contraseña, pruebas de carga, revisión de parsers, políticas de retención administrativas, observabilidad y prueba real autorizada de OpenAI.
