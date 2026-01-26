-- =====================================================
-- SCRIPT: Sincronizar Admin com Novas Páginas IQONIC
-- =====================================================
-- Este script adiciona as novas páginas e conteúdo ao site_content

-- 1. Verificar se a tabela existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'site_content'
  ) THEN
    RAISE EXCEPTION 'Tabela site_content não existe. Execute primeiro: supabase/admin-schema.sql';
  END IF;
END $$;

-- 2. Adicionar novas páginas IQONIC
INSERT INTO site_content (type, category, title, description, url, order_index, is_active) VALUES
-- Páginas IQONIC
('link', 'education', 'IQONIC - Apresentação', 'Página principal IQONIC com packs e tecnologia', '/iqonic', 1, true),
('link', 'education', 'IQ Sync - Swipe to Trade', 'Página do IQ Sync (execução manual)', '/swipetotrade', 2, true),
('link', 'education', 'IQ Auto - Automação', 'Página do IQ Auto (automação total)', '/automation', 3, true),
('link', 'education', 'IQ Insights', 'Link para IQ Insights', 'https://iqonic.vip/iq-insight', 4, true),
('link', 'education', 'IQ Ideias', 'Link para IQ Ideias', 'https://iqonic.vip/ideas', 5, true),
('link', 'education', 'IQ Social', 'Link para IQ Social', 'https://iqonic.vip/iq-social', 6, true),
('link', 'education', 'IQ Center (Vault)', 'Link para IQ Center/Vault', 'https://iqonic.vip/iq-vault', 7, true),
-- Vídeos relacionados
('video', 'education', 'IQ Sync - Tutorial', 'Vídeo tutorial do IQ Sync', 'https://youtu.be/TxQS2GW5NkE', 1, true),
('video', 'education', 'IQ Auto - Apresentação', 'Vídeo de apresentação do IQ Auto', 'https://youtu.be/dgd0-mLIrMw', 2, true),
-- Links de ativação
('link', 'trading', 'Ativar IQ Sync', 'Link para ativar IQ Sync', 'https://qrco.de/iqsync', 1, true),
('link', 'trading', 'Ativar IQ Auto', 'Link para ativar IQ Auto', 'https://shield.iqonic.life/news.dhtml?usepage=iqauto.html', 2, true)
ON CONFLICT DO NOTHING;

-- 3. Atualizar links existentes se necessário
UPDATE site_content 
SET 
  url = '/iqonic',
  description = 'Página principal IQONIC com packs e tecnologia'
WHERE title = 'Apresentação IQONIC' AND category = 'education';

UPDATE site_content 
SET 
  url = '/swipetotrade',
  description = 'Página do IQ Sync (execução manual)'
WHERE title LIKE '%Swipe%' OR title LIKE '%IQ Sync%';

UPDATE site_content 
SET 
  url = '/automation',
  description = 'Página do IQ Auto (automação total)'
WHERE title LIKE '%Automatização%' OR title LIKE '%IQ Auto%';

-- 4. Verificar conteúdo inserido
SELECT 
  '✅ Conteúdo sincronizado!' as status,
  category,
  COUNT(*) as total,
  COUNT(CASE WHEN is_active THEN 1 END) as ativos
FROM site_content
WHERE category IN ('education', 'trading')
GROUP BY category
ORDER BY category;

-- 5. Listar todas as entradas IQONIC
SELECT 
  id,
  type,
  category,
  title,
  url,
  is_active,
  order_index
FROM site_content
WHERE 
  title ILIKE '%IQ%' OR 
  title ILIKE '%Sync%' OR 
  title ILIKE '%Auto%' OR
  url LIKE '%iqonic%' OR
  url LIKE '%iqsync%' OR
  url LIKE '%iqauto%'
ORDER BY category, order_index;

