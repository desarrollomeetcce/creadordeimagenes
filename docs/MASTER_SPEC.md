# PROMPT MAESTRO DEFINITIVO PARA CODEX
## Desarrollo de una plataforma SaaS de generación masiva de imágenes y afiches publicitarios mediante inteligencia artificial
### Arquitectura multiproyecto, instrucciones jerárquicas, producción masiva, edición rápida, administración y control de costos

**TIPO DE ENCARGO:** Desarrollo de software real, funcional y preparado para producción.

**REPOSITORIO:** Utilizar el repositorio de GitHub conectado a Codex.

**IDIOMA:** Toda la interfaz en español.

**PRIORIDAD:** Desarrollar rápidamente un generador de publicidad mediante inteligencia artificial, no un editor gráfico tradicional.

---

# 1. TU ROL Y RESPONSABILIDAD

Actúa como un equipo senior integrado por:

- Arquitecto de software SaaS.
- Ingeniero de software Full Stack.
- Ingeniero de inteligencia artificial generativa.
- Especialista en modelos de generación y edición de imágenes.
- Diseñador gráfico publicitario senior.
- Director creativo especializado en marketing digital.
- Especialista en automatización de producción publicitaria.
- Diseñador de experiencia de usuario UX/UI.
- Ingeniero de bases de datos.
- Ingeniero de seguridad informática.
- Especialista en optimización de costos de API.
- Ingeniero de infraestructura cloud.
- Ingeniero de aseguramiento de calidad.

Tu responsabilidad es desarrollar una plataforma web real que permita a diferentes usuarios generar numerosos afiches publicitarios mediante inteligencia artificial.

No debes limitarte a describir una arquitectura, crear una maqueta o producir una demostración visual.

Debes construir el software, sus interfaces, procesos, servicios, integraciones y pruebas.

La plataforma debe ser moderna, sencilla, funcional, mantenible, segura y escalable.

## Objetivo técnico

Construir una aplicación que permita:

1. Administrar distintos proyectos publicitarios.
2. Crear categorías dentro de cada proyecto.
3. Crear numerosos subproductos dentro de cada categoría.
4. Definir instrucciones generales mediante prompts.
5. Adjuntar imágenes y documentos a esos prompts.
6. Heredar automáticamente instrucciones entre niveles.
7. Personalizar instrucciones únicamente cuando sea necesario.
8. Generar múltiples imágenes por subproducto.
9. Producir numerosos afiches en una misma operación.
10. Visualizar los resultados organizados.
11. Editar manualmente elementos básicos cuando sea posible.
12. Editar o regenerar imágenes mediante IA.
13. Descargar individual o masivamente.
14. Conservar imágenes solamente cuando se desee.
15. Administrar usuarios, roles y permisos.
16. Supervisar las operaciones y el consumo.
17. Conservar historial administrativo aunque se eliminen proyectos o imágenes.
18. Minimizar costos operativos.

**La aplicación debe poder utilizarse para proyectos educativos, comerciales, inmobiliarios y de cualquier otro sector.**

---

# 2. FILOSOFÍA FUNDAMENTAL DE LA PLATAFORMA

No quiero un clon de Canva.

No quiero que los trabajadores tengan que diseñar manualmente cada afiche.

No quiero comenzar con una hoja en blanco, insertar títulos, colocar fotografías, ajustar elementos, seleccionar fondos y construir toda la publicidad desde cero.

Ese enfoque requiere demasiado trabajo.

Quiero una plataforma de **producción publicitaria mediante inteligencia artificial**.

El usuario indica qué desea crear.

La IA interpreta las instrucciones.

La plataforma produce los diseños.

El usuario selecciona los resultados.

Si un diseño necesita una corrección sencilla, podrá realizarla manualmente.

Si requiere una modificación creativa, podrá utilizar IA.

Después descargará sus imágenes.

## Flujo principal

**Proyecto → Categoría → Subproductos → Generar → Revisar → Descargar**

Este debe ser el flujo de trabajo dominante.

La interfaz y la arquitectura deben estar diseñadas alrededor de esta experiencia.

## Prioridades

1. Calidad publicitaria.
2. Generación rápida.
3. Producción masiva.
4. Facilidad de uso.
5. Reutilización de instrucciones.
6. Configuración mínima.
7. Ahorro de costos.
8. Control administrativo.
9. Descargas rápidas.
10. Almacenamiento eficiente.

Evita funciones de edición complejas que retrasen innecesariamente el desarrollo.

---

# 3. LA PLATAFORMA DEBE SER GENERAL, NO EXCLUSIVA PARA DIPLOMADOS

Este requisito es obligatorio.

Aunque el primer proyecto será Cursos y Diplomados, **la plataforma no debe estar programada exclusivamente para educación**.

Debe permitir crear proyectos de cualquier temática.

Ejemplos:

**Proyecto: Cursos y Diplomados**

Publicidad de formación profesional.

**Proyecto: Carreras Virtuales**

Publicidad de programas de formación.

**Proyecto: BK Academy**

Publicidad de cursos infantiles.

**Proyecto: Productos Comerciales**

Publicidad de cortinas, calzado, accesorios y otros artículos.

**Proyecto: Inmobiliaria**

Publicidad de casas, departamentos y terrenos.

**Proyecto: Servicios Empresariales**

Publicidad de consultoría, asesoría y servicios profesionales.

Estos proyectos pueden tener comportamientos completamente diferentes.

Por ejemplo:

El proyecto Cursos y Diplomados puede priorizar una estética institucional.

El proyecto Productos Comerciales puede generar publicidad orientada a ventas minoristas.

El proyecto Inmobiliaria puede priorizar fotografías de propiedades.

El proyecto BK Academy puede utilizar una estética infantil, creativa y educativa.

Por eso, los prompts y las configuraciones no deben estar codificados exclusivamente para diplomados.

## Regla de arquitectura

El software será genérico.

Las instrucciones particulares pertenecerán a cada proyecto.

El proyecto inicial Cursos y Diplomados será una configuración precargada de la plataforma, no una restricción de su arquitectura.

---

# 4. JERARQUÍA PRINCIPAL

La plataforma utilizará cuatro niveles de organización.

**PROYECTOS → CATEGORÍAS → SUBPRODUCTOS → VARIACIONES**

## NIVEL 1 — PROYECTOS

Son espacios principales de trabajo.

Cada proyecto puede tener:

- Nombre.
- Descripción.
- Prompt de comportamiento.
- Adjuntos.
- Identidad de marca.
- Usuarios autorizados.
- Permisos.
- Configuraciones.
- Categorías.
- Historial.
- Políticas de almacenamiento.

Ejemplo:

Cursos y Diplomados.

## NIVEL 2 — CATEGORÍAS

Organizan conjuntos de productos o trabajos dentro de un proyecto.

Cada categoría puede tener:

- Nombre.
- Prompt general.
- Adjuntos.
- Estilo predeterminado.
- Formatos predeterminados.
- Cantidad de variaciones.
- Distribución de tipos de imágenes.
- Instrucciones compartidas.
- Configuraciones reutilizables.

Ejemplo:

Afiches Perú.

También podría llamarse:

- Campaña Octubre.
- Promociones Facebook.
- Nuevos Productos.
- Publicidad Institucional.
- Catálogo de Servicios.

No limitar las categorías a países.

## NIVEL 3 — SUBPRODUCTOS

Cada subproducto representa un tema, artículo, servicio o elemento individual que requiere imágenes.

Ejemplos dentro de Afiches Perú:

- Inocuidad Alimentaria.
- Tratamiento de Aguas.
- Psicología Forense.
- Recursos Humanos.

Ejemplos dentro de Productos Comerciales:

- Cortina Modelo A.
- Cortina Modelo B.
- Zapatillas.
- Secadora Portátil.

Cada subproducto puede heredar las instrucciones de su categoría o tener instrucciones particulares.

## NIVEL 4 — VARIACIONES

Cada variación es una imagen generada.

Ejemplo:

Inocuidad Alimentaria:

- Imagen 01.
- Imagen 02.
- Imagen 03.
- Imagen 04.
- Imagen 05.

Cada variación debe ser independiente.

Las variaciones deben poder:

- Visualizarse.
- Seleccionarse.
- Editarse.
- Regenerarse.
- Duplicarse.
- Descargarse.
- Guardarse.
- Eliminarse.

No crear un nivel de navegación obligatorio adicional para grupos de variaciones.

Los grupos de distribución existirán solamente como configuraciones internas de cada subproducto.

---

# 5. PROYECTO INICIAL QUE DEBES CREAR AUTOMÁTICAMENTE

Durante la instalación inicial debes crear el proyecto:

**CURSOS Y DIPLOMADOS**

Asociado a:

**CÁMARA NACIONAL DE NEGOCIOS**

Este proyecto debe aparecer en la pantalla principal después de inicializar la aplicación.

No debe requerir que el owner lo cree manualmente.

No debe duplicarse al ejecutar nuevamente las migraciones.

Utiliza un proceso de inicialización idempotente.

## Información inicial

Nombre:

Cursos y Diplomados.

Descripción:

"Proyecto destinado a la generación de imágenes y afiches publicitarios para cursos, diplomados, especializaciones y otros programas de capacitación de Cámara Nacional de Negocios".

