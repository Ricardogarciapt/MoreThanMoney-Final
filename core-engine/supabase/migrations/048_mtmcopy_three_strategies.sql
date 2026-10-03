-- MTMcopier: 3 estratégias auditadas (Premium, Trade Ideas, Sensei)
-- site_settings.value é JSON guardado como string escalar (JSON.stringify) — não usar jsonb_set directo.

UPDATE site_settings
SET value = to_jsonb(
  jsonb_set(
    CASE
      WHEN jsonb_typeof(value) = 'string' THEN (value #>> '{}')::jsonb
      ELSE COALESCE(value, '{}'::jsonb)
    END,
    '{enabled_channels}',
    '["premium-signals","trade-ideas"]'::jsonb,
    true
  )::text
)
WHERE key = 'mtmcopy_signal_sources'
  AND jsonb_typeof(
    CASE
      WHEN jsonb_typeof(value) = 'string' THEN (value #>> '{}')::jsonb
      ELSE COALESCE(value, '{}'::jsonb)
    END
  ) = 'object'
  AND (
    (
      CASE
        WHEN jsonb_typeof(value) = 'string' THEN (value #>> '{}')::jsonb
        ELSE COALESCE(value, '{}'::jsonb)
      END
    )->'enabled_channels' IS NULL
    OR jsonb_array_length(
      COALESCE(
        (
          CASE
            WHEN jsonb_typeof(value) = 'string' THEN (value #>> '{}')::jsonb
            ELSE COALESCE(value, '{}'::jsonb)
          END
        )->'enabled_channels',
        '[]'::jsonb
      )
    ) = 0
  );
