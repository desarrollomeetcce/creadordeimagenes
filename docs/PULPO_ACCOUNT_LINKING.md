# Cuentas y menú entre aplicaciones

La vinculación de Desempeño acepta cuentas aprobadas y no archivadas de cualquier rol: Owner, Superadministrador, Administrador, Supervisor, Asesor, Usuario y Observador. Vincular una persona no cambia el rol, las asignaciones de módulos ni los permisos para administrar desempeño. Una cuenta no puede vincularse con dos asesores y el guardado exige la revisión actual.

Los permisos de CRM recibidos desde Mensajería se vuelven a consultar al regresar a la ventana (con separación mínima de tres segundos) y aproximadamente cada minuto mientras está visible. Las comprobaciones usan el temporizador existente del menú; las demás lecturas conservan su modalidad de distribución. Una respuesta 401/403 elimina los accesos remotos anteriormente recibidos. No se consulta en ventanas ocultas ni se cambian los permisos de los módulos locales.

El aprovisionamiento firmado sigue requiriendo la configuración compartida existente. Una cuenta nativa con el mismo correo puede vincularse por una acción del Owner autorizado en ambos sistemas o por la verificación de sesión nativa. No se vincula por coincidencia de correo sin esa autoridad ni se eleva un rol al asociarlo con un asesor.

Crear usuarios desde Generador intenta aprovisionarlos también en Mensajería. El creador debe ser Owner o Superadministrador activo, estar vinculado y tener el mismo rol autorizado en el extremo de Mensajería. El Superadministrador se limita a Usuario, Observador y Asesor. Las cuentas nuevas reciben el derivado scrypt de la contraseña inicial; ese material no se guarda en Generador ni sustituye credenciales de una cuenta existente. Si queda pendiente, se informa y se puede reintentar por fila. Sin la contraseña inicial, una nueva cuenta de Mensajería queda destinada al acceso compartido desde Generador.

Los cambios de rol compartido desde Generador se coordinan a través de Mensajería y su confirmación firmada de vuelta. No se mantiene un bloqueo local mientras se espera la llamada de retorno. Solo Owner en ambos extremos puede autorizar cambios elevados; las revisiones, identidades, denegaciones y últimos Owners se revalidan. Una operación con fallo no se anuncia como sincronizada. Guardar un rol compartido requiere separar los borradores de estado/plan.

**Actualizar accesos** está disponible en ambos menús. En Generador relee también el perfil vigente y sus asignaciones locales; en Mensajería refresca los datos del servidor conservando el estado de cliente. No se ha añadido un nuevo sondeo por página o por módulo.

Validación local: compilación y TypeScript, pruebas de aserciones SSO y navegación, e integración con PostgreSQL aislado de roles compartidos y vinculación de los siete roles. Estas pruebas no acreditan la configuración ni los registros del VPS.