Sector:

Educación y capacitación profesional.

Idioma:

Español.

Enfoque:

Marketing educativo y publicidad digital.

Estilo sugerido:

Institucional, corporativo, profesional y publicitario.

Formato sugerido:

1:1.

Generación:

Mediante inteligencia artificial.

Almacenamiento de imágenes generadas:

Temporal por defecto.

Prompt maestro:

El definido en la siguiente sección.

## Importante

No crear obligatoriamente categorías por país.

La organización interna de las categorías será decisión del usuario.

Podrás incluir una configuración reutilizable de ejemplo llamada "Afiches Perú", pero no es necesario crear categorías vacías.

No asignar automáticamente un precio o moneda a todas las futuras categorías.

Los precios, países, promociones y demás condiciones comerciales deberán provenir de las instrucciones correspondientes.

---

# 6. PROMPT MAESTRO PRECARGADO DE CURSOS Y DIPLOMADOS

Este prompt debe guardarse realmente en la base de datos como una configuración editable del proyecto.

No debe quedar únicamente como documentación.

## INICIO DEL PROMPT PREDETERMINADO

Actúa como un director creativo publicitario senior con experiencia en marketing educativo, comunicación institucional, escuelas de negocios y formación profesional.

Trabajas para Cámara Nacional de Negocios.

Este proyecto está destinado a desarrollar publicidad para cursos, diplomados, especializaciones, programas de capacitación y otras ofertas educativas autorizadas.

Tu misión consiste en crear afiches profesionales, atractivos, claros y comercialmente efectivos, especialmente para Facebook, Instagram y otras plataformas digitales.

Los diseños deben transmitir:

- Profesionalismo.
- Confianza.
- Modernidad.
- Institucionalidad.
- Credibilidad.
- Formación de calidad.
- Claridad informativa.
- Atractivo comercial.

No produzcas publicidad genérica o visualmente improvisada.

Actúa como un diseñador gráfico con experiencia en campañas digitales y comunicación educativa.

### 6.1. Jerarquía publicitaria

El nombre del programa debe ser uno de los principales elementos visuales.

Debe resultar notorio y fácilmente legible desde dispositivos móviles.

Cuando exista una promoción principal, debe recibir el protagonismo indicado por las instrucciones.

Por ejemplo, cuando se solicite:

**MENSUALIDADES GRATIS**

Esta frase puede convertirse en uno de los elementos visuales más importantes del afiche.

Cuando exista un precio y no se indique lo contrario, debe aparecer en una posición secundaria, con tamaño discreto, pero perfectamente legible.

El precio no debe competir visualmente con el nombre del programa ni con la promoción principal.

No inventes precios.

### 6.2. Estética institucional

Utiliza:

- Tipografías profesionales.
- Composiciones equilibradas.
- Buen contraste.
- Espacios adecuados.
- Colores coherentes.
- Elementos geométricos discretos.
- Logotipos correctamente alineados.
- Jerarquía tipográfica clara.
- Fotografías relevantes cuando correspondan.

Evita composiciones saturadas.

Evita efectos decorativos innecesarios.

Evita una apariencia informal cuando se solicita un diseño institucional.

### 6.3. Diversidad de diseños

Cuando se soliciten múltiples variaciones, crea diseños diferentes.

No basta con cambiar el color de fondo.

Varía:

- Distribución.
- Composición.
- Ubicación del título.
- Jerarquía tipográfica.
- Tipografía.
- Paletas.
- Uso del espacio.
- Distribución fotográfica.
- Elementos geométricos.
- Posición de promociones.
- Organización de logos.

Las variaciones deben conservar coherencia institucional sin verse idénticas.

### 6.4. Afiches tipográficos

Cuando se solicite un afiche de modalidad Texto:

Crea una composición profesional basada principalmente en elementos tipográficos.

Puedes utilizar:

- Títulos.
- Subtítulos.
- Frases comerciales.
- Bloques de color.
- Líneas.
- Formas.
- Fondos.
- Elementos gráficos.
- Logos autorizados.

La modalidad Texto no significa que debas eliminar los logos.

Los logos institucionales pueden aparecer como imágenes.

No incorpores fotografías temáticas si la instrucción exige una composición exclusivamente tipográfica.

### 6.5. Afiches con fotografías

Cuando se solicite Imagen + Texto:

Utiliza fotografías, ilustraciones o escenas directamente relacionadas con el tema del programa.

Ejemplos:

Inocuidad Alimentaria:

Laboratorios, control sanitario, inspecciones, manipulación higiénica y procesos alimentarios.

Monitoreo Ambiental:

Profesionales de campo, mediciones ambientales, equipos técnicos, muestreo y laboratorios.

Recursos Humanos:

Gestión de talento, selección de personal, equipos corporativos y entornos empresariales.

Ingeniería Sanitaria:

Infraestructura sanitaria, tratamiento de agua, redes e instalaciones técnicas.

Psicología Forense:

Evaluación profesional, ciencias forenses, investigación técnica y documentación especializada.

Las fotografías deben ser creíbles, apropiadas y visualmente profesionales.

Evita imágenes artificiales de mala calidad.

### 6.6. Logos institucionales

Utiliza únicamente los logos autorizados y disponibles en las instrucciones o adjuntos.

La marca principal de este proyecto es Cámara Nacional de Negocios.

Podrán existir recursos institucionales adicionales como:

- WOSA.
- ISO 9001.
- ISO 21001.
- ISO 22000.
- Otros logos autorizados.

No inventes versiones de esos logos.

No alteres sus proporciones.

No afirmes que una norma ISO constituye por sí sola una acreditación académica.

No inventes certificaciones, alianzas ni respaldos institucionales.

Los logos gubernamentales solamente deberán utilizarse cuando exista autorización y una relación institucional que justifique su incorporación.

### 6.7. Contenido comercial

Utiliza únicamente los datos proporcionados por las instrucciones del proyecto, categoría o subproducto.

Según las condiciones particulares, podrían existir:

- Duración de 3 meses.
- Acceso virtual.
- Acceso 24/7.
- Pago único.
- Mensualidades gratis.
- Certificados verificables.
- Formación complementaria en Excel.
- Formación complementaria en inglés.

No asumas que todos los programas tienen las mismas características.

Utiliza estos beneficios solamente cuando hayan sido confirmados o autorizados para el programa correspondiente.

### 6.8. Preguntas de impacto

Cuando sea apropiado, puedes utilizar preguntas comerciales relacionadas con el producto.

Ejemplos:

"¿Quieres especializarte en Inocuidad Alimentaria?"

"¿Buscas mejorar tu perfil profesional?"

"Especialízate en Gestión Ambiental".

No reemplaces el nombre principal del programa por una frase publicitaria genérica.

No prometas empleo garantizado ni títulos oficiales no acreditados.

### 6.9. Formatos

Adapta las composiciones a las proporciones solicitadas.

Prioriza la legibilidad.

No deformes textos, fotografías ni logotipos.

Mantén márgenes seguros.

### 6.10. Calidad final

Cada afiche debe:

- Tener una composición profesional.
- Ser fácilmente legible.
- Presentar el tema correcto.
- Respetar promociones y precios autorizados.
- Utilizar logos auténticos.
- Evitar errores ortográficos.
- Evitar textos cortados.
- Evitar elementos superpuestos.
- Mantener una estética publicitaria atractiva.
- Estar preparado para distribución digital.

Respeta siempre las instrucciones particulares de la categoría y el subproducto, siempre que no contradigan las políticas obligatorias de la plataforma.

## FIN DEL PROMPT PREDETERMINADO

Este contenido debe poder modificarse y versionarse.

El usuario podrá complementarlo mediante instrucciones de categoría y subproducto.

---

# 7. OTROS PROYECTOS: COMPORTAMIENTO INDEPENDIENTE

Cuando el usuario presione:

**+ Nuevo proyecto**

Debe poder crear un proyecto completamente diferente.

Ejemplo:

Nombre:

Productos Comerciales.

Prompt:

"Generar afiches de productos de consumo con enfoque comercial, precios destacados y fotografías atractivas".

Adjuntos:

- Logo de la tienda.
- Fotografías de productos.
- Manual de marca.

Este proyecto no debe heredar automáticamente el comportamiento de Cursos y Diplomados.

No debe incluir automáticamente:

- Mensualidades gratis.
- Diplomas.
- Educación.
- Certificaciones.
- Logos de Cámara Nacional de Negocios.

Cada proyecto tendrá su propia identidad.

## Configuración mínima

Para crear un nuevo proyecto solamente debe exigirse:

**Nombre del proyecto.**

Los demás campos serán opcionales.

Cuando no exista un prompt específico, utilizar un comportamiento general neutral de generación publicitaria.

---

# 8. PROMPTS EN TODOS LOS NIVELES

La plataforma debe permitir instrucciones mediante lenguaje natural en:

1. Proyecto.
2. Categoría.
3. Subproducto.
4. Variación, para edición o regeneración específica.

Los prompts serán una de las principales herramientas de configuración.

## No quiero formularios comerciales innecesarios

**No crear campos obligatorios ni selectores separados para país, moneda, precio, duración, promociones o beneficios comerciales.**

Estos datos se escribirán directamente en los prompts.

Ejemplo:

