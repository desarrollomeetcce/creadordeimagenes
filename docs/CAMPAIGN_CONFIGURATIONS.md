# Configuraciones rápidas de campañas

El presupuesto queda después del país y se conserva al aplicar configuraciones. Crear/Buscar campaña y el buscador de configuraciones comparten una fila. Elegir una configuración crea el contexto de campaña nueva sin reutilizar IDs de padres de Meta; el nombre, objetivo, número de conjuntos y ubicaciones se aplican automáticamente. La fila elegida muestra nombre y estado guardado, con Editar/Quitar; los editores quedan contraídos sin perder sus valores.

## Ámbitos

- **Campaña:** campaignName con variables, objective, adsetCount, platforms, placements, allowExcludedPlacementSpend.
- **Anuncios:** body, headline, description, multiAdvertiser, conversation opcional de WhatsApp.

No se almacenan país, presupuesto, cuenta, página, públicos, reparto, imágenes ni IDs de campañas/conjuntos existentes. Buscar una campaña existente conserva sus presupuestos/objetivo y permite reutilizar conjuntos con las validaciones previas. La distribución equitativa o personalizada se edita en Públicos y utiliza todos los recursos seleccionados sin duplicarlos.

Guardar es una acción explícita con nombre; cada ámbito tiene50 entradas por proyecto y CAS por revisión. Los JSON antiguos campaignPresets no se migran ni reescriben: el lector ofrece sus campos por separado y guardar una versión nueva es explícito. Las conversaciones guardadas aquí siguen siendo de la plataforma, sin prometer sincronización con la biblioteca de Meta.

Multianunciante está apagado por defecto. El check activa contextual_multi_ads.enroll_status=OPT_IN para nuevos creativos y se verifica por lectura antes de crear anuncios; al desmarcar se envía OPT_OUT. Las limitaciones y permisos reales de Meta se conservan, junto con confirmación, cuotas, protección de operaciones inciertas y activación final separada. Guardar/aplicar configuraciones no publica ni consume IA.
