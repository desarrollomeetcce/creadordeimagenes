# Meta Ads: consulta y análisis

La primera entrega amplía la plataforma existente: Meta Ads en el menú lateral, tres niveles, tarjetas/tabla, cinco periodos simultáneos, calendario opcional, ranking con mínimo de resultados, alertas explicables y detalle de gasto diario. Solo lectura publicitaria: no publica, pausa ni cambia presupuestos. No llama a modelos de IA. La infraestructura y los servicios externos mantienen sus propias condiciones y límites.

## Conectar Marketing API

Como OWNER, abre Meta Ads → Conexiones → Mi app · Marketing API. Crea/configura tu app en Meta, solicita `ads_read` y acceso a las cuentas que administras; `business_management` puede ser necesario para determinados accesos empresariales. La revisión/verificación depende de Meta y del tipo de uso. El módulo no crea una app de Meta en nombre del usuario ni sustituye esa autorización.

Guarda nombre, versión Graph compatible con tu app, ID de app opcional y token de acceso. La versión inicial del formulario es v23.0, no una afirmación de ser la versión más reciente: se puede cambiar antes de guardar. Nunca enviar tokens por chat, Git ni logs. Pulsa Verificar y traer cuentas. La verificación comprueba lectura de cuentas; sincronizar comprueba los campos de objetos/estadísticas.

## Conectar mi propia app con Facebook (OAuth de Marketing API)

En OWNER → Meta Ads → Conexiones → Mi app · Marketing API, el modo **Autorizar con Facebook** permite una conexión nueva. Si ya existe PULPO ANALISIS Y AUTO, utiliza su tarjeta → **Conectar con Facebook · configuración OAuth de mi app** para mantener el vínculo de las cuentas y el histórico.

Guarda el ID y la clave secreta de la app desde Meta for Developers → Configuración básica, usando únicamente el campo PasswordInput protegido de la plataforma. El secreto se cifra en el servidor con contexto por conexión y no vuelve al navegador. No compartirlo por chat ni guardarlo en Git. Si la app exige Facebook Login para empresas, crea una configuración de **token de usuario** con ads_read y pega su ID opcional; no confundirlo con appId/cuenta publicitaria. No requiere Vercel Connect ni otra cuenta intermediaria y funciona también en el VPS.

Registra estas URI exactas en **Facebook Login → Configurar → URI de redireccionamiento OAuth válidos**:

- `https://generator.agenciamagneto.org/api/meta/marketing/oauth/callback`
- `https://creadordeimagenes-three.vercel.app/api/meta/marketing/oauth/callback`

Se pueden registrar ambas. Cada instalación utiliza la correspondiente a su APP_ORIGIN. En el VPS: `APP_ORIGIN=https://generator.agenciamagneto.org`; en Vercel: `APP_ORIGIN=https://creadordeimagenes-three.vercel.app`. Sin ruta, query o fragmento. La plataforma muestra la URI efectiva y bloquea autorización desde otro dominio. Una base compartida no sustituye una configuración de origen correcta; no se modificaron variables reales del VPS desde este entorno.

Ajustes de la pantalla de Facebook Login: inicio de sesión del cliente OAuth Sí; OAuth web Sí; HTTPS Sí; modo estricto de URI Sí. No se utiliza SDK de JavaScript, dispositivos o navegador integrado: dejar esas opciones No y dominios del SDK vacíos. Forzar reautenticación es opcional, no necesario para este flujo. La URL de autorización cancelada (deautorización programática) y la de solicitud de eliminación programática permanecen vacías: este cambio no implementa esos callbacks firmados. En Configuración básica, eliminación de datos usa **URL de instrucciones** con `/eliminacion-de-datos`, no el callback OAuth.

El validador de URI solo comprueba una dirección; no sustituye registrarla y guardar la lista de URI válidas. Abrir manualmente el callback sin state/código produce un error controlado: se utiliza regresando de la autorización iniciada por OWNER desde la plataforma.

