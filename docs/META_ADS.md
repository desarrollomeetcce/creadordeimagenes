# Meta Ads: consulta y análisis

La primera entrega amplía la plataforma existente: Meta Ads en el menú lateral, tres niveles, tarjetas/tabla, cinco periodos simultáneos, calendario opcional, ranking con mínimo de resultados, alertas explicables y detalle de gasto diario. Solo lectura publicitaria: no publica, pausa ni cambia presupuestos. No llama a modelos de IA. La infraestructura y los servicios externos mantienen sus propias condiciones y límites.

## Conectar Marketing API

Como OWNER, abre Meta Ads → Conexiones → Mi app · Marketing API. Crea/configura tu app en Meta, solicita `ads_read` y acceso a las cuentas que administras; `business_management` puede ser necesario para determinados accesos empresariales. La revisión/verificación depende de Meta y del tipo de uso. El módulo no crea una app de Meta en nombre del usuario ni sustituye esa autorización.

Guarda nombre, versión Graph compatible con tu app, ID de app opcional y token de acceso. La versión inicial del formulario es v23.0, no una afirmación de ser la versión más reciente: se puede cambiar antes de guardar. Nunca enviar tokens por chat, Git ni logs. Pulsa Verificar y traer cuentas. La verificación comprueba lectura de cuentas; sincronizar comprueba los campos de objetos/estadísticas.

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

Para Marketing API necesitas tu propia app de Meta habilitada para acceso publicitario, token de usuario o usuario del sistema con `ads_read` y acceso a las cuentas correspondientes; `business_management` cuando el tipo de acceso empresarial lo requiera. Revisión de app, roles y verificación del negocio dependen de Meta. Configura versión Graph compatible e introduce el token solo en el campo protegido; pulsa Verificar y traer cuentas. No compartas contraseña, token ni App Secret por chat o Git. El campo ID de app es informativo/opcional y no sustituye los permisos del token.

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