"Todos los afiches de esta categoría serán para Perú. El pago único es S/90. Mostrar Mensualidades Gratis de manera notoria. El precio debe ser pequeño".

El sistema debe interpretar esas instrucciones al generar los afiches.

No quiero buscar Perú en un desplegable.

No quiero buscar una moneda.

No quiero un formulario específico para escribir el precio.

No quiero campos obligatorios para indicar duración o promociones.

Todo eso debe poder indicarse de manera natural.

## Campos estructurados permitidos

Conservar controles sencillos únicamente para funcionalidades operativas que realmente mejoran la experiencia:

- Cantidad de subproductos.
- Cantidad de variaciones.
- Distribución de variaciones.
- Modalidad de imagen.
- Formato.
- Estilo.
- Calidad, cuando corresponda.
- Modelo de IA, cuando esté autorizado.
- Usuarios y permisos.
- Almacenamiento.
- Descarga.

Los detalles comerciales se gestionarán mediante prompts y adjuntos.

---

# 9. ARCHIVOS ADJUNTOS EN TODOS LOS PROMPTS

Este requisito es obligatorio.

Todo espacio de prompt debe permitir adjuntar archivos.

Esto aplica a:

- Prompts de proyectos.
- Prompts de categorías.
- Prompts de subproductos.
- Prompts de edición o regeneración de variaciones.

## Formatos

Admitir inicialmente:

- PDF.
- DOCX.
- TXT.
- JPG.
- JPEG.
- PNG.
- WebP.
- CSV cuando corresponda.
- SVG seguro para recursos gráficos autorizados.

## Interfaz

Cada prompt tendrá:

- Área de escritura.
- Botón de adjuntar.
- Opción de arrastrar y soltar.
- Lista de archivos cargados.
- Miniaturas de imágenes.
- Nombre de documentos.
- Opción de eliminar.
- Opción de reemplazar.
- Indicador de procesamiento.

## Propósito de los archivos

Permitir indicar si el archivo es:

- Referencia visual.
- Logo institucional.
- Fotografía que debe utilizarse.
- Información comercial.
- Manual de marca.
- Documento informativo.
- Ejemplo de diseño.
- Material de contexto.

No todos los adjuntos deberán incorporarse gráficamente.

Por ejemplo:

Un PDF puede aportar información.

Un logo puede utilizarse en el diseño.

Una fotografía puede incorporarse como recurso visual.

Un afiche puede servir solamente como inspiración.

## Procesamiento

Implementar extracción de texto mediante herramientas adecuadas.

Utilizar procesamiento convencional cuando sea suficiente.

No llamar a una IA de pago simplemente por subir un archivo.

Si resulta necesario utilizar un modelo para comprender un documento o imagen, hacerlo dentro de los presupuestos autorizados y registrar el consumo.

---

# 10. HERENCIA INTELIGENTE DE INSTRUCCIONES

La plataforma debe resolver las instrucciones siguiendo esta jerarquía:

**Configuración global → Proyecto → Categoría → Subproducto → Variación**

El nivel más específico tiene prioridad cuando existe una contradicción.

## Ejemplo 1: Herencia completa

Proyecto:

Cursos y Diplomados.

Categoría:

Afiches Perú.

Prompt de categoría:

"Todos los afiches serán para Perú. Mostrar Mensualidades Gratis. Pago único S/90. Precio pequeño. Utilizar los logos autorizados".

Subproducto:

Inocuidad Alimentaria.

Prompt específico:

Vacío.

Resultado:

La IA utiliza todas las instrucciones heredadas.

## Ejemplo 2: Personalización

Subproducto:

Tratamiento de Aguas.

Prompt específico:

"Este diplomado será para Ecuador. El precio es USD 40. No utilizar logos gubernamentales exclusivos de Perú. Mantener el estilo institucional".

Resultado:

El sistema utiliza:

- Ecuador.
- USD 40.
- Estilo institucional.
- Mensualidades gratis, si sigue siendo aplicable.
- Logos autorizados no excluidos.

No debe combinar el precio anterior S/90 con USD 40.

## Ejemplo 3: Complemento

Categoría:

"Todos los afiches deben ser institucionales".

Subproducto:

"Para Monitoreo Ambiental utiliza fotografías de técnicos en campo y una paleta verde".

Resultado:

Ambas instrucciones se complementan.

## Ejemplo 4: Reemplazo

Categoría:

"Utilizar colores azules y blancos".

Subproducto:

"Para este producto utiliza exclusivamente tonos verdes y blancos en lugar de la paleta anterior".

Resultado:

Debe aplicarse la instrucción particular.

## Interpretación de conflictos

No resolver contradicciones comerciales mediante una simple concatenación de prompts.

Implementar un motor que construya instrucciones efectivas.

Debe:

- Respetar prioridades jerárquicas.
- Identificar contradicciones evidentes.
- Evitar precios duplicados.
- Evitar países incompatibles.
- Evitar logos expresamente excluidos.
- Conservar instrucciones compatibles.
- Aplicar las restricciones obligatorias de seguridad.

Cuando exista una ambigüedad importante que no pueda resolverse con seguridad, mostrarla antes de generar.

No modificar silenciosamente información comercial que resulte incierta.

## Vista previa

Incluir una sección:

**Ver instrucciones finales**

Mostrar un resumen de las instrucciones que se utilizarán en la generación.

Este resumen debe ser sencillo y comprensible.

No es necesario mostrar información técnica extensa salvo que el usuario abra las opciones avanzadas.

---

# 11. EFICIENCIA DE TOKENS

Guardar un prompt no debe producir consumo de API.

La plataforma almacenará las instrucciones en su propia base de datos.

## Operaciones sin IA

No realizar llamadas a modelos para:

- Escribir prompts.
- Guardar prompts.
- Crear proyectos.
- Crear categorías.
- Crear subproductos.
- Expandir configuraciones.
- Modificar cantidades.
- Seleccionar formatos.
- Buscar estilos.
- Mover elementos editables.
- Descargar imágenes existentes.

## Operaciones que pueden utilizar IA

- Generar afiches.
- Generar imágenes referenciales.
- Crear propuestas creativas.
- Interpretar documentos cuando sea necesario.
- Editar imágenes mediante IA.
- Regenerar imágenes.

## Optimización obligatoria

Implementar:

- Reutilización de configuraciones.
- Resolución de herencia mediante código.
- Eliminación de repeticiones innecesarias.
- Procesamiento compartido de información común.
- Caché seguro.
- Preparación de planes creativos por lote.
- Reutilización de recursos.
- Modelos económicos para tareas sencillas.
- Registro de tokens y costos cuando el proveedor los informe.

No prometer que un prompt heredado tiene costo cero cuando realmente se transmite al proveedor durante una solicitud facturable.

---

# 12. PANTALLA PRINCIPAL DE PROYECTOS

Después del login quiero ver mis proyectos.

Diseño:

- Moderno.
- Limpio.
- Institucional.
- Sencillo.
- Con buena separación.
- Fácil de comprender.

## Cada proyecto mostrará

- Nombre.
- Descripción breve.
- Creador.
- Cantidad de categorías.
- Última actividad.
- Estado.
- Usuarios con acceso.

## Acciones

- Abrir.
- Editar.
- Compartir.
- Duplicar.
- Archivar.
- Enviar a papelera.
- Consultar historial.

## Crear proyecto

Botón:

**+ Nuevo proyecto**

Formulario sencillo:

- Nombre.
- Prompt general.
- Adjuntos.
- Usuarios autorizados.
- Configuración opcional.

No exigir información comercial estructurada.

---

# 13. PANTALLA DE CATEGORÍAS

Al abrir un proyecto, mostrar las categorías que contiene.

Ejemplo:

**CURSOS Y DIPLOMADOS**

Categorías:

- Afiches Perú.
- Afiches Ecuador.
- Campaña Institucional.
- Promociones Especiales.

Botón:

**+ Nueva categoría**

## Crear categoría

Solicitar:

- Nombre.
- Prompt general opcional.
- Adjuntos opcionales.
- Configuración predeterminada opcional.

El usuario podrá crear una categoría escribiendo únicamente su nombre.

## Acciones

- Abrir.
- Editar.
- Duplicar.
- Reutilizar configuración.
- Consultar subproductos.
- Generar.
- Archivar.
- Eliminar según permisos.

---

# 14. CONFIGURACIÓN GENERAL DE CATEGORÍA

La categoría es el nivel principal para ahorrar trabajo cuando varios subproductos utilizan las mismas condiciones.

## Ejemplo

Categoría:

Afiches Perú.

Prompt:

"Todos los afiches serán para Cámara Nacional de Negocios, dirigidos al mercado peruano.

El precio es S/90 como pago único.

Mostrar Mensualidades Gratis de manera notoria.

El precio debe ser pequeño.

Utilizar los logos autorizados que adjunté.

Crear diseños profesionales, institucionales, limpios y variados.

Cuando se utilicen fotografías, deben relacionarse directamente con el tema específico de cada diplomado".

Adjuntos:

- Logo Cámara Nacional de Negocios.
- Logos adicionales autorizados.
- Referencias visuales.
- Documentos institucionales.

Configuración operativa:

- Cantidad predeterminada de variaciones.
- Modalidades.
- Distribución.
- Formatos.
- Estilo.
- Modelo, cuando corresponda.

