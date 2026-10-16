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