El flujo usa código confidencial con App Secret, state de un uso y vinculación a navegador/sesión/revisión; no presume PKCE ni reutiliza cliente MCP. Intercambia un token de larga duración mediante el endpoint oficial, verifica identidad, permiso ads_read y consulta mínima de cuentas antes de sustituir la credencial. Después importa todas las páginas autorizadas antes de mostrar Acceso verificado. Solo consulta Meta, sin anuncios de prueba ni cambios en campañas. Se conserva un error específico y saneado ante rechazo. Denegar antes de guardar mantiene la credencial anterior.

Caducidad: se guarda la que Meta devuelva y se muestra en la tarjeta; si no se informa, se indica No informada. Un token de larga duración también puede vencer/revocarse y no dispone de una renovación perpetua: usa Reconectar con Facebook. Sesión revocada o app/credencial modificada durante el intercambio bloquean persistencia tardía. Roles elevados y asignaciones permanecen independientes de la identidad de Facebook. App en desarrollo y acceso de terceros siguen sujetos a las reglas y revisión de Meta.

Verificación propia: Meta está bloqueado por política de red en este entorno. Las pruebas usan dobles explícitos y base sintética exclusiva; no acreditan que la app real tenga acceso avanzado ni completan su revisión. La autorización real requiere que el usuario registre la URI, guarde sus credenciales oficiales y acepte el consentimiento en Facebook.

## Conectar MCP con OAuth

Como OWNER, entra en Meta Ads → Conexiones → Conexión MCP y pulsa **Conectar con Meta**. No hace falta copiar un token. La plataforma crea una conexión pendiente y consulta metadatos públicos del destino fijo `https://mcp.facebook.com/ads`. No abre una URL inventada ni considera ese intento una conexión exitosa.

Se comprueban recurso, emisor, endpoints oficiales previstos, PKCE S256 y compatibilidad con cliente público. Se usa documento público de cliente (CIMD) solo si Meta lo anuncia; de lo contrario, registro dinámico cuando Meta lo permite. Si exige cliente preaprobado, coloca su ID en «Cliente OAuth registrado · avanzado» de la conexión. No copies IDs de Claude/ChatGPT ni confundas un ID de app Graph con un cliente MCP autorizado. No se omiten errores de emisor o de registro.

URLs de esta plataforma:

- Retorno: `https://creadordeimagenes-three.vercel.app/api/meta/oauth/callback`
- Documento público de cliente, sin secretos: `https://creadordeimagenes-three.vercel.app/api/meta/oauth/client`

Meta debe admitir el cliente y esa URL de retorno. Publicar el documento no obliga a Meta a aceptarlo. Clientes que exijan secreto o métodos distintos a cliente público PKCE no están admitidos en este flujo. No se pide el secreto de tu app para aparentar compatibilidad.

Al regresar se comprueban sesión OWNER vigente, navegador, estado de un uso, revisión de conexión y emisor; se intercambia el código en servidor y se conserva el token cifrado. A continuación se inicia una sesión MCP, se descubre el catálogo de lectura y se consultan las cuentas accesibles. **Solo después de esas consultas exitosas se marca Acceso verificado.** Un token recibido/guardado permanece sin verificar si Meta rechaza la lectura. Una respuesta real sin cuentas no inventa cuentas ni habilita sincronizaciones. No se publican ni cambian campañas, anuncios o presupuestos.

El token manual queda en Configuración avanzada y se verifica al guardarlo. Debe estar emitido para ese servidor MCP; no existe aquí un token universal. No se asume que un token de otro cliente, una suscripción de chat o una clave de OpenAI sean válidos. Sesión revocada durante el intercambio o modificación de credenciales bloquean respuestas tardías. Un fallo vuelve a indicar conexión no verificada, sin mostrar códigos/tokens ni una pantalla falsa de éxito.

### Si Meta no admite OAuth para este cliente

Necesitas un cliente OAuth público **oficialmente admitido por Meta para el MCP**, con PKCE S256 y la URL de retorno registrada, o una credencial MCP emitida por su proceso oficial. No se puede fabricar una identidad autorizada ni utilizar credenciales de otro asistente. Si Meta no ofrece ese registro para tu caso, conserva la conexión pendiente o desconéctala y utiliza **Mi app · Marketing API**.

