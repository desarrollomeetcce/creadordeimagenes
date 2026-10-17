# Planes y pagos desde la interfaz

Los planes públicos se consultan en /plans y se editan desde Configuración de IA → Planes y cuotas. Precio mensual de venta independiente del presupuesto de IA. Usuarios → Plan → Guardar plan permite asignación manual por OWNER y vigencia opcional. Ilimitado no aparece en catálogo público y solo lo asigna OWNER. Las cuentas previas sin plan mantienen el acceso anterior hasta asignación; no se cobra ni migra automáticamente a nadie.

Inicio:US$20,20 imágenes/mes yUS$10 de presupuesto IA. Crecimiento:US$49,50 imágenes yUS$25. Empresa:US$100,100 imágenes yUS$50. Cuotas por usuario/mes calendario Lima: cuentan reservas no liberadas y consumo confirmado/desconocido. Cancelar antes de generar libera reserva. El límite de presupuesto se aplica conservadoramente con reservas y costes registrados, no acredita que el proveedor haya cobrado ese importe. Ilimitado no elimina permisos ni los límites globales de seguridad de IA.

## Conectar cobros

Solo OWNER → Configuración de pagos. Seleccione pasarela y entorno. Introduzca datos allí, nunca en chat ni Git. Guardar cifra los datos y deja los campos vacíos; valores enmascarados indican lo conservado. Reemplazar invalida verificación y puede requerir revisar compras previas. Verificar credenciales no realiza una venta ni certifica recepción de webhooks. Habilite Ofrecer esta pasarela únicamente cuando corresponda.

Mercado Pago: Access Token, ID numérico del vendedor, secreto de firma Webhooks, moneda aceptada por la cuenta y, si cobra en PEN, tipo de cambio comercial por USD definido manualmente. Se fija y muestra al preparar cada compra; la plataforma no inventa una tasa de mercado. Registrar en la aplicación de Mercado Pago la URL mostrada en el desplegable del panel y el evento payment.

PayPal: cuenta Business, Client ID, Client Secret, Merchant ID y Webhook ID de la aplicación del mismo entorno. Registrar la URL mostrada en el panel y el evento PAYMENT.CAPTURE.COMPLETED. Los planes se cobran en USD. Credenciales Sandbox distintas de producción. La comprobación OAuth valida credenciales; identidad/importe final se verifican al confirmar pago.

## Contratar

Cuenta aprobada → Mi plan → elegir plan/pasarela → revisar importe/moneda → Preparar pago seguro → abrir checkout oficial. Volver a la web no activa nada. En PayPal, después de aprobar puede pulsar Confirmar pago aprobado; esta captura requiere confirmación y puede cobrar dinero real. Mercado Pago confirma por webhook; Consultar estado también puede consultar su API para recuperar una notificación perdida. Solo un pago final con referencia/vendedor/importe/moneda/entorno correctos activa el plan.

Compra de30 días sin cobros automáticos recurrentes. Se extiende la vigencia existente30 días; elegir un plan diferente cambia sus cuotas inmediatamente sin prorrateo ni reinicio de consumo. Las cuotas se cuentan por mes calendario Lima. Sandbox confirma pruebas sin conceder planes pagados reales. Una respuesta incierta no se presenta como pago rechazado ni autoriza repetir cargos automáticamente. Compruebe estado en la pasarela antes de intentar pagar otra vez.

Reembolsos, contracargos, disputas y cobros que requieran revisión se administran manualmente en la pasarela y Usuarios: no se anuncia gestión automática de esos procesos. Una clave nueva no permite confirmar silenciosamente compras de la revisión anterior. El OWNER puede asignar/revocar planes manualmente, pero la interfaz no puede convertir un pago no verificado en un pago confirmado.

## Evidencia y pendientes

Contratos y activación comprobados con PostgreSQL real y proveedores simulados; sin cobros ni credenciales reales del usuario. Falta conectar las cuentas, verificar credenciales, recepción del webhook externo y una compra autorizada. La red del entorno de desarrollo no autoriza acceso directo a la aplicación/pasarelas; no se eludió. La exploración CLI de Vercel Marketplace no tenía credenciales; se respetó la petición de usar las cuentas Mercado Pago/PayPal existentes con configuración visual propia, sin aprovisionar otro servicio comercial.

Referencias oficiales:

- https://www.mercadopago.com.pe/developers/es/reference/online-payments/checkout-pro-preferences/create-preference/post
- https://www.mercadopago.com.pe/developers/en/docs/checkout-pro-orders/resources/notifications/webhooks
- https://developer.paypal.com/api/rest/integration/orders-api
- https://developer.paypal.com/api/rest/webhooks/rest/
