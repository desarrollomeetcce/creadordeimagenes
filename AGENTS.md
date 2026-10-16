# Instrucciones para desarrollo

- Leer docs/MASTER_SPEC.md, docs/MASTER_SPEC_PDF.txt y PROGRESS.md antes de ampliar el alcance.
- La jerarquía es Proyecto → Categoría → Subproducto → Variaciones. Cada proyecto tiene identidad independiente.
- No introducir campos comerciales obligatorios de país, precio o moneda.
- Toda autorización se valida en el servidor. OWNER global; ADMIN no accede a claves ni a proyectos privados de OWNER u otros ADMIN.
- Las claves de proveedor solo se descifran en servidor; no registrar cuerpos de solicitudes, secretos, respuestas completas del proveedor ni volcados del entorno.
- No añadir modelos visibles por defecto: intersectar catálogo documentado con consulta real de la cuenta.
- No ejecutar llamadas facturables de prueba sin autorización específica. Las pruebas automáticas usan dobles explícitos, jamás credenciales reales.
- No reintentar automáticamente operaciones con posible cargo incierto.
- Mantener PROGRESS.md y TESTING.md con evidencia; no marcar completa una fase por existir una interfaz.
- Cambios en datos: migración SQL versionada y actualización de prisma/schema.prisma. No modificar migraciones aplicadas.
- Pruebas pertinentes: npm test, npm run typecheck, npm run build; integración contra base exclusiva cuando se modifiquen rutas o persistencia.
