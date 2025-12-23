-- Verificar estrutura da tabela commissions
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'commissions' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Verificar se a tabela existe
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_name = 'commissions' 
AND table_schema = 'public'; 