Todo esto puede heredarse.

## No obligar a configurarlo todo

Si la categoría tiene solamente un nombre y un prompt, debe funcionar.

Si tiene únicamente un nombre, debe utilizar las instrucciones generales del proyecto y valores operativos predeterminados.

---

# 15. CREACIÓN MASIVA DE SUBPRODUCTOS

Dentro de cada categoría implementar:

**+ Agregar subproducto**

**+ Agregar varios subproductos**

## Cantidad

Selector de 1 a 20.

Permitir escribir directamente un número entre 1 y 20.

## Ejemplo

Selecciono:

12.

Presiono:

**Crear espacios**

El sistema muestra doce espacios compactos.

Cada espacio permitirá escribir el nombre.

## Importación rápida

También quiero poder pegar varios nombres separados por líneas.

Ejemplo:

Inocuidad Alimentaria

Tratamiento de Aguas

Psicología Forense

Monitoreo Ambiental

Recursos Humanos

Ingeniería Sanitaria

Cada línea se convierte en un subproducto.

Permitir importación desde CSV.

## Límite

El selector de 1 a 20 corresponde a una operación de creación.

Una categoría podrá contener más de veinte subproductos si se agregan en distintas operaciones.

No crear una nueva categoría automáticamente cuando se alcance veinte.

---

# 16. INTERFAZ COMPACTA Y DESPLEGABLE DE SUBPRODUCTOS

No quiero una pantalla con veinte formularios largos.

Quiero una interfaz de filas o tarjetas compactas.

Ejemplo:

**01 — Inocuidad Alimentaria**

10 imágenes · Configuración heredada · Editar

**02 — Tratamiento de Aguas**

10 imágenes · Configuración heredada · Editar

**03 — Psicología Forense**

6 imágenes · Configuración personalizada · Editar

## Expandir

Al hacer clic en un subproducto, desplegar sus configuraciones.

## Contraer

Al cerrar, volver a la visualización compacta.

## Controles

- Expandir.
- Contraer.
- Expandir todos.
- Contraer todos.
- Duplicar.
- Eliminar.
- Restaurar configuración heredada.
- Copiar configuración.
- Generar.

## Guardado

Conservar automáticamente los cambios del formulario.

No perder datos al contraer un subproducto.

No realizar llamadas a IA simplemente por expandir o contraer.

---

# 17. CONFIGURACIÓN PARTICULAR DE CADA SUBPRODUCTO

Todos los subproductos tendrán una configuración interna opcional.

## Campos principales

**Nombre del subproducto**

Obligatorio.

**Prompt específico**

Opcional.

**Adjuntos**

Opcionales.

**Cantidad de variaciones**

Heredada o personalizada.

**Modalidades de generación**

Heredadas o personalizadas.

**Distribución**

Heredada o personalizada.

**Formato**

Heredado o personalizado.

**Estilo**

Heredado o personalizado.

**Instrucciones visuales adicionales**

Opcionales.

**Modelo y calidad**

Heredados o personalizados cuando el owner lo permita.

## No crear campos separados de país o precio

El usuario debe escribir esas condiciones en el prompt.

Ejemplo:

"Este diplomado será para Ecuador y cuesta USD 40. Mantener las demás instrucciones generales".

El sistema debe interpretar ese cambio.

## Subproducto sin configuración

Si solamente escribo:

Inocuidad Alimentaria.

Debe utilizar:

- Prompt del proyecto.
- Prompt de categoría.
- Adjuntos heredados.
- Cantidad predeterminada.
- Distribución predeterminada.
- Estilos predeterminados.
- Formatos predeterminados.

Después debe poder generar sus afiches.

**No obligar al usuario a llenar configuraciones particulares cuando no las necesita.**

---

# 18. SELECTORES INTELIGENTES CON BÚSQUEDA

Quiero una buena experiencia de usuario.

Los selectores que tengan numerosas opciones deben permitir escribir para buscar.

Ejemplo:

Estilos:

Escribo:

"mini".

Mostrar:

Minimalista.

Escribo:

"inst".

Mostrar:

Institucional.

## Opciones

Implementar búsqueda para:

- Estilos.
- Formatos.
- Modelos.
- Configuraciones guardadas.
- Usuarios.
- Recursos.
- Categorías, cuando corresponda.

## Estilo personalizado

Permitir escribir un estilo libre.

Ejemplo:

"Institucional ministerial moderno con colores impactantes".

No necesito que exista previamente como opción.

## No utilizar IA innecesariamente

La búsqueda convencional de opciones debe funcionar localmente o mediante consultas normales.

No llamar a un modelo por cada letra escrita.

---

# 19. CANTIDAD DE VARIACIONES

Cada subproducto podrá tener entre:

**1 y 12 variaciones por solicitud de generación.**

El usuario decide cuántas quiere.

## Herencia

La categoría podrá establecer:

Cantidad predeterminada: 10.

Todos los subproductos nuevos heredarán diez.

## Excepción

Un subproducto podrá establecer:

Cantidad: 5.

Solamente ese subproducto utilizará cinco.

## Generaciones posteriores

Se podrán crear nuevas tandas de imágenes del mismo subproducto.

El límite de 12 corresponde a cada solicitud, no necesariamente al historial total de imágenes de ese subproducto.

---

# 20. MODALIDADES DE GENERACIÓN

Implementar:

**Texto**

**Imagen + Texto**

**Imagen**

**Mixto**

**Aleatorio**

## Texto

Crear un afiche principalmente tipográfico.

Puede incluir:

- Textos.
- Fondos.
- Elementos geométricos.
- Formas.
- Logos.
- Sellos gráficos autorizados.

La modalidad Texto no significa que deban eliminarse los logos.

No incorporar fotografías temáticas cuando se exija un diseño únicamente tipográfico.

## Imagen + Texto

Crear un afiche con recursos fotográficos o ilustraciones y textos publicitarios.

Las fotografías deben relacionarse con el subproducto.

## Imagen

Crear una pieza predominantemente visual.

La presencia o ausencia de texto dependerá del prompt efectivo.

No interpretar automáticamente Imagen como prohibición absoluta de texto.

## Mixto

Combinar modalidades.

## Aleatorio

Permitir que el sistema establezca una distribución variada.

Respetar restricciones de categoría y subproducto.

---

# 21. DISTRIBUCIÓN DE VARIACIONES

Dentro de cada subproducto debe poder indicarse cuántas imágenes se crearán de cada modalidad.

Ejemplo:

Total:

10.

Distribución:

- Texto: 3.
- Imagen + Texto: 5.
- Imagen: 2.

Mostrar:

**10 de 10 configuradas**

## Grupos internos

Cada grupo podrá incluir:

- Cantidad.
- Modalidad.
- Estilo.
- Formato.
- Prompt complementario.

Ejemplo:

Grupo A:

3 variaciones, solo texto, institucional, 1:1.

Grupo B:

7 variaciones, imagen + texto, universitario, formatos variados.

## Interfaz

Estos grupos serán configuraciones desplegables.

No deben crear un nuevo nivel en el menú.

## Validación

La suma debe coincidir con el total solicitado.

Si no coincide, impedir generar y explicar el problema.

## Herencia

La categoría podrá establecer esta distribución.

Los subproductos podrán heredarla automáticamente.

## Automatización

Si el usuario selecciona Mixto o Aleatorio sin cantidades detalladas, distribuir automáticamente las variaciones.

---

# 22. FORMATOS DE IMÁGENES

Implementar:

- 1:1 cuadrado.
- 4:3 horizontal.
- 3:4 vertical.
- 4:5 vertical.
- 5:4 horizontal.
- 16:9 horizontal.
- 9:16 vertical.
- Aleatorio.

## Valor predeterminado

1:1 cuando no existan otras instrucciones.

## Calidad

Permitir elegir calidad cuando corresponda.

Los formatos descargados deben mantener las proporciones solicitadas.

No deformar fotografías, logos ni textos.

Adaptar los recursos cuando el modelo de IA tenga restricciones de proporción.

---

# 23. ESTILOS VISUALES

Incluir:

- Institucional.
- Ministerial.
- Universitario.
- Corporativo.
- Ejecutivo.
- Minimalista.
- Premium.
- Elegante.
- Moderno.
- Tecnológico.
- Industrial.
- Ecológico.
- Infantil.
- Educativo.
- Publicitario.
- Comercial.
- Creativo.
- Formal.
- Muy formal.
- Profesional.
- Aleatorio.

Cada estilo tendrá una descripción interna.

## Ejemplo

Institucional:

Diseño sobrio, composición equilibrada, tipografía profesional, colores coherentes y excelente legibilidad.

Minimalista:

Composición limpia, pocos elementos, espacios negativos y jerarquía clara.

Publicitario:

Composición llamativa, alto contraste, titulares destacados y enfoque comercial.

Ministerial:

Estética administrativa formal, sin implicar respaldo de organismos públicos.

## Personalización

Permitir escribir instrucciones adicionales.

No limitar los diseños a estilos predefinidos.

---

# 24. MOTOR INTELIGENTE DE DIRECCIÓN CREATIVA

Antes de generar imágenes, el sistema debe construir un plan creativo.

Recibirá:

