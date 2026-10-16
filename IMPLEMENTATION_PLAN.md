# Plan verificable

La referencia completa está en docs/MASTER_SPEC.md y docs/MASTER_SPEC_PDF.txt. El requisito adicional de IA precede a la activación de generación.

1. **Base funcional:** instalación OWNER segura; login/registro/aprobación; PostgreSQL; seed idempotente; proyectos independientes; categorías; subproductos compactos; 1–20 por operación; prompts versionados; adjuntos; herencia y vista final. SVG simple seguro ya incorporado. Ampliar resolución semántica, carga/miniaturas/reemplazo.
2. **Configuración IA y generación:** credenciales cifradas, máscara, revocación, verificación real, modelos disponibles compatibles, creatividad e imágenes, calidad/resolución, alternativas, presupuestos, consentimiento explícito. Probar con credencial real facilitada por OWNER antes de considerar esta fase completa. Verificar fidelidad de referencias, errores de API y consumos.
3. **Lotes:** cola persistente; reservas atómicas; reclamación segura; lotes por categoría; distribución; progreso; idempotencia. Completar selección granular, cancelación, leases y reintentos autorizados.
4. **Calidad y edición:** capas editables, render exacto de títulos/precios/logos, controles básicos sin IA, edición creativa con IA y versiones. Incorporados en la continuación: textos y logos independientes, ajustes manuales, edición con IA e historial de versiones. Falta QA visual con proveedor real.
5. **Productividad:** PNG/JPG/ZIP, favoritos básicos, conservación opcional, temporales y papelera. Biblioteca, carpetas y presets incorporados. Identidad por proyecto incorporada. Completar adjuntos reutilizables y selección transversal.
6. **Administración:** roles, aprobaciones, compartición por proyecto, auditoría y reservas globales. Recuperación asistida por OWNER y cambio de contraseña incorporados. Completar correo automático, recuperación de emergencia del único OWNER, gestión avanzada de cuentas, miniaturas, conciliación y estadísticas. Los presupuestos individuales están incorporados.
7. **Producción:** compilación y pruebas locales, guía de despliegue y backups. Completar QA en navegador, auditoría de seguridad, cargas, monitorización, almacenamiento S3 y despliegue en infraestructura elegida por OWNER.

Cada fase debe documentar pruebas reales. La prueba de generación externa no puede sustituirse por un mock para marcar completada la integración de IA.
