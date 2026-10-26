-- Preserve rule IDs, values, colors, pins and ordering; dates no longer limit formatting.
UPDATE "MetaEffectivenessColors" c
SET rules=(SELECT COALESCE(jsonb_agg(r.rule - 'since' - 'until' ORDER BY r.ord),'[]'::jsonb) FROM jsonb_array_elements(c.rules) WITH ORDINALITY AS r(rule,ord)), revision=revision+1
WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(c.rules) AS r(rule) WHERE r.rule ? 'since' OR r.rule ? 'until');