- Prompt de proyecto.
- Prompt de categoría.
- Prompt de subproducto.
- Adjuntos relevantes.
- Modalidad.
- Estilo.
- Formato.
- Cantidad.
- Reglas institucionales.
- Restricciones.
- Preferencias guardadas.

El resultado será un plan de generación para las variaciones solicitadas.

## Ejemplo

Subproducto:

Inocuidad Alimentaria.

Variaciones:

10.

El sistema podrá proponer:

1. Diseño institucional tipográfico.
2. Diseño ministerial limpio.
3. Diseño tipográfico moderno.
4. Laboratorio alimentario con título lateral.
5. Profesional de control sanitario.
6. Producción industrial alimentaria.
7. Collage relacionado con inocuidad.
8. Diseño universitario con fotografía.
9. Diseño corporativo.
10. Diseño publicitario moderno.

No generar diez diseños idénticos cambiando únicamente los colores.

## Plan estructurado

Guardar:

- Identificador.
- Modalidad.
- Estilo.
- Composición.
- Paleta.
- Texto autorizado.
- Referencias.
- Logos.
- Formato.
- Instrucciones visuales.
- Restricciones.

---

# 25. GENERACIÓN DE IMÁGENES MEDIANTE IA

Implementar inicialmente integración con la API oficial de OpenAI.

Verificar los modelos y capacidades disponibles en la documentación oficial vigente.

No inventar nombres de modelos.

## Arquitectura

Crear un sistema de proveedores desacoplado.

Debe permitir incorporar posteriormente otros modelos y proveedores compatibles.

## Modos internos

### Modo A: IA con composición editable

La IA prepara la propuesta visual.

El sistema conserva como elementos independientes:

- Títulos.
- Textos.
- Precio cuando exista.
- Promoción.
- Logos.
- Otros elementos compatibles.

El diseño debe generarse automáticamente.

No obligar al usuario a organizar manualmente los elementos.

### Modo B: Imagen completa con IA

El modelo genera toda la composición.

Puede ofrecer mayor libertad creativa.

Los textos incrustados en la imagen pueden no ser editables de forma independiente.

### Modo C: Dirección creativa con IA y renderización gráfica

Especialmente útil para afiches tipográficos.

La IA determina la composición.

El motor gráfico renderiza el resultado.

Puede ser más económico que generar todas las piezas mediante un modelo visual.

### Modo D: Recursos existentes

Utilizar imágenes y fotografías autorizadas sin generar recursos adicionales cuando no sea necesario.

## Prioridad

Calidad comercial, facilidad de uso y costo razonable.

No reemplazar toda la generación mediante IA por una biblioteca rígida de plantillas.

---

# 26. GENERACIÓN MASIVA

La plataforma debe poder generar numerosos afiches.

Ejemplo:

15 subproductos.

10 variaciones cada uno.

Total:

150 imágenes.

## Procesamiento

Implementar:

- Colas persistentes.
- Workers.
- Procesamiento paralelo.
- Control de concurrencia.
- Control de costos.
- Manejo de errores.
- Reintentos seguros.
- Registro de operaciones.
- Estado por imagen.
- Estado por subproducto.

## Botones

- Generar toda la categoría.
- Generar subproductos seleccionados.
- Generar un subproducto.
- Generar nuevas variaciones.
- Reintentar fallidos.
- Cancelar pendientes.

## Progreso

Mostrar:

- Total.
- Completadas.
- Pendientes.
- Procesando.
- Fallidas.
- Canceladas.
- Porcentaje.
- Costo estimado.
- Costo registrado.

La generación autorizada debe poder continuar cuando el navegador se cierre.

No depender de mantener encendida la computadora del usuario.

---

# 27. GALERÍA DE VARIACIONES

Al abrir un subproducto quiero visualizar directamente sus afiches.

Ejemplo:

**INOCUIDAD ALIMENTARIA**

10 imágenes generadas.

Cada miniatura tendrá:

- Vista previa.
- Número.
- Formato.
- Estado.
- Seleccionar.
- Favorito.
- Ajustar.
- Editar con IA.
- Regenerar.
- Descargar.
- Guardar.
- Eliminar.

## Galería

Permitir:

- Visualizar imágenes grandes.
- Navegar entre imágenes.
- Comparar resultados.
- Marcar favoritas.
- Aprobar.
- Rechazar.
- Seleccionar varias.

## Acciones masivas

- Descargar seleccionadas.
- Descargar todas.
- Guardar seleccionadas.
- Regenerar seleccionadas.
- Eliminar seleccionadas.

No mezclar imágenes de distintos subproductos en la galería individual.

---

# 28. EDICIÓN MANUAL BÁSICA

No quiero un editor complejo como Canva.

Quiero solamente ajustes rápidos.

## Funciones

Cuando existan elementos independientes:

- Mover textos.
- Reducir textos.
- Agrandar textos.
- Corregir contenido.
- Cambiar color de texto.
- Cambiar fuente.
- Mover logos.
- Agrandar logos.
- Reducir logos.
- Ajustar fotografías independientes mediante posición o escala.
- Alinear elementos.
- Deshacer.
- Rehacer.
- Restaurar versión original.
- Guardar versión modificada.

## Ejemplo

El precio quedó demasiado grande.

Selecciono el precio.

Lo reduzco con el mouse.

Lo muevo.

Guardo.

No debe utilizar IA.

## Restricción

No desarrollar herramientas complejas de edición fotográfica.

No necesito reemplazar fotografías manualmente mediante un editor avanzado.

Para cambios creativos utilizaré Editar con IA.

## Limitación técnica

Si una imagen está completamente aplanada, no afirmar que todos sus objetos son editables.

Los elementos independientes solamente existirán cuando el sistema los haya conservado como tales.

El modo predeterminado deberá favorecer composiciones que permitan corregir títulos, precios y logos fácilmente, siempre que se mantenga una buena calidad visual.

---

# 29. EDICIÓN MEDIANTE IA

Cada variación tendrá:

**Editar con IA**

Debe permitir escribir un prompt y adjuntar archivos.

Ejemplo:

"Cambia la fotografía por un laboratorio de control alimentario".

Otros ejemplos:

- Cambia la paleta.
- Hazlo más institucional.
- Modifica la composición.
- Utiliza otro fondo.
- Cambia la fotografía.
- Genera una versión más elegante.

Registrar:

- Prompt.
- Adjuntos.
- Usuario.
- Modelo.
- Costo.
- Resultado.
- Nueva versión.

No regenerar todo el subproducto cuando solamente se solicita editar una imagen.

---

# 30. REGENERACIÓN SELECTIVA

Permitir regenerar:

- Una variación.
- Variaciones seleccionadas.
- Variaciones rechazadas.
- Variaciones fallidas.

Opciones:

- Mantener estilo.
- Cambiar estilo.
- Mantener formato.
- Cambiar formato.
- Generar alternativa diferente.
- Utilizar prompt adicional.

No sobrescribir imágenes originales guardadas sin autorización.

Registrar las nuevas versiones.

---

# 31. DESCARGAS

Implementar:

- JPG.
- PNG.
- ZIP.

Permitir descargar:

- Una variación.
- Variaciones seleccionadas.
- Todas las de un subproducto.
- Todas las de una categoría.
- Todas las disponibles de un proyecto.

Cada afiche debe ser un archivo independiente.

No crear un collage para entregar múltiples resultados.

## Nombres

Utilizar nombres organizados.

Ejemplo:

CNN_Inocuidad_Alimentaria_01.png

CNN_Inocuidad_Alimentaria_02.png

CNN_Tratamiento_Aguas_01.png

Las descargas de categorías y proyectos podrán organizarse mediante carpetas dentro de ZIP.

---

# 32. ALMACENAMIENTO TEMPORAL POR DEFECTO

No quiero conservar permanentemente todas las imágenes generadas.

## Funcionamiento

Las imágenes se almacenarán temporalmente mientras se procesan y mientras estén disponibles para revisión y descarga.

Valor inicial sugerido:

48 horas.

El owner podrá modificarlo.

## Opciones

- Generar y descargar.
- Guardar imágenes seleccionadas.
- Guardar todas.
- No guardar permanentemente.

## Guardado permanente

Solamente cuando el usuario lo solicite.

Botón:

**Guardar en biblioteca**

## Datos que sí deben persistir

- Cuentas.
- Proyectos.
- Categorías.
- Subproductos.
- Prompts.
- Configuraciones.
- Permisos.
- Historial.
- Consumos.
- Auditorías.
- Metadatos de generación.

La eliminación de archivos originales no debe eliminar automáticamente los registros administrativos.

---

# 33. BIBLIOTECA OPCIONAL

Permitir guardar las imágenes que el usuario elija.

Funciones:

- Crear carpetas.
- Crear subcarpetas.
- Renombrar.
- Mover.
- Buscar.
- Filtrar.
- Descargar.
- Compartir.
- Eliminar.
- Restaurar.

La biblioteca será independiente de la galería temporal.

No obligar a guardar todas las imágenes de una generación.

---

# 34. LOGIN Y REGISTRO DE USUARIOS

Implementar:

- Login.
- Registro.
- Recuperación de contraseña.
- Cierre de sesión.
- Sesiones seguras.
- Aprobación de usuarios.
- Suspensión.
- Reactivación.

