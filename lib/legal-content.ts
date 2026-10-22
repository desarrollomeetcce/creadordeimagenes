import { z } from "zod";

export const legalSchema = z.object({
  operatorName: z.union([z.string().trim().min(2).max(180), z.literal("")]),
  contactEmail: z.union([z.email().max(200), z.literal("")]),
  updatedOn: z.iso.date(),
  privacyText: z.string().trim().min(200).max(18000),
  termsText: z.string().trim().min(200).max(18000),
  deletionText: z.string().trim().min(100).max(8000),
}).strict();

// An optional public email is complemented by the working privacy request form.
// Legacy sites gain
// these prepared texts without overwriting their existing marketing content.
export const defaultLegal: z.infer<typeof legalSchema> = {
  operatorName: "CAMARA NACIONAL DE NEGOCIOS SAC",
  contactEmail: "",
  updatedOn: "2026-10-21",
  privacyText: `1. Alcance y responsable
Esta política explica el tratamiento de datos al utilizar la plataforma de generación de imágenes y su módulo de análisis Meta Ads. El responsable y el formulario público de contacto aparecen en la cabecera de esta página. La plataforma puede estar disponible en generator.agenciamagneto.org y en su dirección alternativa creadordeimagenes-three.vercel.app. Las instalaciones pueden tener configuraciones y almacenamiento diferentes; indica siempre el dominio que utilizaste al solicitar ayuda.

2. Datos que tratamos
Tratamos los datos de registro y acceso que proporciones, como nombre y correo, la información de roles y permisos, los proyectos e instrucciones, documentos, imágenes y referencias que adjuntes, los resultados generados y sus versiones. También se conservan registros de actividad, operaciones, consumo, cuotas y pagos cuando corresponda. Si envías una solicitud de privacidad, tratamos el correo y nombre que facilites, el contenido de la solicitud, su tipo y las respuestas, para tramitarla; esos datos no se publican. El código privado de seguimiento permite consultar la respuesta y debes conservarlo de forma segura. No incluyas datos de otras personas sin autorización ni información sensible innecesaria.

3. Integración con Meta y Facebook
Si autorizas una conexión, tratamos las credenciales de acceso y los identificadores y nombres de las cuentas publicitarias accesibles, campañas, conjuntos y anuncios; además, estados, objetivos, fechas y estadísticas de rendimiento como gasto, impresiones, clics y resultados agregados que Meta permita consultar. Estos datos se usan para mostrar y comparar resultados, sincronizar estadísticas y controlar accesos. El módulo actual realiza consultas de lectura: no publica, modifica ni elimina campañas o anuncios. Las estadísticas agregadas de mensajes o clientes potenciales no implican que importemos conversaciones privadas ni fichas individuales de clientes potenciales.

4. Finalidades y autorización
Utilizamos los datos para prestar el servicio solicitado, gestionar cuentas y permisos, ejecutar las generaciones autorizadas, mostrar el análisis publicitario, mantener la seguridad, atender incidencias y cumplir obligaciones aplicables. La conexión con Meta y los envíos a proveedores de IA se realizan conforme a la autorización y configuración correspondientes. Retirar una conexión detiene su uso futuro, pero no borra automáticamente los datos previamente importados.

5. Proveedores y destinatarios
Para producir imágenes o procesar referencias se envían las instrucciones y archivos necesarios a los proveedores de IA configurados, únicamente al ejecutar operaciones autorizadas. Los datos de Meta Ads no se envían a una IA para el análisis convencional del panel. Los proveedores de alojamiento, base de datos, almacenamiento, correo o pagos pueden procesar información necesaria para su función. Meta procesa sus propias autorizaciones y consultas. Los destinatarios y sus ubicaciones dependen de los servicios activados por la administración y pueden estar en otros países; puedes solicitar información sobre los proveedores utilizados en tu instalación. Compartir un recurso dentro de la plataforma permite su acceso a los usuarios autorizados.

6. Seguridad y almacenamiento local
Las credenciales de integración se cifran en el servidor y las contraseñas se almacenan mediante hash. El acceso se limita mediante sesiones, roles y permisos. El navegador utiliza cookies de sesión y almacenamiento local para preferencias como apariencia, filtros y selecciones. Estas medidas reducen riesgos, pero ningún sistema garantiza seguridad absoluta. Protege tu cuenta y evita compartir credenciales.

7. Conservación
Conservamos los datos mientras sean necesarios para prestar el servicio, mantener el historial, resolver incidencias o cumplir obligaciones aplicables. La papelera, la retirada de una conexión y la eliminación de un proyecto pueden conservar historiales y recursos independientes; no equivalen por sí solas a borrar todos los datos relacionados. Las miniaturas de auditoría visual tienen una conservación prevista de 30 días en las versiones que las guardan. Los demás archivos, estadísticas, copias de respaldo y registros siguen su finalidad y las políticas de la instalación. Puedes solicitar la eliminación; te informaremos de los datos que deban conservarse y del motivo, cuando corresponda.

8. Tus solicitudes
Puedes solicitar acceso, corrección o eliminación de tus datos y gestionar la retirada de autorizaciones, de acuerdo con la normativa aplicable. Utiliza el formulario público de solicitudes enlazado arriba e indica el dominio utilizado y el correo de tu cuenta. El correo se recoge de forma privada para identificar y tramitar tu solicitud. Conserva el código privado de seguimiento y vuelve al formulario para consultar el estado y la respuesta; no se envían correos automáticos. Para datos de Meta, añade únicamente los identificadores de las cuentas publicitarias afectados, si los conoces. Nunca envíes tokens, contraseñas ni claves secretas. Podremos pedir una comprobación proporcionada de identidad antes de actuar. Consulta también las instrucciones de eliminación enlazadas en esta página.

9. Cambios
Actualizaremos esta política cuando cambien las funciones o el tratamiento descrito. La fecha indicada identifica la versión publicada. Los cambios que requieran una nueva autorización se gestionarán conforme a las obligaciones aplicables.`,
  termsText: `1. Servicio y responsable
Estas condiciones regulan el acceso a la plataforma de generación y organización de imágenes y a sus funciones de análisis publicitario. El responsable y el formulario público de contacto aparecen en la cabecera. Al utilizar el servicio aceptas estas condiciones; si actúas por una organización, debes contar con autorización para hacerlo.

2. Cuenta y permisos
Proporciona información de registro correcta y protege tus credenciales. Solo puedes acceder a recursos propios o expresamente compartidos contigo. Las funciones disponibles dependen de tu rol, las autorizaciones concedidas, el plan y la configuración de la instalación. No debes eludir permisos, acceder a cuentas ajenas ni compartir secretos de integración.

3. Materiales y resultados
Debes tener los derechos y autorizaciones necesarios sobre textos, marcas, imágenes y documentos que aportes. Conservas los derechos que ya tengas sobre tus materiales y autorizas su tratamiento en la medida necesaria para ejecutar y almacenar las operaciones que solicites y compartirlas según tus permisos. Los derechos y restricciones de los resultados de IA también dependen del proveedor y de la legislación aplicable. No se garantiza exclusividad, ausencia de coincidencias ni que un resultado pueda registrarse como marca o protegerse por derechos de autor.

4. Uso permitido y revisión
No uses la plataforma para actividades ilícitas, suplantación, vulneración de derechos, acceso no autorizado o difusión de material prohibido. Revisa los resultados antes de publicarlos, especialmente textos, cifras, ofertas, datos personales y afirmaciones publicitarias. Los modelos pueden producir errores y no sustituyen la revisión profesional o la autorización de titulares de derechos.

5. Meta Ads
Solo debes conectar cuentas para las que tengas acceso autorizado. El módulo actual consulta cuentas y estadísticas y no ejecuta modificaciones publicitarias. La disponibilidad y exactitud de los datos dependen de Meta, sus permisos, versiones, límites y ventanas de atribución. Los datos de hoy pueden ser parciales y los resultados históricos pueden actualizarse. Los indicadores y colores son ayudas de análisis, no garantías de rendimiento ni recomendaciones de inversión personalizadas. No se deben comparar importes de monedas diferentes como si fueran equivalentes.

6. Planes, consumo y pagos
Las cuotas, duración, importes y prestaciones aplicables son los que se muestran al contratar y en la cuenta. Una reserva estimada no equivale necesariamente a un cargo final del proveedor; un importe desconocido no significa coste cero. Las generaciones autorizadas pueden consumir cuota y recursos externos aunque el resultado no satisfaga tus expectativas. Las condiciones concretas de compra y los derechos imperativos aplicables prevalecen. Para incidencias de facturación o solicitudes de reembolso, contacta con la administración e identifica la operación sin enviar datos bancarios sensibles.

7. Servicios externos y disponibilidad
El servicio depende de proveedores de IA, Meta, alojamiento y otros sistemas. Puede haber interrupciones, límites, caducidad de tokens, cambios de API o funciones no disponibles. Mantener una credencial guardada no acredita que siga autorizada. La administración podrá realizar mantenimiento o limitar accesos ante uso indebido o riesgos de seguridad, respetando las obligaciones aplicables.

8. Conservación y cierre
Mantén copias de los materiales y resultados que necesites. Eliminar un proyecto, retirar una conexión o cerrar una sesión no necesariamente elimina archivos independientes o registros históricos. Para solicitar eliminación de datos o cierre de cuenta, utiliza el procedimiento público enlazado. Podrán conservarse los registros que sean necesarios por obligaciones legales, seguridad o resolución de controversias, informando cuando corresponda.

9. Responsabilidad y derechos aplicables
Cada parte responde de sus actuaciones conforme a la normativa aplicable. No se garantiza un resultado comercial determinado, disponibilidad ininterrumpida ni exactitud infalible de los contenidos generados o estadísticas de terceros. Estas condiciones no excluyen responsabilidades ni derechos de los usuarios que legalmente no puedan limitarse.

10. Cambios y contacto
Las condiciones vigentes se publican con su fecha de actualización. Los cambios relevantes se comunicarán por los medios disponibles cuando corresponda. Para consultas, incidencias o reclamaciones, utiliza el formulario público enlazado en la cabecera e indica el dominio de la plataforma y tu cuenta. Guarda el código privado para consultar la respuesta; el formulario no envía correos automáticos.`,
  deletionText: `Cómo solicitar la eliminación de datos
Abre el formulario público de solicitudes de privacidad enlazado en la cabecera y elige el tipo de eliminación que necesitas. Identifica el dominio de la plataforma que utilizaste y el correo de tu cuenta. Indica si solicitas el cierre de cuenta, la eliminación de archivos o proyectos, o de datos importados de Meta Ads. Puedes incluir los identificadores de las cuentas publicitarias afectados. No envíes tokens, contraseñas, claves de la app ni capturas que los muestren.

Comprobación y tramitación
Comprobaremos tu identidad y tu autorización sobre los datos afectados antes de eliminarlos. Al enviar el formulario recibirás un código privado de seguimiento. Guárdalo para consultar el estado y la respuesta en ese mismo formulario. La administración tramita las solicitudes y publica allí su respuesta, dentro de los plazos exigidos por la normativa aplicable; no se envían correos automáticos. Marcar una solicitud como atendida no elimina por sí solo los datos: la administración debe realizar y confirmar las acciones correspondientes. Si necesitas concretar el alcance, te pediremos únicamente información necesaria para ello.

Qué ocurre con tus datos
La solicitud se aplicará a los datos que gestione esta instalación y para los que estés autorizado. Algunos registros podrán conservarse cuando exista una obligación legal, una necesidad de seguridad o una controversia pendiente; se informará del motivo y alcance cuando corresponda. Las copias de seguridad pueden seguir su ciclo de conservación y no están disponibles para uso ordinario después de la eliminación.

Desconectar Meta
Puedes retirar la conexión desde la plataforma para detener nuevas consultas y revocar la autorización desde las opciones de aplicaciones o integraciones de tu cuenta de Meta. Revocar el acceso no elimina por sí solo las estadísticas ya importadas: solicita expresamente su eliminación si lo deseas. Eliminar datos en esta plataforma no elimina tus campañas, anuncios ni los datos que Meta conserva en sus sistemas; para estos últimos, utiliza los canales de Meta.

Archivos compartidos e instalaciones
Los recursos compartidos con otras personas y los registros sujetos a obligaciones aplicables requieren una revisión de alcance antes de su retirada. Si utilizaste tanto generator.agenciamagneto.org como creadordeimagenes-three.vercel.app, indícalo para identificar las instalaciones afectadas.`,
};
export type LegalContent = z.infer<typeof legalSchema>;
export function legalReady(content: LegalContent) {
  return !!content.operatorName && legalSchema.safeParse(content).success;
}
