# Fuentes del adaptador de OpenAI

Documentación oficial consultada el 15 de octubre de 2026:

- https://developers.openai.com/api/docs/guides/image-generation
- https://developers.openai.com/api/reference/resources/models/methods/list
- https://developers.openai.com/api/docs/guides/text

El adaptador incorpora capacidades conocidas y las intersecta con los IDs obtenidos por la cuenta. El catálogo puede evolucionar: actualizar el adaptador con la documentación al incorporar capacidades nuevas. No se enumeran modelos disponibles a una cuenta sin consultar su API.

Un resultado de GET /models solo demuestra que esa consulta fue aceptada. La prueba opcional de generación comprueba, con posible cargo, el uso de los modelos seleccionados. Ningún nombre, tarifa ni resultado de prueba se presenta como disponibilidad o generación real por defecto.