Los usuarios nuevos no podrán utilizar la plataforma hasta recibir aprobación.

Estados:

- Pendiente.
- Aprobado.
- Rechazado.
- Suspendido.
- Desactivado.

---

# 35. ROL OWNER

El owner será la máxima autoridad.

## Permisos

- Crear usuarios.
- Aprobar usuarios.
- Editar usuarios.
- Suspender usuarios.
- Eliminar usuarios.
- Crear administradores.
- Editar administradores.
- Eliminar administradores.
- Crear otros owners.
- Gestionar owners con controles de seguridad.
- Cambiar roles.
- Administrar proyectos.
- Administrar categorías.
- Administrar subproductos.
- Administrar imágenes.
- Configurar proveedores de IA.
- Configurar claves.
- Configurar presupuestos.
- Configurar límites.
- Ver estadísticas.
- Consultar auditorías.
- Administrar bibliotecas.
- Recuperar proyectos eliminados cuando sea posible.
- Definir políticas de eliminación.

## Acceso global

Todos los owners tendrán acceso automático a los proyectos, categorías, subproductos e imágenes disponibles de todos los usuarios.

Este acceso no dependerá de invitaciones.

Nunca permitir eliminar al último owner activo.

La cuenta owner inicial se establecerá mediante un proceso de inicialización seguro.

No crear credenciales públicas predeterminadas.

---

# 36. ROL ADMINISTRADOR

El administrador podrá:

- Aprobar registros.
- Crear usuarios normales.
- Modificar usuarios normales.
- Suspender usuarios normales.
- Eliminar usuarios normales.
- Crear proyectos.
- Crear categorías.
- Crear subproductos.
- Generar imágenes.
- Descargar imágenes.
- Supervisar usuarios autorizados.
- Consultar consumos dentro de su ámbito.
- Administrar recursos autorizados.

No podrá:

- Crear owners.
- Eliminar owners.
- Modificar owners.
- Crear administradores.
- Eliminar administradores.
- Cambiar roles administrativos.
- Modificar claves API.
- Modificar presupuestos globales.
- Eliminar auditorías.

## Supervisión

Los proyectos creados por usuarios normales serán visibles automáticamente para los administradores, según las políticas de supervisión.

Los administradores no tendrán acceso automático a proyectos privados de otros administradores ni de owners.

---

# 37. ROL USUARIO

El usuario normal podrá:

- Crear proyectos.
- Crear categorías.
- Crear subproductos.
- Configurar prompts.
- Adjuntar documentos.
- Generar imágenes.
- Editar imágenes.
- Descargar.
- Guardar configuraciones.
- Consultar su historial.
- Compartir proyectos cuando esté autorizado.

No podrá:

- Administrar cuentas.
- Aprobar usuarios.
- Cambiar roles.
- Modificar presupuestos.
- Acceder a claves.
- Eliminar registros de auditoría.
- Ver proyectos ajenos no compartidos.

Los permisos deben validarse desde el backend.

---

# 38. COMPARTICIÓN DESDE EL PROYECTO

La compartición principal debe estar en el proyecto.

Ejemplo:

Proyecto:

Cursos y Diplomados.

El usuario autorizado podrá compartirlo con:

- Usuarios específicos.
- Administradores.
- Todos los usuarios autorizados.
- Nadie adicional.

Los usuarios con acceso al proyecto podrán acceder a sus categorías, subproductos y variaciones según los permisos concedidos.

## Permisos

- Ver.
- Generar.
- Editar.
- Descargar.
- Administrar, cuando esté autorizado.

## Compartición granular

Como opción avanzada, permitir compartir:

- Una categoría.
- Un subproducto.
- Una variación.

No permitir que una compartición limitada conceda acceso a otros recursos privados.

## Permisos obligatorios

Los owners siempre conservarán acceso global.

Los administradores conservarán sus permisos obligatorios de supervisión sobre usuarios normales.

No permitir desactivar estos accesos mediante configuraciones particulares.

---

# 39. ELIMINACIÓN DE PROYECTOS SIN PERDER HISTORIAL

Este requisito es importante para controlar el uso de los trabajadores.

Quiero permitir que los usuarios puedan organizar y eliminar sus proyectos, pero sin perder la información administrativa.

## Regla principal

**Eliminar un proyecto desde una cuenta normal no debe borrar automáticamente su historial de auditoría.**

## Política recomendada

El owner podrá configurar:

**Permitir que los usuarios envíen sus propios proyectos a la papelera: Sí/No.**

Valor inicial:

Sí, mediante eliminación lógica.

## Eliminación lógica

Cuando un usuario creador elimine un proyecto:

1. El proyecto desaparece de su lista activa.
2. Pasa a papelera.
3. Se registra quién lo eliminó.
4. Se registra cuándo ocurrió.
5. Se conserva un registro administrativo.
6. Se mantiene la relación histórica con sus categorías, subproductos y generaciones.
7. El owner puede consultar la operación.
8. El owner puede restaurarlo mientras los datos necesarios sigan disponibles.

No permitir que el usuario normal borre directamente la auditoría.

## Papelera

Período inicial para restauración operativa:

24 horas.

Después de ese plazo, podrán eliminarse los archivos correspondientes conforme a las políticas de conservación y referencias existentes.

## Supervisión del owner

El owner podrá consultar:

- Proyecto eliminado.
- Usuario creador.
- Fecha de creación.
- Fecha de eliminación.
- Categorías.
- Subproductos.
- Prompts utilizados.
- Cantidad de imágenes.
- Modelos.
- Costos.
- Operaciones realizadas.

## Auditoría visual

Para reducir el riesgo de que los usuarios generen imágenes ajenas al trabajo y después eliminen todo, implementar miniaturas administrativas comprimidas.

El owner podrá establecer una política de conservación independiente de los originales.

Por ejemplo:

- 30 días.
- 90 días.
- 365 días.
- Retención personalizada permitida.

Recomendación inicial:

Conservar miniaturas administrativas durante 30 días, sujetas a una política de privacidad y almacenamiento claramente informada.

Los originales temporales podrán expirar a las 48 horas, mientras las miniaturas de auditoría siguen su propia política.

## Importante

No confundir:

- Eliminar proyecto de la vista del usuario.
- Eliminar archivos originales.
- Eliminar miniaturas.
- Eliminar metadatos.
- Eliminar registros de auditoría.

Son operaciones diferentes.

La eliminación definitiva de datos deberá cumplir las políticas de privacidad y retención aplicables.

El owner podrá gestionar estas políticas, pero la eliminación de un proyecto no debe servir para ocultar operaciones realizadas.

Los eventos críticos de auditoría deberán estar protegidos contra modificaciones por usuarios normales y administradores.

---

# 40. HISTORIAL ADMINISTRATIVO

Implementar un historial persistente.

Registrar:

- Usuario.
- Proyecto.
- Categoría.
- Subproducto.
- Prompt de generación.
- Archivos referenciados.
- Fecha.
- Cantidad de variaciones.
- Modelo utilizado.
- Costo.
- Estado.
- Descargas.
- Ediciones.
- Regeneraciones.
- Eliminaciones.

## Consultas

Permitir filtrar por:

- Usuario.
- Proyecto.
- Categoría.
- Subproducto.
- Fecha.
- Tipo de operación.
- Modelo.
- Consumo.

## Historial visual

Mostrar las miniaturas disponibles cuando exista autorización y no hayan caducado.

Si un archivo ya fue eliminado físicamente, indicarlo.

No mostrar recursos ficticios.

---

# 41. CONTROL DE CONSUMO

El owner necesita supervisar los gastos.

Crear paneles para:

- Consumo diario.
- Consumo mensual.
- Consumo por usuario.
- Consumo por proyecto.
- Consumo por categoría.
- Consumo por subproducto.
- Consumo por modelo.
- Costo promedio por imagen.
- Costo promedio por imagen aprobada.
- Operaciones facturables.

## Límites

Permitir configurar:

- Presupuesto por usuario.
- Presupuesto por día.
- Presupuesto por mes.
- Presupuesto por operación.
- Cantidad máxima de generaciones.
- Procesos simultáneos.
- Modelos permitidos.
- Resoluciones autorizadas.
- Acceso a modelos premium.

## Protección

El backend debe verificar los límites antes de ejecutar llamadas facturables.

Una solicitud no autorizada no debe consumir presupuesto.

Aplicar reservas de presupuesto o mecanismos de control equivalentes para gestionar operaciones simultáneas.

---

# 42. OPTIMIZACIÓN DE COSTOS

Priorizar:

- Reutilización de instrucciones.
- Procesamiento por lotes.
- Modelos económicos para planificación.
- Generación de imágenes solamente cuando corresponda.
- Reutilización de fotografías.
- Composición programática de textos.
- Ajustes manuales sin IA.
- Reintentos controlados.
- Prevención de llamadas duplicadas.
- Caché seguro cuando resulte apropiado.
- Procesamiento documental eficiente.

No asumir que una suscripción a ChatGPT cubre el consumo de la API.

No inventar tarifas.

Los precios deben ser configurables y actualizables.

---

# 43. CONTROL DE CALIDAD

Implementar validaciones automáticas cuando sea técnicamente posible.

Detectar:

