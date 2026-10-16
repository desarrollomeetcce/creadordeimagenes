# Creador de Imágenes · Estudio AI

Aplicación web en español para producción publicitaria multiproyecto. Implementación funcional con persistencia PostgreSQL, autenticación, proyectos, categorías, subproductos, instrucciones heredadas, administración cifrada de IA exclusiva del OWNER, composición editable, historial de versiones, biblioteca y límites por usuario/proyecto.

**Estado:** desarrollo por fases; no es todavía la totalidad del prompt maestro ni una aplicación certificada para producción. Véanse [PROGRESS.md](PROGRESS.md) y [TESTING.md](TESTING.md). No se ha verificado una generación externa real: faltan credenciales del proveedor. Las pruebas simuladas están identificadas como tales.

## Inicio local

Requisitos: Node.js 24, npm y PostgreSQL 16 o superior.

1. `npm ci` (genera el cliente Prisma sin descargar un motor nativo).
2. Copiar `.env.example` a `.env`. Configurar `DATABASE_URL`, `APP_ORIGIN`, `AI_MASTER_KEY` y `BOOTSTRAP_TOKEN`.
3. Generar `AI_MASTER_KEY` una sola vez con `openssl rand -base64 32`; generar el token inicial con `openssl rand -hex 32`. Guardar ambos fuera de Git. Conservar copia segura de la clave maestra.
4. Exportar las variables al proceso; por ejemplo, `set -a; . ./.env; set +a` en una shell de confianza.
5. `npm run db:deploy`, `npm run build`, `npm start`.
6. En otro proceso con el mismo entorno y almacenamiento: `npm run worker`.
7. Abrir `http://localhost:3000`, crear el OWNER con el token de instalación y una contraseña de al menos 12 caracteres. No existen cuentas públicas predefinidas. Retirar `BOOTSTRAP_TOKEN` del servidor tras la instalación.
8. Entrar en **Configuración de IA**, guardar la clave de OpenAI, verificar conexión, elegir los modelos recibidos y sus parámetros, configurar presupuestos, guardar y verificar nuevamente. Las modificaciones invalidan la comprobación previa.
9. La prueba opcional exige marcar una autorización de cargo. Solo entonces se crea un trabajo de prueba. El worker debe estar activo.

La clave maestra se configura durante instalación. Las claves de los proveedores se administran desde la interfaz; nunca se devuelven después de guardarse. No se requieren cambios de código para reemplazar o eliminar una credencial.

## Comprobaciones

- `npm test`: pruebas unitarias de cifrado, herencia, archivos, capacidades y proporciones.
- `npm run typecheck`: TypeScript.
- `npm run build`: compilación de producción.
- `npm run test:integration`: requiere un servidor local conectado a una **base vacía y exclusiva de pruebas**, con las mismas variables que el proceso de pruebas. No ejecutar sobre datos de trabajo. Detalles en [TESTING.md](TESTING.md).

## Componentes

Next.js App Router / React / TypeScript; API con Zod; Prisma ORM 7.6 con adaptador `pg` y compilador WASM; PostgreSQL; Argon2id; AES-256-GCM; worker persistente basado en PostgreSQL; Sharp; PDFParse; Mammoth; JSZip.

Se usan CSS y controles accesibles nativos para reducir dependencias iniciales. PostgreSQL implementa la primera cola durable mediante reclamación atómica; Redis/BullMQ y una biblioteca de componentes no son necesarios para esta primera versión. Son decisiones de implementación, no sustitutos de la generación real.

No se contratan servicios ni se realizan llamadas de IA automáticamente al crear proyectos, guardar prompts, adjuntar documentos o iniciar la aplicación.

## Continuación del flujo creativo

La generación editable conserva textos y logos independientes. En la galería, **Ajustar / Editar con IA** abre el editor: los ajustes manuales no consumen IA y crean versiones nuevas. Restaurar conserva el historial; editar fondo con IA mantiene las capas, mientras editar la imagen completa produce una versión aplanada. Toda operación facturable exige autorización explícita. Se añadieron biblioteca con carpetas, configuraciones guardadas, aprobación/rechazo, duplicación, regeneración selectiva y controles de cola.

La instalación de VPS está preparada en [docs/VPS_INSTALLATION.md](docs/VPS_INSTALLATION.md); todavía no se ha realizado ni probado su construcción Docker.
