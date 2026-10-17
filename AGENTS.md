# Instrucciones para desarrollo

- Leer docs/MASTER_SPEC.md, docs/MASTER_SPEC_PDF.txt y PROGRESS.md antes de ampliar el alcance.
- La jerarquía es Proyecto → Producto → Subproducto → Variaciones. Cada proyecto tiene identidad independiente.
- No introducir campos comerciales obligatorios de país, precio o moneda.
- Toda autorización se valida en el servidor. Por instrucción actual del usuario, ADMIN accede a proyectos propios, asignados o habilitados por OWNER para todos los administradores; puede editar/generar en ellos. Compartir producto/subproducto no expone hermanos ni instrucciones/adjuntos de ancestros; la ruta muestra solo metadatos mínimos de esos ancestros. Solo OWNER administra claves y cuentas elevadas. OBSERVER únicamente ve/descarga recursos compartidos. Los permisos de proyecto derivan del rol, no de un selector por colaboración.
- Las claves de proveedor solo se descifran en servidor; no registrar cuerpos de solicitudes, secretos, respuestas completas del proveedor ni volcados del entorno.
- No añadir modelos visibles por defecto: intersectar catálogo documentado con consulta real de la cuenta.
- No ejecutar llamadas facturables de prueba sin autorización específica. Las pruebas automáticas usan dobles explícitos, jamás credenciales reales.
- No reintentar automáticamente operaciones con posible cargo incierto.
- Mantener PROGRESS.md y TESTING.md con evidencia; no marcar completa una fase por existir una interfaz.
- Cambios en datos: migración SQL versionada y actualización de prisma/schema.prisma. No modificar migraciones aplicadas.
- Pruebas pertinentes: npm test, npm run typecheck, npm run build; integración contra base exclusiva cuando se modifiquen rutas o persistencia.

- Generaciones incluye trabajos propios y COMPLETED compartidos accesibles; gestionar solo autor/OWNER. Costos compartidos respetan el mismo ámbito, nunca referencias privadas de conciliación. Observador sin costos. Gastos diarios del proveedor solo OWNER, separados de ledger y sin repartir agregados entre imágenes.

- Cada ejecutor mantiene leaseToken interno y heartbeatAt. No exponer el token ni recuperar por startedAt si hay actividad vigente. Conservar resultados publicados ante fallo de acuse de COMMIT. Credenciales financieras separadas, con contexto de cifrado propio; nunca sustituir automáticamente la clave de generación.

- Planes: cuotas por autor/mes calendario Lima bajo bloqueo728291. Ilimitado solo interno/OWNER; no aparece ni se compra en catálogo público. Cuentas previas sin plan conservan acceso hasta asignación; no asignar ni cobrar silenciosamente. Reserva/coste desconocido no se presenta como saldo API real.
- Por instrucción actual del OWNER, solo el plan determina cuotas comerciales de generación. Presupuestos globales/particulares heredados quedan inactivos y fuera de la interfaz. Reserva nueva = presupuesto IA / imágenes del plan; OWNER/Ilimitado/cuentas previas sin plan reservan cero. No modificar ledger histórico ni confundir cero reserva con coste real conocido. Mantener verificación de modelos y credenciales.
- Pagos Mercado Pago/PayPal: credenciales cifradas con contexto separado. Checkout no activa planes por retorno de navegador. Verificar firma/API, importe/moneda/vendedor/referencia/entorno y unicidad del pago antes de activar. Sandbox no concede planes reales. Solo endpoints exactos POST de webhook omiten Origin y exigen autenticación del proveedor. No ejecutar cobros de prueba reales sin autorización específica.

- Personalizados: customUserId fija destinatario, siempre isPublic=false y descripción vacía. Crear asigna sin cobrar; cuotas y vigencia se administran explícitamente. Catálogo público excluye personalizados/retirados/Ilimitado; checkout revalida destinatario. Retirar con archivedAt conserva cuotas y pagos previos, nunca libera acceso por quitar el plan del catálogo.
- Página pública: edición exclusiva OWNER, validación de secciones, revisión optimista y textos escapados; no inventar testimonios, clientes ni métricas. El HTML público no incluye correos o planes privados.

- Explorador: nodos automáticos son metadatos de recursos autorizados; no cambiar proyecto/permisos al mover referencias. Carpetas/documentos personales por userId; rechazar ciclos bajo bloqueo428281. Borrar carpetas traslada contenido a raíz. LibraryExclusion oculta solo para una cuenta. Biblioteca admite OBSERVER solo lectura/descarga y respeta permisos actuales de origen.
- Muestras: previewFirst/approvalGroup/index en snapshot; antes de tomar un trabajo posterior comprobar aprobación de una primera muestra completada del mismo actor/grupo bajo728291. Saltar retenidos al buscar el siguiente trabajo. No reintentar cargos ni generar por recibir mensajes de otra pestaña. Aprobación no copia bytes; continuar el lote sí utiliza API autorizada.