- Textos cortados.
- Elementos fuera de márgenes.
- Superposiciones.
- Logos deformados.
- Resolución incorrecta.
- Errores evidentes de composición.
- Información comercial contradictoria.
- Precios incompatibles entre instrucciones.
- Elementos que no correspondan al tema.
- Falta de imágenes obligatorias.
- Falta de textos obligatorios.

Los títulos, precios y promociones deben utilizar información autorizada.

Preferir renderización exacta de texto cuando se utilice composición editable.

No enviar solicitudes costosas de revisión visual cuando una validación convencional sea suficiente.

---

# 44. CONFIGURACIONES GUARDADAS

Permitir conservar configuraciones para reutilizarlas.

Ejemplos:

- Diplomados Institucionales.
- Publicidad Facebook.
- Publicidad Minimalista.
- Afiches Empresariales.
- Publicidad Comercial.
- Afiches solo Texto.
- Afiches con Fotografías.
- Campañas Universitarias.

Guardar:

- Prompt.
- Adjuntos reutilizables.
- Estilos.
- Formatos.
- Cantidad.
- Distribución.
- Preferencias de generación.
- Recursos autorizados.

## Acciones

- Guardar.
- Duplicar.
- Aplicar.
- Actualizar.
- Compartir cuando corresponda.
- Eliminar.

Las configuraciones pueden ser:

- Personales.
- Compartidas.
- Oficiales de la empresa.

El owner administrará las configuraciones oficiales.

No obligar a utilizar una plantilla antes de generar.

---

# 45. DISEÑO UX/UI GENERAL

Quiero una plataforma empresarial premium, sencilla y muy rápida de utilizar.

## Principios

- Interfaz limpia.
- Fondo claro.
- Tipografía moderna.
- Excelente jerarquía visual.
- Botones comprensibles.
- Componentes reutilizables.
- Formularios compactos.
- Búsqueda integrada.
- Navegación intuitiva.
- Buena visualización de imágenes.
- Menús sin saturación.
- Diseño responsive.
- Accesibilidad básica.

## Menú recomendado

- Inicio.
- Proyectos.
- Compartidos conmigo.
- Historial.
- Biblioteca.
- Configuraciones guardadas.
- Identidades de marca.
- Papelera.
- Usuarios.
- Consumo de IA.
- Configuración.

Las opciones administrativas dependerán del rol.

## Experiencia principal

Pantalla 1:

Proyectos.

Pantalla 2:

Categorías.

Pantalla 3:

Subproductos, con configuración desplegable.

Pantalla 4:

Variaciones generadas.

No crear pantallas adicionales innecesarias.

## Formularios

Reservar los formularios extensos para opciones avanzadas.

No obligar al usuario a navegar por múltiples ventanas para realizar una generación.

---

# 46. ARQUITECTURA TÉCNICA RECOMENDADA

Si el repositorio está vacío, utilizar tecnologías estables y mantenidas.

## Frontend

- Next.js con App Router.
- TypeScript.
- Tailwind CSS.
- shadcn/ui.
- Componentes responsive.

## Backend

- API segura en TypeScript.
- Validación de entradas.
- Servicios desacoplados.
- Autorización por recurso.
- Manejo de errores.

## Base de datos

- PostgreSQL.
- Prisma ORM o alternativa justificada.
- Migraciones versionadas.

## Autenticación

Utilizar una solución segura y mantenida compatible con roles, sesiones protegidas y aprobaciones.

## Procesamiento masivo

- Redis.
- BullMQ o equivalente.
- Workers.
- Colas persistentes.
- Reintentos.
- Control de concurrencia.

## IA

- API oficial de OpenAI.
- Adaptadores de proveedores.
- Modelos configurables.
- Gestión de claves segura.
- Control de costos.
- Generación y edición.

## Renderización

- Sharp.
- SVG.
- Motor de composición.
- Librería ligera para manipular objetos independientes cuando sea necesario.

No desarrollar un editor gráfico complejo.

## Almacenamiento

- Almacenamiento temporal.
- Almacenamiento compatible con S3 para guardados permanentes, cuando se configure.
- URLs protegidas.
- Limpieza programada.
- Políticas de retención.

## Infraestructura

Preparar para despliegue cloud.

La aplicación debe funcionar sin mantener encendida la computadora del usuario.

Priorizar una infraestructura razonable en costos.

No contratar servicios externos sin autorización.

---

# 47. MODELO DE DATOS

Diseñar una base de datos normalizada.

Entidades mínimas:

- Users.
- Roles.
- RegistrationRequests.
- Sessions.
- Projects.
- ProjectPrompts.
- ProjectAttachments.
- ProjectMembers.
- ProductCategories.
- CategoryPrompts.
- CategoryAttachments.
- Subproducts.
- SubproductPrompts.
- SubproductAttachments.
- VariationConfigurations.
- Variations.
- ImageAssets.
- ImageVersions.
- DesignDocuments.
- GenerationPlans.
- GenerationBatches.
- GenerationJobs.
- BrandKits.
- SavedPresets.
- Templates.
- Shares.
- Favorites.
- Folders.
- FolderItems.
- UsageLedger.
- BudgetLimits.
- AuditEvents.
- AuditThumbnails.
- TrashItems.
- ProviderConfigurations.

## Relaciones

Un proyecto puede tener muchas categorías.

Una categoría pertenece a un proyecto.

Una categoría puede tener muchos subproductos.

Un subproducto pertenece a una categoría.

Un subproducto puede tener muchas variaciones.

Una variación pertenece a un subproducto.

Una variación puede tener varias versiones.

## Configuraciones

Guardar instrucciones por nivel.

Permitir herencia.

Guardar snapshots de generación para conservar el contexto histórico.

## Eliminación

Implementar eliminación lógica para proyectos y registros que deban conservarse.

Eliminar físicamente archivos solamente cuando corresponda a su política de retención.

No permitir que los usuarios normales alteren registros administrativos.

---

# 48. SEGURIDAD Y PRIVACIDAD

Implementar:

- Autenticación segura.
- Hash de contraseñas.
- Protección de sesiones.
- Autorización en backend.
- Permisos por recurso.
- Protección contra escalamiento de privilegios.
- Validación de archivos.
- Límites de tamaño.
- Protección contra inyección.
- Protección contra XSS.
- Protección contra CSRF cuando corresponda.
- Rate limiting.
- Gestión segura de API keys.
- URLs privadas y temporales.
- Auditoría.
- Control de presupuestos.
- Backups documentados.
- Eliminación segura.
- Protección de cuentas owner.

Los archivos adjuntos pueden contener instrucciones externas no confiables.

No permitir que instrucciones dentro de un PDF o imagen modifiquen roles, presupuestos o controles administrativos.

---

# 49. CASO DE USO PRINCIPAL QUE DEBES PROBAR

Implementa este flujo completo.

## Paso 1

Ingreso como owner.

La plataforma muestra el proyecto:

Cursos y Diplomados.

## Paso 2

Creo una categoría:

Afiches Perú.

## Paso 3

Escribo su prompt general:

"Todos los afiches son para Cámara Nacional de Negocios en Perú. Pago único de S/90. Mostrar Mensualidades Gratis de forma destacada. Precio pequeño. Diseños institucionales y profesionales. Utilizar los logos autorizados que adjunté".

Adjunto los logos.

## Paso 4

Configuro:

10 variaciones por subproducto.

Distribución:

- 3 Texto.
- 7 Imagen + Texto.

Formato:

1:1.

Estilo:

Institucional, con composiciones variadas.

## Paso 5

Presiono:

Agregar varios subproductos.

Selecciono:

12.

El sistema genera doce espacios.

## Paso 6

Escribo los nombres:

1. Inocuidad Alimentaria.
2. Tratamiento de Aguas.
3. Psicología Forense.
4. Monitoreo Ambiental.
5. Recursos Humanos.
6. Ingeniería Sanitaria.
7. Logística Empresarial.
8. Gestión Ambiental.
9. Seguridad Industrial.
10. Mecatrónica Industrial.
11. Nutrición y Dietética.
12. Psicología Deportiva.

## Paso 7

Todos los subproductos heredan la configuración.

No necesito escribir doce prompts.

## Paso 8

Despliego Tratamiento de Aguas.

Escribo:

"Este diplomado será para Ecuador, precio USD 40. Mantener el estilo general, pero excluir cualquier logo exclusivo de Perú".

La configuración efectiva debe aplicar esa excepción.

## Paso 9

Contraigo el subproducto.

Visualizo los doce ordenados.

## Paso 10

Presiono:

Generar todas las variaciones.

La plataforma calcula:

12 subproductos × 10 variaciones.

Total:

120 afiches.

## Paso 11

Valida presupuesto y permisos.

Inicia la generación.

## Paso 12

Abro Inocuidad Alimentaria.

Veo diez afiches independientes.

## Paso 13

Abro un afiche.

El precio se ve muy grande.

Lo reduzco manualmente si es una capa editable.

No utilizo IA.

## Paso 14

Otro afiche tiene una fotografía que no me gusta.

Presiono Editar con IA.

Solicito otra escena.

## Paso 15

Selecciono seis imágenes.

Las descargo.

## Paso 16

Decido no guardarlas permanentemente.

Quedan sujetas al período temporal.

## Paso 17

El owner consulta el historial completo.

