# Estudio creativo: experiencia de Proyectos

La entrada conserva Proyecto → Producto → Subproducto → Variaciones y ofrece Crear imágenes (inicio rápido) o Nuevo proyecto. Las tarjetas tienen una portada decorativa propia; no implican que haya afiches generados. Los avisos de rol y privacidad son desplegables compactos, manteniendo la política completa disponible.

## Preparar una creación

Crear imágenes abre el formulario existente con destino proyecto/producto, tema, instrucciones y cantidad. Los botones1/3/6/9/12 modifican el mismo campo numérico; se permite cualquier entero1–12. Continuar al subproducto solo guarda la jerarquía. El tema, prompt y preferencia de muestra están a la vista. Formato, estilo, herencias, referencias, revisión y autorización usan los controles y endpoints anteriores. No cambia el motor, los modelos ni el precio de API.

## Ver afiches

Vista de afiches en un proyecto o producto monta ProjectImagePreview únicamente al abrirlo. Consume una página del endpoint autorizado /api/gallery (máximo24 registros), muestra hasta12 y reutiliza miniaturas con revisión y el visor existente. Cerrar desmonta y cancela la lectura; no genera, aprueba, mueve ni modifica archivos. Revisar en Biblioteca conserva la navegación anterior a otra pestaña. No se consulta una galería por cada tarjeta de proyecto ni hay sondeo nuevo.

Biblioteca conserva sus tamaños, filtros, acciones y permisos; las miniaturas se muestran en un marco4:5 con object-fit:contain, sin recortar originales horizontales o verticales. La vista de selección de adjuntos conserva su tamaño anterior.

## Límites

Los controles solo muestran información autorizada por las APIs existentes. El acceso Observador sigue siendo consulta/descarga; la aprobación de una imagen no concede permiso para generar. La vista no añade creación ni publicación de campañas en Meta. La calidad generativa depende del motor configurado: este cambio mejora presentación y flujo, no promete mejores resultados del proveedor.

## Validación

309 pruebas de unidad existentes, typecheck, build y8 recorridos Chromium con DB QA exclusiva, usuarios separados y6 afiches PNG determinísticos. Se interceptó la solicitud de generación sin llamar al proveedor. Se comprobaron cargos/trabajos nuevos0 y versiones/revisión originales intactas antes de limpiar exclusivamente la muestra.
