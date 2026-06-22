-- MTM Auto provider: risco default 0.5% (antes 0.75%)
UPDATE site_settings
SET value = regexp_replace(
  value::text,
  '"lot_value"\s*:\s*0\.75',
  '"lot_value": 0.5',
  'g'
)::jsonb
WHERE key = 'mtmcopy_signal_sources'
  AND value::text LIKE '%"lot_value": 0.75%';