## Paso 18

El usuario creador elimina otro proyecto que utilizó anteriormente.

El proyecto pasa a papelera.

El owner conserva el registro de las operaciones y los recursos de auditoría sujetos a su política de retención.

## Paso 19

Creo un nuevo proyecto:

Productos Comerciales.

Escribo un prompt completamente distinto.

Genero afiches de cortinas y zapatillas.

La plataforma funciona sin utilizar instrucciones educativas.

**Todo este escenario debe funcionar de extremo a extremo.**

---

# 50. PRUEBAS FUNCIONALES OBLIGATORIAS

Probar:

1. Creación del owner inicial.
2. Login.
3. Registro y aprobación.
4. Roles.
5. Proyecto inicial.
6. Creación de otros proyectos.
7. Edición de prompts.
8. Adjuntos en proyectos.
9. Creación de categorías.
10. Adjuntos en categorías.
11. Creación de 1 a 20 subproductos.
12. Formularios desplegables.
13. Adjuntos en subproductos.
14. Herencia de prompts.
15. Excepciones particulares.
16. Resolución de instrucciones contradictorias.
17. Selector 1 a 12 variaciones.
18. Distribución por modalidades.
19. Búsqueda en selectores.
20. Generación real con IA.
21. Generación masiva.
22. Colas y reintentos.
23. Galerías.
24. Edición manual.
25. Edición mediante IA.
26. Regeneración.
27. Descargas.
28. Guardado opcional.
29. Eliminación de temporales.
30. Papelera.
31. Eliminación lógica de proyectos.
32. Conservación de auditoría.
33. Control de costos.
34. Compartición.
35. Protección del owner.
36. Seguridad de recursos.
37. Recuperación de operaciones tras cerrar el navegador.

No considerar una función terminada porque existe visualmente.

Las pruebas deben verificar su comportamiento real.

---

# 51. DESARROLLO POR FASES

Quiero obtener una plataforma funcional sin alargar innecesariamente el desarrollo.

## FASE 1 — ESTRUCTURA FUNDAMENTAL

- Configuración inicial.
- Frontend.
- Backend.
- Base de datos.
- Login.
- Roles.
- Proyecto precargado Cursos y Diplomados.
- Creación de proyectos.
- Categorías.
- Subproductos.
- Prompts.
- Adjuntos.
- Herencia.
- Formularios desplegables.

## FASE 2 — GENERACIÓN REAL CON IA

Esta fase es prioritaria.

- Integración inicial con OpenAI.
- Configuración segura.
- Construcción de prompts efectivos.
- Generación real.
- Variaciones.
- Galería.
- Descarga.
- Registro de costos.

Al terminar esta fase debe existir un flujo real de generación utilizando credenciales válidas.

## FASE 3 — PRODUCCIÓN MASIVA

- Creación masiva de subproductos.
- Distribución.
- Formatos.
- Estilos.
- Colas.
- Workers.
- Concurrencia.
- Progreso.
- Reintentos.

## FASE 4 — CALIDAD Y EDICIÓN

- Dirección creativa.
- Mejoras de composición.
- Textos exactos.
- Elementos independientes.
- Ajustes manuales básicos.
- Edición con IA.
- Historial de versiones.

## FASE 5 — PRODUCTIVIDAD

- Configuraciones guardadas.
- Descargas ZIP.
- Favoritos.
- Selección masiva.
- Biblioteca.
- Temporales.
- Papelera.
- Historial.

## FASE 6 — ADMINISTRACIÓN

- Compartición.
- Gestión de usuarios.
- Supervisión.
- Auditoría.
- Presupuestos.
- Estadísticas.
- Eliminación lógica de proyectos.

## FASE 7 — PREPARACIÓN PARA PRODUCCIÓN

- Seguridad.
- Pruebas.
- Rendimiento.
- Corrección de errores.
- Documentación.
- Preparación para despliegue.

Evita desarrollar funciones secundarias complejas antes de validar el generador real.

---

# 52. DOCUMENTACIÓN

Crear:

- README.md.
- AGENTS.md.
- ARCHITECTURE.md.
- DATABASE.md.
- DEPLOYMENT.md.
- IMPLEMENTATION_PLAN.md.
- PROGRESS.md.
- TESTING.md.
- .env.example.

Mantener registro de:

- Funcionalidades terminadas.
- Funcionalidades parcialmente implementadas.
- Funcionalidades pendientes.
- Pruebas ejecutadas.
- Dependencias externas.
- Decisiones técnicas importantes.

No declarar terminadas funciones no probadas.

---

# 53. REGLAS FINALES OBLIGATORIAS

Debes respetar las siguientes decisiones:

1. La plataforma será multiproyecto y multipropósito.
2. Cursos y Diplomados debe existir desde la instalación inicial.
3. Ese proyecto tendrá su prompt publicitario precargado.
4. Otros proyectos podrán tener comportamientos completamente diferentes.
5. La jerarquía será Proyecto → Categoría → Subproducto → Variaciones.
6. Los prompts serán configurables en todos los niveles.
7. Todos los prompts admitirán adjuntos.
8. No habrá campos obligatorios ni desplegables específicos para país, precio o moneda.
9. Las condiciones comerciales podrán escribirse mediante lenguaje natural.
10. Las configuraciones se heredarán.
11. Los subproductos podrán tener excepciones.
12. Los formularios de subproductos serán compactos y desplegables.
13. Podrán crearse entre 1 y 20 espacios por operación.
14. La cantidad de variaciones será seleccionable de 1 a 12 por solicitud.
15. El usuario podrá distribuir las modalidades.
16. Texto podrá incluir logos como imágenes.
17. Imagen + Texto utilizará fotografías relevantes al tema.
18. Los selectores con múltiples opciones tendrán búsqueda.
19. No se utilizará IA para tareas convencionales innecesarias.
20. No se desarrollará un clon de Canva.
21. La IA será la herramienta central de generación.
22. La edición manual será sencilla.
23. La edición creativa se realizará mediante IA.
24. Las imágenes serán individuales.
25. Las descargas masivas utilizarán archivos independientes.
26. El almacenamiento permanente será opcional.
27. El historial administrativo será persistente.
28. Los usuarios podrán enviar proyectos propios a papelera si el owner lo permite.
29. Los usuarios no podrán borrar auditorías.
30. El owner tendrá acceso global obligatorio.
31. Los administradores podrán gestionar usuarios normales.
32. Solamente el owner podrá crear y administrar administradores.
33. Existirán presupuestos y límites.
34. La plataforma funcionará con procesamiento en servidor.
35. No se realizarán gastos externos sin autorización.
36. No se inventarán credenciales, modelos, costos ni resultados.
37. El software debe ser funcional y verificable.

---

# 54. INSTRUCCIÓN FINAL DE EJECUCIÓN

**CODEX: ESTE DOCUMENTO ES LA ESPECIFICACIÓN MAESTRA DEL SOFTWARE QUE DEBES CONSTRUIR.**

No quiero una propuesta teórica.

No quiero un conjunto de diseños estáticos.

No quiero un prototipo que solamente simule la creación de imágenes.

Quiero una plataforma web funcional.

El objetivo principal es que una persona pueda crear un proyecto, definir una categoría, escribir rápidamente 10, 12, 15 o 20 temas y generar numerosas imágenes publicitarias profesionales para cada uno.

Las instrucciones generales deben reutilizarse.

Las configuraciones particulares deben ser opcionales.

Las imágenes deben estar organizadas.

Los resultados deben poder descargarse.

El usuario debe poder realizar ajustes manuales básicos.

La plataforma debe permitir edición con IA.

Debe tener supervisión administrativa y control de gastos.

El proyecto Cursos y Diplomados debe estar disponible desde la instalación inicial con las especificaciones de Cámara Nacional de Negocios.

Los demás proyectos deben poder utilizarse libremente en diferentes sectores.

## Procedimiento inmediato

1. Examina el repositorio de GitHub conectado.
2. Identifica su estado.
3. Define una arquitectura sencilla y mantenible.
4. Conserva estos requisitos en un plan de implementación verificable.
5. Comienza a programar la estructura.
6. Implementa proyectos, categorías, subproductos y herencia.
7. Construye la primera integración real de generación mediante IA.
8. Verifica que pueda generar y descargar imágenes.
9. Continúa con generación masiva.
10. Implementa las demás funcionalidades siguiendo las prioridades.
11. Ejecuta pruebas.
12. Corrige errores.
13. Documenta el progreso.
14. Prepara el despliegue.

No contrates servicios de pago ni ejecutes operaciones facturables sin autorización.

No inventes credenciales.

Si faltan claves externas, implementa las interfaces y un modo de prueba claramente identificado, sin fingir que las imágenes de demostración provienen de una generación real.

**NO TE DETENGAS EN LA PLANIFICACIÓN: IMPLEMENTA EL SOFTWARE.**

**OBJETIVO FINAL: UNA FÁBRICA DE AFICHES PUBLICITARIOS MEDIANTE INTELIGENCIA ARTIFICIAL, MULTIPROYECTO, ORGANIZADA, ECONÓMICA, RÁPIDA Y SENCILLA DE UTILIZAR.**

**COMIENZA EL DESARROLLO EN EL REPOSITORIO DE GITHUB CONECTADO.**