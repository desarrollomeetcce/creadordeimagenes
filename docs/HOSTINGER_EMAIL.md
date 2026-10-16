# Conectar tu correo de Hostinger

No necesitas instalar otra base de datos ni editar código. Entra en la plataforma con tu cuenta OWNER.

1. Abre **Configuración de correo** en el menú lateral.
2. En Hostinger, abre los datos de conexión SMTP del buzón en hPanel → Emails → Conectar aplicaciones. Copia el servidor y el puerto que indique tu servicio. El panel sugiere smtp.hostinger.com y 465, pero no los da por verificados; algunos servicios usan otros datos.
3. En la plataforma introduce el correo completo del buzón, su contraseña y el nombre que verá quien reciba el mensaje. No uses la contraseña de acceso al panel de Hostinger.
4. Confirma con tu contraseña actual de OWNER y pulsa **Guardar configuración de correo**. La contraseña del buzón se cifra usando la clave maestra del servidor, fuera de la base. Después solo verás una máscara.
5. Confirma nuevamente tu contraseña de OWNER y pulsa **Verificar conexión guardada**. Se prueba realmente TLS y autenticación, sin enviar mensajes. Guardar cambios invalida esta verificación.
6. Pulsa **Enviar correo de prueba a mi cuenta** para enviar un mensaje a tu correo de acceso a la plataforma. Puede contar para los límites del servicio. Revisa entrada y spam. Que SMTP acepte el mensaje no garantiza que llegue a la bandeja de entrada.
7. En **Usuarios → Recuperar acceso**, OWNER o Administrador pueden introducir su contraseña actual y pulsar **Enviar enlace por correo**. Se envía exclusivamente al correo registrado de esa cuenta, con sus permisos actuales. Un Administrador no puede recuperar cuentas OWNER ni Administrador.

Los enlaces duran 30 minutos, funcionan una sola vez y al utilizarlos cierran las sesiones anteriores. El servidor guarda únicamente su hash. También puedes generar un enlace para copiar y entregarlo por un canal privado si el correo no está disponible.

Para reemplazar la contraseña del buzón, vuelve a guardarla y verifica otra vez. Para conservarla mientras cambias otro dato, deja el campo de nueva contraseña vacío. **Eliminar configuración de correo** la retira del servidor; requiere confirmar la contraseña de OWNER.

El servidor admite SMTP con TLS en puerto 465 o STARTTLS obligatorio en 587, certificado válido y destino con IPv4 pública. No admite servidores internos ni conexión sin cifrar. Si tu alojamiento restringe SMTP saliente, el panel mostrará un error; revisa las restricciones del alojamiento antes de volver a probar. No hay reintentos automáticos. Un envío que falla invalida el enlace de ese intento, incluso si el proveedor pudo haberlo aceptado antes del fallo.

No compartas contraseñas ni claves por chat. La comprobación con tu buzón real está pendiente hasta que lo configures y solicites las pruebas desde la interfaz.
