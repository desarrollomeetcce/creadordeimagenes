# Meta Ads: consulta y análisis

La primera entrega amplía la plataforma existente: Meta Ads en el menú lateral, tres niveles, tarjetas/tabla, cinco periodos simultáneos, calendario opcional, ranking con mínimo de resultados, alertas explicables y detalle de gasto diario. Solo lectura publicitaria: no publica, pausa ni cambia presupuestos. No llama a modelos de IA. La infraestructura y los servicios externos mantienen sus propias condiciones y límites.

## Conectar Marketing API

Como OWNER, abre Meta Ads → Conexiones → Mi app · Marketing API. Crea/configura tu app en Meta, solicita `ads_read` y acceso a las cuentas que administras; `business_management` puede ser necesario para determinados accesos empresariales. La revisión/verificación depende de Meta y del tipo de uso. El módulo no crea una app de Meta en nombre del usuario ni sustituye esa autorización.

Guarda nombre, versión Graph compatible con tu app, ID de app opcional y token de acceso. La versión inicial del formulario es v23.0, no una afirmación de ser la versión más reciente: se puede cambiar antes de guardar. Nunca enviar tokens por chat, Git ni logs. Pulsa Verificar y traer cuentas. La verificación comprueba lectura de cuentas; sincronizar comprueba los campos de objetos/estadísticas.

## Conectar MCP

Meta Ads → Conexiones → Conexión MCP. Guarda la conexión y prueba Autorizar MCP. El cliente usa Streamable HTTP JSON/SSE al destino fijo `https://mcp.facebook.com/ads`, descubrimiento OAuth, PKCE S256 y cliente público registrado cuando el servidor lo admite. Si Meta exige un cliente previamente registrado, coloca su ID de cliente. Redirect de producción:

`https://creadordeimagenes-three.vercel.app/api/meta/oauth/callback`

La alternativa es introducir un token emitido para ese servidor MCP. No se asume que un token de Graph, una suscripción de chat o una clave de OpenAI sean válidos para MCP. Las autorizaciones se vinculan a sesión/usuario/navegador, caducan en10min y solo se consumen una vez. Cambiar/desconectar una conexión invalida callbacks anteriores; las credenciales nuevas exigen otra verificación.

El cliente descubre herramientas de lectura, sin permitir llamadas arbitrarias desde el navegador. Importa herramientas compatibles de cuentas, campañas, conjuntos, anuncios e insights con parámetros declarados para cuenta, nivel, datos diarios, fechas y atribución. No usa herramientas de publicación, mutación, presupuesto ni ejecución genérica. Respuestas narrativas o esquemas incompatibles fallan con indicación de usar Marketing API. Verificar cuentas no garantiza que el MCP ofrezca todos los insights requeridos.

**Estado de verificación externa:** el entorno de desarrollo bloqueó los dominios Meta y no dispone de autorización real. Se probaron protocolo, OAuth, parsers y sincronización con dobles explícitos. No está confirmada la disponibilidad del servidor MCP para clientes propios ni sus herramientas reales; lo confirma la conexión del OWNER en producción. No se afirma integración real validada a partir de los datos de prueba.

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