Para Marketing API necesitas tu propia app de Meta habilitada para acceso publicitario, token de usuario o usuario del sistema con `ads_read` y acceso a las cuentas correspondientes; `business_management` cuando el tipo de acceso empresarial lo requiera. Revisión de app, roles y verificación del negocio dependen de Meta. Configura versión Graph compatible e introduce el token solo en el campo protegido; pulsa Verificar y traer cuentas. No compartas contraseña, token ni App Secret por chat o Git. En la alternativa manual, el ID de app es informativo/opcional y no sustituye los permisos del token; en OAuth propio es obligatorio junto con su clave secreta.

### Resultado de esta verificación

El entorno de desarrollo mantiene una política de red que bloquea los dominios Meta. **No se ha completado una autorización real contra Meta ni se confirma que admita este cliente concreto.** Se verificaron código, metadatos, flujo y rechazos con dobles explícitos en una base local exclusiva. La comprobación real se hace desde el servidor de la plataforma al pulsar el botón y requiere la autorización del OWNER en Facebook; nunca se simula éxito en producción.

Se consultaron reportes de reproducción de los clientes oficiales: [registro rechazado en Codex](https://github.com/openai/codex/issues/24103), [inconsistencia de emisor reportada en Codex](https://github.com/openai/codex/issues/38944) y [retornos no registrados en Claude Code](https://github.com/anthropics/claude-code/issues/55002). Son incidencias de esos clientes y fechas, no prueba del estado actual de Meta ni garantía de disponibilidad. Por ello el botón valida la respuesta actual y ofrece Marketing API si no es compatible.

El catálogo real puede no ofrecer los nombres, esquemas o métricas requeridos. La aplicación solo admite herramientas compatibles de lectura y resultados estructurados; no usa herramientas de publicación o ejecución genérica, ni IA para interpretar respuestas. Verificar cuentas no demuestra compatibilidad con todos los insights.

## Cuentas y roles

Las cuentas tienen identidad única, aunque se descubran por varias conexiones. Se conservan los orígenes verificados y OWNER puede escoger la conexión preferida de cada cuenta. Un cambio no duplica el histórico. Una verificación pendiente o credencial sustituida bloquea la sincronización.

OWNER gestiona conexiones, umbrales, habilitación y accesos. ADMIN solo consulta cuentas asignadas y sincroniza cuando se le concede ese permiso específico. USER/OBSERVER solo consultan cuentas asignadas, incluidas sus métricas de gasto publicitario. No concede acceso a proyectos ni a la configuración/costos de IA. Quitar una asignación bloquea inmediatamente nuevas consultas de panel, detalle y datos diarios. Desconectar conserva el histórico para OWNER y detiene sincronizaciones; otros usuarios no acceden mediante la conexión retirada.

Habilita una cuenta, elige resultado principal cuando el objetivo sea ambiguo, define costo objetivo en su moneda y mínimo de resultados. Sin umbral no se etiqueta un costo como bueno/crítico por inventar un valor universal.

## Datos, periodos y límites

Hoy,7,15,30días y desde inicio se muestran juntos; N días incluye hoy y N−1 anteriores, según la zona horaria de la cuenta. El calendario opcional no reemplaza esos comparativos. El costo se calcula con gasto agregado/resultados compatibles; nunca promediando costos diarios. Conversaciones iniciadas, leads y compras usan sus tipos propios y no se suman acciones alternativas duplicadas. Objetivos ambiguos quedan no identificados hasta elegir un resultado o disponer de configuración suficiente.

Atribución explícita común en esta entrega:7d_click+1d_view, por fecha de impresión. Para contrastar con Ads Manager, seleccionar la misma atribución y zona horaria. No se presenta como la configuración automática de todas las cuentas. No se suman monedas diferentes ni alcance único diario. Hoy puede ser parcial; la tendencia usa dos ventanas completas de7días sin solapamiento. Los rankings exigen el mínimo de resultados del periodo elegido y separan moneda/tipo de resultado.

Primera/última circulación son las primeras/últimas fechas **conocidas** de gasto o impresiones. No se sustituye circulación por creación. Antigüedad inclusiva en días calendario; días activos solo a partir de actividad diaria importada. El histórico se marca parcial/disponible porque la API puede limitar el pasado recuperable. No implica acceso a toda la vida del anuncio. Reconciliación de35días recientes reemplaza valores y retira filas que dejaron de aparecer al completar cada nivel; una respuesta incompleta no elimina estadísticas.

El ranking está acotado a10.000objetos por selección y lo informa cuando se supera; usar filtros para acotar. Exportación CSV de la página actual. La vista de detalle incluye tabla y barras de gasto diario de los últimos30días; no inventa días ausentes. Personalización extensa de columnas, XLSX, una puntuación0–100 validada y publicidad/automatizaciones de escritura quedan para una etapa posterior, sin botones que aparenten publicarlas.

## Segundo plano

Workflow durable reclama páginas por cuenta mediante lease y comparación de token/revisión, con pausa entre consultas. Persiste cursor y fase, sin conservar URLs con tokens. La primera importación solicita el máximo histórico que Meta ofrezca; siguientes lecturas actualizan35días. Un error conserva resultados previos y aplica espera antes de reanudar. Cambiar conexión, deshabilitar o revocar al propietario impide publicar respuestas tardías.

Sincronizar ahora despierta un workflow dormido; no depende de dejar una pestaña abierta. Worker persistente también toma trabajos vencidos. El cron existente de mantenimiento recupera programadores sin añadir una frecuencia incompatible al cron del alojamiento. Intervalo solicitado15–1440min; el real depende de cuotas, disponibilidad y ejecución del alojamiento. No afirmar15min garantizados en un despliegue no comprobado. `APP_ORIGIN` debe ser el dominio público correcto para OAuth.

## Verificación

Unitarias con fetch simulado para Graph/MCP/SSE y cálculos; integración HTTP/PostgreSQL exclusiva para roles, cifrado, cuentas duplicadas, actualización incremental, ceros, histórico y OAuth de un uso. Prueba Workflow local sin autorización comprueba rechazo antes de llamadas externas. Browser usa exclusivamente datos sintéticos en la base local, nunca los publica como estadísticas reales.

Frescura diaria: si la última importación completa es de otro día de la cuenta, la tarjeta avisa Datos atrasados, Hoy no se declara sin actividad y el ranking la excluye hasta actualizar. Los valores históricos siguen disponibles con fecha; no se convierten en una prueba de eficiencia actual.

## Diagnosticar «Verificar y traer cuentas» en Marketing API

Cada tarjeta API muestra su versión Graph persistida. La versión del formulario para una conexión nueva no actualiza conexiones anteriores. Si Explorer funciona con v26.0, introduce v26.0 en «Versión Graph guardada» de esa conexión y pulsa «Actualizar versión sin cambiar token»; luego «Verificar y traer cuentas». No es necesario borrar la conexión ni reemplazar su token por ese cambio. Nuevas conexiones parten de v26.0, versión confirmada por el usuario, sin afirmar que sea siempre la versión más reciente.

El primer paso es GET https://graph.facebook.com/{versión}/me/adaccounts?fields=id,name&limit=100. El token descifrado solo se envía en Authorization: Bearer, jamás en la URL. Si funciona, se consultan id,name,currency,timezone_name; después id,name,account_status y finalmente id,name,business{id,name}. Moneda/zona son necesarias para almacenar estadísticas fiables. Estado/business son opcionales: fallos compatibles de campo/permiso se informan sin impedir la importación; un error de token, cuota u otro fallo no se encubre como éxito. La paginación se reconstruye por cursor sin reutilizar URLs del proveedor. MCP conserva su contrato de lectura previo.

Los fallos muestran versión, endpoint, campos, HTTP, código, subcódigo y mensaje saneado de Meta. El registro estructurado meta_graph_error y la auditoría META_CONEXION_ERROR no contienen el token, cabeceras, URLs completas ni respuestas crudas. Se conservan conexión, token e histórico ante un error; guardar una credencial no equivale a verificarla. Si el mínimo funciona pero falla una ampliación necesaria, el mensaje lo distingue explícitamente. Solo ads_read/acceso a las cuentas se requiere para el mínimo; no se exige business_management para acreditar esa consulta.

Caso PULPO META ADS: la implementación anterior mezclaba campos opcionales en la primera solicitud, usaba v23.0 como valor inicial y descartaba el detalle de errores HTTP. Explorer del usuario funcionó con v26.0. Estas diferencias están comprobadas en código, pero no demuestran por sí solas cuál causó el rechazo real. No se dispone del cuerpo histórico ni acceso directo Meta en este entorno. La siguiente verificación publicada devolverá el diagnóstico concreto; comparte solo código/subcódigo/mensaje visible saneado si persiste, nunca el token. No se modifican ni publican campañas/anuncios durante estas comprobaciones.

Aclaración por capturas posteriores del usuario: la llamada visible es /me?fields=id,name (perfil), no /me/adaccounts?fields=id,name; por tanto esa captura no acredita ads_read ni acceso a cuentas. App PULPO ANALISIS Y AUTO sin publicar, permisos Listo para la prueba y contadores vacíos no prueban concesión en el token. Se añadió ayuda desplegable para roles aceptados, acceso de usuario a cuentas, app/token correctos y consulta publicitaria mínima. Pruebas propias pueden ser viables en desarrollo; usuarios externos quedan sujetos a publicación/revisión/verificación que Meta exija. No se accede al panel Meta autenticado ni se rellenan datos legales ficticios, no se confunde callback MCP con Facebook Login ni se generan500 llamadas artificiales para elevar el acceso.

## Varias conexiones y errores durante el guardado

Las tarjetas representan conexiones guardadas independientes; crear otra no reemplaza la anterior. Usa Eliminar conexión en la tarjeta que quieras retirar. La confirmación explica que se quita su token y se desactiva su sincronización, conservando cuentas/histórico y las demás conexiones. Las retiradas quedan ocultas inicialmente y se pueden consultar con Ver conexiones retiradas. Si una cuenta tenía como fuente principal la conexión retirada, selecciona una fuente alternativa verificada en Cuentas publicitarias antes de habilitar su sincronización; no se cambia silenciosamente de credencial.

La importación se guarda en bloques de10, con operaciones agrupadas y timeout explícito30s, para evitar el límite predeterminado5s de una transacción con muchas consultas remotas. Cada bloque revalida permisos/revisión; una importación parcial no acredita verificación completa. Los errores internos muestran el paso (lectura, validación, guardado o confirmación), código reconocido y referencia. Se conserva el historial sin registrar mensajes crudos del driver, que podrían contener consultas o secretos. El error de Meta mantiene sus propios código/subcódigo saneados. Refrescar la tarjeta tras un fallo no repite la consulta externa.

La captura con No se pudo verificar la conexión con Meta corresponde al antiguo fallback de excepción interna; no demuestra rechazo del token. El problema de transacción5s está identificado en código y probado con demora sintética, pero no se atribuye a producción sin diagnóstico real. No es necesario borrar ambas conexiones ni reemplazar un token que funciona para resolver un fallo interno.

## Encontrar tus cuentas y ordenar los resultados

Cuentas autorizadas enumera las devueltas por /me/adaccounts para el usuario del token, incluidas cuentas compartidas, no solo las del negocio que posee la app. No consulta el catálogo de WhatsApp. Para confirmar una cuenta, compara su ID act_ con Ads Manager: el nombre puede repetirse. Busca por nombre, ID con/sin act_ o negocio conocido tanto en Cuentas publicitarias como en el selector de Rendimiento; cambiar la búsqueda no retira selecciones. La gestión muestra25 cuentas por página.

Con gasto30d y Con campañas activas usan estadísticas/estados ya importados. Requieren la última importación completa del día local; las no sincronizadas, en curso o atrasadas aparecen en Sin datos actuales. Sincronización habilitada muestra las cuentas configuradas para importar. Un filtro vacío no significa que Meta confirme inactividad: incluye Toda la actividad, busca tus IDs y habilita/sincroniza únicamente las cuentas elegidas. Se calcula gasto de los últimos30 días inclusivos en la moneda propia y solo con filas de campaña en la atribución común, sin sumar otra vez conjuntos/anuncios.

Si falta business_management, puede faltar la agrupación por negocio: se informa sin inventar pertenencia ni bloquear búsqueda por ID. La app no descubre esa agrupación a partir de nombres. El permiso opcional denegado se omite en siguientes páginas de la misma verificación, con un solo aviso.

Ordenar por costo son botones de acción Hoy/7/15/30/Desde el inicio: un clic ordena menor primero, otro invierte. Las cinco métricas permanecen en cada tarjeta y no se filtran por el botón elegido. El calendario es opcional y conserva su propio botón; también permanecen órdenes por creación/antigüedad. Los costos de monedas/resultados distintos no se mezclan y los no disponibles quedan al final. Buscar o cambiar orden no consulta Meta ni usa IA.

Ajuste por nuevas referencias visuales: periodo de análisis separado del orden, con resumen de gasto/resultados/costo correspondiente y fechas de esa ventana. Cada tarjeta conserva sus cinco comparativos y añade cabecera de estado legible, jerarquía, primera circulación conocida y antigüedad. Evaluación mantiene colores discretos y explicita que usa7días/objetivo/volumen; no se inventan recomendaciones automáticas. Cambiar negocio limpia filtros descendientes y sus opciones se restringen a cuentas elegidas. El selector rápido de periodos usa datos ya recibidos; calendario conserva rango personalizado independiente.

Búsqueda por palabra permanece visible en Rendimiento/Ranking/Alertas y conserva texto al cambiar Campañas/Conjuntos/Anuncios. Coincidencia parcial del nombre sin distinguir mayúsculas, mediante consulta autorizada y debounce200ms; busca todo el nivel, no solo la página visible. No se sustituye por un desplegable ni se sincroniza Meta al escribir.

## Conservar selección y ver la importación

Las preferencias de Meta Ads se recuerdan por usuario en este navegador: cuentas, búsquedas de cuentas y palabras, nivel, sección, filtros, calendario/periodo, orden y vista. No se guardan credenciales ahí; cada lectura revalida acceso. Un ID que ya no está autorizado sale de la selección. Los ajustes de una cuenta (habilitación, resultado, objetivo e intervalo) se guardan en el servidor con Guardar cuenta; elegir un valor sin guardar no lo cambia para una recarga.

Automático · detectar tipo de resultado intenta identificar el resultado compatible de la campaña/conjunto. No equivale a sumar todos los objetivos. Si es ambiguo muestra resultado no identificado. Para analizar mensajes en esa cuenta selecciona Conversaciones iniciadas y guarda; para otros objetivos elige el tipo correspondiente o detección automática. Monedas/tipos distintos no se mezclan.

Sincronizar ahora comprueba una primera página inmediatamente, y continúa la importación durable en segundo plano. Las etapas son campañas, conjuntos, anuncios y resultados diarios de cada nivel. La barra cuenta etapas completas, páginas y registros recibidos; no es un porcentaje de bytes ni una estimación de páginas totales. En cola, error y sin avance reciente se distinguen de completado. Errores Graph o códigos internos seguros aparecen en la cuenta; los datos previos se conservan. Recargar no reinicia ni duplica la solicitud.

El progreso se consulta automáticamente mientras la pestaña está visible (5s importando,30s en reposo), mediante lectura local autorizada sin llamadas Meta/IA. Al completar una importación nueva se actualizan catálogo y tarjetas sin recargar manualmente. Puede cerrarse la página: el Workflow sigue siendo el ejecutor, sujeto a disponibilidad del alojamiento. Si el ejecutor no confirma avance se indica; solicitar sincronización manual comprueba otra página bajo lease sin duplicar un trabajo activo.

#### Continuar una sincronización detenida

Durante una importación pendiente, con error o sin avance reciente, el botón de la cuenta muestra **Continuar sincronización**. Conserva el cursor, la etapa, los contadores y los datos importados; consulta primero la página pendiente y continúa mediante Workflow. Ante error o atasco se sustituye el ejecutor detenido, sin reiniciar el histórico. Si una página ya está procesándose, se informa y se conserva su lease. **Reimportar histórico** sigue siendo una acción distinta y confirmada que vuelve a consultar el historial disponible. La continuación no corrige por sí sola permisos/token/cursor inválidos: cualquier nuevo error se muestra y el avance previo se conserva.

#### Token actualizado y errores anteriores

Reemplazar token invalida el lease y ejecutor previos de las cuentas vinculadas y retira su error, conservando el cursor y los datos. La conexión vuelve a Pendiente de verificar. Pulsa **Verificar y traer cuentas** en esa misma conexión y después **Continuar sincronización**; guardar no prueba que Meta acepte la credencial. Los ejecutores no arrancan con conexiones sin verificar. Una respuesta tardía de la credencial anterior no puede sobrescribir el estado nuevo. La tarjeta indica la conexión utilizada, su revisión y fecha/revisión del último intento; son metadatos sin contenido del token. Si actualizaste otra conexión, la cuenta conserva su conexión explícita hasta cambiarla con una fuente verificada. No es necesario generar otro token solo porque aún ves un error de un intento anterior.

### Importación rápida por periodo (Marketing API)

Las nuevas importaciones API empiezan por los últimos30 días locales, no por el catálogo completo ni estadísticas diarias `maximum`. En Cuentas publicitarias se puede elegir30/90/180 días y pulsar **Sincronizar periodo seleccionado**. Esta acción sustituye el cursor pendiente, conservando las credenciales, objetos, estadísticas anteriores y fecha de la última importación completa. Una página con lease vigente rechaza el cambio hasta finalizar. Continuar sincronización mantiene exactamente el plan/rango/cursor guardados, incluidos los de versiones anteriores.

Plan rápido de seis fases: estadísticas diarias de campañas/conjuntos/anuncios en el rango, después metadatos de esos objetos. Solo se consultan IDs con actividad retornada por Insights, mediante GET multi-ID en bloques de50, Bearer/proof existentes y validación de cuenta por objeto. Incluye pausados con actividad; no representa todo el catálogo ni garantiza mostrar activos sin entrega en ese periodo. Ausencias de metadatos quedan con estado desconocido. El panel y el contador de actividad no reutilizan como actuales los miles de objetos de una importación antigua ajenos al rango. Las cinco comparaciones se mantienen; Desde el inicio sigue siendo parcial y la primera circulación es la conocida por los datos importados.

El rango/plan/contadores se conservan en syncState y lastRun; la siguiente actualización automática utiliza el mismo número de días móviles. No requiere migración. La reconciliación de estadísticas solo afecta fechas/nivel/atribución consultados; el plan rápido no marca NOT_RETURNED objetos de fuera del periodo. **Reimportar histórico** mantiene el recorrido completo anterior y debe pedirse explícitamente para una cuenta nueva API. MCP mantiene su contrato y cursores anteriores; no se finge soporte multi-ID. Sin IA ni modificaciones de campañas o anuncios en Meta.

### Análisis semanal con histórico independiente (versión actual)

El módulo visible utiliza únicamente Marketing API, con OAuth propio y token manual como alternativa. Se retiraron las secciones MCP de la interfaz; no se borran conexiones, asignaciones ni datos históricos de versiones anteriores. Los adaptadores y callbacks antiguos se conservan por compatibilidad, sin ofrecer su configuración en el panel nuevo.

**Dos periodos diferentes.** El selector de cuentas «Activos o con entrega en» parte de7 días (opciones7/15/30/90). Determina qué campañas, conjuntos y anuncios entran al análisis; no limita la antigüedad de sus estadísticas. Se consultan Insights agregados del periodo en cada nivel y el inventario efectivo ACTIVE de cada nivel. Se incluyen pausados con entrega reciente y activos sin entrega. No se recorre el catálogo completo de elementos inactivos ni se exige que hayan sido creados esta semana.

El plan `focus` tiene11 etapas: selección por entrega de los tres niveles, selección de activos de los tres niveles, sus detalles de los tres niveles, comparativos diarios30 y acumulados históricos. Los detalles usan GET /{id} con IDs internos validados y máximo5 lecturas paralelas por paso. Se eliminó el GET raíz con `ids`, que la captura real del usuario acredita obsoleto en Graphv26.0. El adaptador legacy también traduce lotes a lecturas individuales; no se reintenta el endpoint obsoleto.

Los comparativos de hoy/7/15/30 proceden de hasta30 días diarios de los objetos seleccionados. Después se consulta GET /{id}/insights con date_preset=maximum y time_increment=all_days para el acumulado disponible en Meta: no se descarga el diario de años de todo el catálogo. MetaAdTotal guarda importe/acciones/rango real por objeto y atribución, con reutilización durante6 horas si el día final coincide. El costo se calcula dividiendo gasto total entre resultados totales; nunca se promedian costos diarios ni se mezclan campañas+conjuntos+anuncios en un total de cuenta. La disponibilidad de Meta puede ser menor que la vida del anuncio; no se garantiza histórico completo desde su creación.

`selectedAt`/`selectionSince` delimitan la selección persistida sin borrar objetos fuera de ella. Los comparativos se publican al completar la etapa10 y el histórico continúa en segundo plano; un fallo del histórico conserva los datos recientes disponibles. Lo no consultado se muestra pendiente/no disponible, nunca como costo cero confirmado. Una importación guardada de otro día se marca atrasada aunque termine hoy. La antigüedad visible usa creación si Meta la informa; primera entrega registrada y cobertura del acumulado no se confunden con esa fecha. Consultar/ordenar/buscar/cambiar Medir resultado trabaja con datos locales, sin IA ni consultas adicionales a Meta.

**Interfaz.** Conexión al principio de cada cuenta; selección temporal y acción principal; progreso compacto con detalle técnico plegado. Se retiraron Habilitar sincronización, Resultado principal por cuenta, mínimo de resultados, intervalo y Reimportar histórico. La sincronización se habilita internamente solo con la acción explícita autorizada; los ajustes internos previos se conservan. Medir resultado arriba selecciona la métrica que se calcula para las tarjetas (incluido automático); búsqueda por palabra siempre visible. Los filtros secundarios se agrupan en Más filtros y se pueden limpiar. Costo objetivo opcional y asignaciones de acceso permanecen disponibles.

**Pausar y cancelar.** POST /api/meta-ads/accounts/{id}/control con pause/cancel solo OWNER o ADMIN actualmente asignado con canSync. Origin/autenticación existentes y autorización revalidada bajo bloqueo884411. Pausar conserva fase y cursores; reanudar es explícito. Cancelar descarta únicamente el cursor de la importación y desactiva el ejecutor/actualización hasta otro inicio. Ambas acciones invalidan lease y scheduler; una respuesta que ya estaba en tránsito no puede escribir después. Los nuevos pasos durables comprueban también el token del programador antes de tomar una página. Ninguna de estas acciones pausa, cancela, modifica ni publica campañas/anuncios en Meta.

Migración038 aditiva: selección de cuenta/objeto y MetaAdTotal con índices. Aplicar con db:deploy, como ya exige el despliegue. No retirar credenciales ni eliminar el histórico para actualizar.

### Límites de consultas

Graph puede devolver HTTP400 con código17 y subcódigo2446079 («User request limit reached»). La importación conserva el cursor y muestra espera con próximo intento automático. No requiere reemplazar el token por ese error. La primera espera es30 minutos, ampliable con Retry-After o rechazos posteriores; no garantiza que Meta haya liberado la cuota al llegar esa hora. Pausar/cancelar sigue disponible; Continuar no adelanta las consultas.

Migración039: MetaApiQuota contiene solo digest SHA256 del ámbito, siguiente reserva y fechas/contador de bloqueo. Dentro de la misma base, conexiones OAuth del mismo usuario/app comparten presupuesto incluso al cambiar token; conexiones manuales del mismo token también. Dos instalaciones con bases distintas y otras herramientas externas pueden consumir el mismo límite de Meta: la coordinación local no lo elimina. Lecturas de sincronización espaciadas1s y lotes drenados antes de devolver errores; no se llama a Meta desde los filtros ni las consultas de progreso.

### Método de conexión y estados de entrega

Una conexión usa una sola credencial: manual o OAuth. Tener guardada la configuración de la app no significa usar dos tokens. Las entradas Manual (token), Conexión rápida y Agregar conexión OAuth abren opciones exclusivas; la rápida reutiliza una app configurada y abre Facebook sin crear otra conexión. Abrir un editor no cambia el método: se sustituye al guardar el token o completar correctamente OAuth. Un token manual de caducidad no informada no se anuncia como permanente.

La selección semanal incluye activos actuales y pausados con entrega en el periodo elegido. Las tarjetas/tabla muestran «Desactivado (pausado)», «Desactivado por campaña» o «Desactivado por conjunto», según effective_status de Meta. Los pausados conservan sus comparativos. Si la lista de activos incluye no activos, se validan primero cuenta e identidad y luego se omiten de ese inventario, sin abortar página ni perder su cursor. No se importa por defecto todo el catálogo antiguo pausado.
