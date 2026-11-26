# Cuentas y menú entre aplicaciones

La vinculación de Desempeño acepta cuentas aprobadas y no archivadas de cualquier rol: Owner, Superadministrador, Administrador, Supervisor, Asesor, Usuario y Observador. Vincular una persona no cambia el rol, las asignaciones de módulos ni los permisos para administrar desempeño. Una cuenta no puede vincularse con dos asesores y el guardado exige la revisión actual.

Los permisos de CRM recibidos desde Mensajería se vuelven a consultar al regresar a la ventana (con separación mínima de tres segundos) y aproximadamente cada minuto mientras está visible. Las comprobaciones usan el temporizador existente del menú; las demás lecturas conservan su modalidad de distribución. Una respuesta 401/403 elimina los accesos remotos anteriormente recibidos. No se consulta en ventanas ocultas ni se cambian los permisos de los módulos locales.

El aprovisionamiento firmado sigue requiriendo la configuración compartida existente. Una cuenta nativa con el mismo correo requiere la verificación de identidad ya implementada; no se fusionan cuentas por coincidencia de correo ni se elevan roles al vincularlas con un asesor.

Validación local: compilación y TypeScript, pruebas de aserciones SSO y navegación, e integración con PostgreSQL aislado de roles compartidos y vinculación de los siete roles. Estas pruebas no acreditan la configuración ni los registros del VPS.
