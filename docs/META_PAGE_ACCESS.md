# Acceso a páginas: Facebook Login y token manual

Tener un permiso disponible en la app de Meta no significa que la credencial guardada lo tenga concedido. También se necesita acceso a la página y a la cuenta publicitaria concretas.

## Autorizar desde la plataforma

1. En Meta for Developers abre la app correcta. Prepara los permisos de anuncios y pages_show_list. Si empleas Facebook Login para empresas con un ID de configuración, incluye esos permisos y la selección de páginas en esa configuración.
2. En la conexión de Meta Ads guarda el ID y la clave secreta de la app en sus campos seguros. El ID de configuración de Login es opcional: no lo inventes. Debe ser uno existente de tu app si lo utilizas.
3. Registra en Facebook Login la URL de retorno mostrada por la plataforma: `https://TU-DOMINIO/api/meta/marketing/oauth/callback`. APP_ORIGIN debe coincidir con ese dominio; no uses un retorno de otra instalación.
4. Junto al selector de página, cuando no hay resultados, pulsa Autorizar páginas con Facebook. También está en Conexiones, en permisos avanzados de administración. Inicia sesión con el usuario que administra la página y permite las páginas requeridas.
5. El flujo de páginas solicita ads_read, ads_management y pages_show_list. Si se usa un ID de configuración empresarial, Meta toma sus permisos de esa configuración: actualízala allí antes de autorizar. La credencial anterior no se reemplaza si falta consentimiento, cambia la conexión o falla la verificación.

## Token manual

- Token de usuario: en el Explorador de la API Graph elige tu app, genera un token de usuario con los permisos necesarios y acepta acceso a las páginas. Actualízalo en la conexión de la plataforma y verifica. Sus permisos y caducidad se revisan en Access Token Debugger de Meta.
- Token de usuario del sistema: en Configuración del negocio → Usuarios → Usuarios del sistema asigna tanto la cuenta publicitaria como la página con las tareas necesarias. Genera el token para tu app y actualízalo en la plataforma. El selector consulta también las páginas asignadas (`me/assigned_pages`) cuando los directorios normales vienen vacíos.
- No sustituyas la conexión general de anuncios por un token de página. Los tokens de página para publicaciones se gestionan por separado en el servidor cuando esa funcionalidad esté implementada. No pegues tokens ni secretos en chats o capturas.

## Permisos por función

| Función | Permisos relevantes |
| --- | --- |
| Estadísticas de anuncios | ads_read |
| Crear/administrar campañas | ads_management; pages_manage_ads según las operaciones de página |
| Encontrar páginas | pages_show_list y acceso al activo; asignación de página para usuario del sistema |
| Leer contenido de página | pages_read_engagement |
| Publicar/programar contenido de página | pages_manage_posts y pages_read_engagement, además del acceso de página correspondiente |
| Activos empresariales | business_management cuando el flujo accede a esos activos |
| Instagram con Facebook Login | instagram_basic, instagram_content_publish y los permisos de página del flujo |
| Métricas de página | read_insights |
| Webhooks de página | pages_manage_metadata |
| WhatsApp Cloud API | whatsapp_business_messaging y whatsapp_business_management según envío/administración |

Programar publicaciones no tiene un permiso separado y aún requiere implementar esa funcionalidad. Un anuncio que abre WhatsApp no implica usar WhatsApp Cloud API. No se solicitan automáticamente permisos de funcionalidades futuras: la revisión/acceso avanzado y los activos autorizados se preparan según las operaciones implementadas. Los requisitos pueden cambiar con las versiones de Meta.

Referencias: https://developers.facebook.com/docs/permissions/ ; https://developers.facebook.com/docs/pages-api/posts/ ; SDK oficial SystemUser.assigned_pages: https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/systemuser.py
