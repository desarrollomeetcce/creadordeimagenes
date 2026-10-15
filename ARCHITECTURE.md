# Arquitectura

## Aplicación y persistencia

Next.js App Router sirve una interfaz React en español y una API Node en `/api/*`. Zod valida entradas. Las operaciones mutantes exigen un Origin exacto; las sesiones usan cookies HttpOnly, SameSite Strict y Secure en producción. Solo se almacena el hash SHA-256 de un token aleatorio de 256 bits; las contraseñas usan Argon2id. El estado de la cuenta se vuelve a comprobar en cada petición. El rate limiting de autenticación es persistente.

`lib/auth.ts` centraliza autorización por proyecto y descendientes. OWNER tiene acceso global. ADMIN supervisa proyectos de usuarios normales sin acceso de escritura implícito y no puede alterar roles elevados. Compartir concede VIEW, GENERATE, EDIT o MANAGE dentro del proyecto. La cuenta OWNER final activa está protegida con bloqueo transaccional.

Prisma 7.6 usa `PrismaPg` y compilador WASM, sin motor de consultas nativo. Las migraciones SQL versionadas se aplican con `scripts/migrate.mjs`, `pg`, bloqueo advisory, transacción y checksum. No mezclar este historial `schema_migrations` con `prisma migrate deploy`.

## Instrucciones

El prompt completo inicial de Cursos y Diplomados está precargado y es editable en la base. El seed usa una clave única y una transacción para evitar duplicados. Los proyectos nuevos empiezan con su propio prompt, sin herencia del proyecto educativo.

El motor convencional aplica prioridades Proyecto → Categoría → Subproducto. Detecta precios y un conjunto inicial de países, elimina cláusulas heredadas que contradicen los valores más específicos y marca ambigüedades básicas. No representa comprensión semántica general: requiere revisar y autorizar la vista final. Las sustituciones y las ambigüedades se muestran. Ampliar el motor para preservar de forma más fina instrucciones combinadas dentro de una sola frase, exclusiones visuales y otros mercados.

Adjuntos privados con nombres de almacenamiento aleatorios; validación de formato, tamaño y límite de píxeles. PDF/DOCX se procesan convencionalmente para texto, sin IA ni OCR de pago. El contenido es contexto no confiable y jamás controla roles o presupuestos. Se envían referencias visuales al endpoint de edición de imágenes; se indica su propósito. Falta validar fidelidad gráfica de logos y exclusiones con un proveedor real.

## Configuración de IA

`ProviderAdapter` define descubrimiento, dirección creativa e imágenes. Primer adaptador: OpenAI, con destino fijo `api.openai.com`; no hay URL arbitraria susceptible de SSRF. Para agregar un proveedor, implementar y registrar un adaptador independiente. No se muestran proveedores sin adaptador.

AES-256-GCM usa nonce aleatorio de 12 bytes, etiqueta de autenticación y contexto AAD. La clave maestra de 32 bytes vive fuera de PostgreSQL. El cifrado es versionado; la API devuelve una proyección explícita sin ciphertext, con máscara final. Solo OWNER puede leer o modificar configuración, comprobar conexión o autorizar prueba.

`GET /v1/models` verifica acceso al catálogo. La intersección con capacidades documentadas habilita opciones; no demuestra saldo, acceso efectivo de generación ni calidad de resultados. La verificación caduca en 24 horas y cualquier cambio de configuración la invalida. Las credenciales eliminadas bloquean trabajos pendientes. Una petición ya enviada al proveedor no puede revocarse retroactivamente.

## Generación y costos

Las instrucciones revisadas y la configuración efectiva quedan en un snapshot del trabajo. La cola PostgreSQL permite cerrar el navegador. Cada worker reclama un trabajo con actualización condicional; varios workers no reclaman el mismo trabajo. Cada proceso trabaja secuencialmente. La reserva del lote entero ocurre en una transacción con bloqueo global; verifica límites diario, mensual, por operación y cantidad. Los IDs idempotentes evitan duplicar el mismo trabajo.

Los importes son reservas configuradas por OWNER en microdólares enteros. **No son precios inventados ni un límite garantizado de la factura externa.** Se guarda `usage` del proveedor; `actualMicros` permanece null hasta conciliación. Las operaciones inciertas retienen su reserva. Se recomienda límite adicional en la cuenta del proveedor. Faltan conciliación tarifaria y límites por usuario/proyecto.

El worker invoca dirección creativa y generación, conserva PNG individuales y adapta formatos por contain con márgenes, sin deformación ni recorte. No promete edición de objetos en imágenes aplanadas. No hay reintentos automáticos de llamadas inciertas. Al arrancar se marcan trabajos RUNNING de más de 15 minutos como inciertos; la recuperación completa de leases y cancelación está pendiente.

Los originales expiran a las 48 horas salvo conservación explícita. La limpieza se ejecuta en el worker. Metadatos, consumos y auditoría permanecen. Las descargas PNG/JPG y ZIP se autorizan en backend. El ZIP admite hasta 200 imágenes y 100 MB de originales por operación. Falta S3 y retención separada de miniaturas administrativas.
