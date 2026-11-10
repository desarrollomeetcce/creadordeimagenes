# API privada de diplomados · v1

En **Inventario → API de consulta**, un OWNER vigente crea una clave con nombre y listas autorizadas. Se muestra una sola vez; guárdala como `DIPLOMADOS_API_KEY` en las variables secretas del **servidor** de tu otra plataforma. No usar `NEXT_PUBLIC`, código del navegador, URLs ni conversaciones para almacenar la clave. El panel permite revocarla y copiar instrucciones para Codex.

La API es de solo lectura y no llama a Meta ni a proveedores de IA. Devuelve nombres y categorías del catálogo canónico existente, también para inventarios históricos compatibles. No devuelve ventas, gastos, clientes, usuarios, campañas, temarios ni contenido privado de los cursos. No interpreta un diplomado como activo/inactivo en publicidad.

## Consultar

Cabecera obligatoria: `Authorization: Bearer <CLAVE>`.

- `GET /api/v1/inventarios`: IDs y nombres de las listas autorizadas y no archivadas.
- `GET /api/v1/diplomados`: catálogo paginado.

Parámetros de diplomados:

| Parámetro | Función |
| --- | --- |
| `listId` | Lista autorizada. Se puede omitir únicamente cuando la clave tiene una sola lista disponible. |
| `q` | Buscar en el nombre sin distinguir tildes ni mayúsculas; hasta 100 caracteres. |
| `category` | Nombre exacto de categoría principal o secundaria, sin distinguir tildes/mayúsculas. |
| `id` | Filtrar por ID del diplomado dentro de esa lista. |
| `page` | Página desde 1, máximo 10.000. |
| `limit` | De 1 a 100 resultados, predeterminado 50. |

```js
// Ejecutar en el servidor de la plataforma de destino.
const url = new URL("/api/v1/diplomados", process.env.DIPLOMADOS_API_BASE_URL);
url.searchParams.set("listId", process.env.DIPLOMADOS_LIST_ID);
url.searchParams.set("q", "gestion ambiental");
url.searchParams.set("page", "1");
url.searchParams.set("limit", "50");
const response = await fetch(url, {
  headers: { Authorization: "Bearer " + process.env.DIPLOMADOS_API_KEY },
  cache: "no-store",
});
if (!response.ok) throw new Error("No se pudo consultar el catálogo");
const result = await response.json();
```

Ejemplo de estructura, con valores ilustrativos:

```json
{
  "data": [
    {
      "id": "ID_DEL_DIPLOMADO",
      "name": "Gestión Ambiental",
      "list": { "id": "ID_DE_LISTA", "name": "Lista de Diplomados" },
      "categories": { "primary": ["Ingeniería"], "secondary": [] }
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 1, "pages": 1, "hasMore": false }
}
```

Recorrer páginas mientras `hasMore` sea verdadero. Usar IDs, no posiciones de página. El catálogo es actual y puede cambiar entre consultas; no es una instantánea transaccional de varias páginas. La API reutiliza la consolidación canónica del inventario, sin duplicar un diplomado por aparecer en varias hojas.

## Acceso y límites

Las claves son aleatorias de 256 bits y se guardan únicamente como SHA-256, con máscara de presentación. No son claves de OpenAI/Gemini ni permiten iniciar sesión o administrar la plataforma. Cada petición revalida revocación, vencimiento, OWNER aprobado/no archivado y listas vigentes. El rol ADMIN y los permisos compartidos del inventario no autorizan crear claves.

Hasta 20 claves activas por propietario y 20 listas por clave. Vencimiento opcional: sin vencimiento, 30/90/365 días. Hasta 600 solicitudes por 15 minutos por clave; `429` incluye `Retry-After: 900`. Último uso actualizado como máximo cada cinco minutos. La consulta limita cada catálogo a 20.000 identidades de origen y devuelve como máximo 100 resultados por respuesta; no calcula información financiera.

Respuestas privadas sin caché. No se habilita CORS abierto: el consumo previsto es servidor a servidor.

| Estado | Significado |
| --- | --- |
| 400 | Parámetros inválidos o lista no especificada cuando hay varias. |
| 401 | Falta clave, es inválida, venció, se revocó o el propietario perdió autorización. |
| 404 | Lista no autorizada, archivada o no disponible. |
| 405 | Método no permitido: los endpoints externos no admiten escrituras. |
| 413 | Inventario superior al límite de esta versión. |
| 429 | Se alcanzó el límite de solicitudes. |

Errores: `{ "error": { "code": "UNAUTHORIZED", "message": "..." } }`. No interpretar un error como un catálogo vacío. Crear una nueva clave y actualizar la variable de destino antes de revocar la anterior permite rotación sin interrupción.

## Despliegue y pruebas

Migración `202611100003_diploma_api`, regenerar Prisma y reiniciar web con el despliegue habitual. No se crea ninguna clave de producción automáticamente. Gestión interna con sesión OWNER en `/api/diploma-api/keys`; los endpoints externos usan exclusivamente Bearer.

Pruebas en PostgreSQL sintético exclusivo (`RUN_DIPLOMA_API_QA=1`, base `delivery_qa`): aislamiento entre listas/propietarios, catálogo canónico, búsqueda, paginación, rechazo de rol, archivo, expiración, revocación, ausencia de contenidos privados y límite de uso; proveedores externos bloqueados. Chromium comprueba creación de clave desde Inventario, secreto enmascarado sin almacenamiento de navegador, consulta real sin cookies, POST rechazado y revocación inmediata, escritorio/móvil. No acredita que el VPS haya aplicado la migración ni que otra plataforma esté ya configurada.
