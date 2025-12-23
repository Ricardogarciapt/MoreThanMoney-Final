# 🔧 **CORREÇÃO: ERROS AO PUBLICAR POSTS E ANEXOS**

## 🔍 **PROBLEMA IDENTIFICADO**

O erro ocorre porque:
1. ❌ Tabela `posts` pode não existir no Supabase
2. ❌ Bucket `uploads` pode não existir no Storage
3. ❌ Políticas RLS podem não estar configuradas
4. ❌ Erros não estão a ser reportados corretamente

---

## ✅ **SOLUÇÃO RÁPIDA**

### **PASSO 1: DIAGNÓSTICO**

Execute este script no Supabase SQL Editor para verificar o estado:

```sql
-- Copiar e executar:
scripts/diagnostico-posts-supabase.sql
```

**Link direto:** https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/sql/new

---

### **PASSO 2: CORRIGIR TUDO DE UMA VEZ**

Execute este script para criar/corrigir tudo:

```sql
-- Copiar e executar TODO o conteúdo de:
scripts/fix-posts-storage-completo.sql
```

**O que este script faz:**
- ✅ Cria tabela `posts` (se não existir)
- ✅ Cria tabela `post_likes` (se não existir)
- ✅ Configura RLS policies
- ✅ Cria bucket `uploads` (se não existir)
- ✅ Configura políticas de Storage
- ✅ Verifica tudo no final

---

## 🔧 **CORREÇÕES NO CÓDIGO**

### **1. Mensagens de Erro Melhoradas**

O código agora mostra mensagens específicas:

**Erro de Tabela:**
```
❌ Erro: Tabela "posts" não existe no Supabase.
📋 SOLUÇÃO:
1. Executa: scripts/fix-posts-storage-completo.sql
```

**Erro de Bucket:**
```
❌ Erro: Bucket "uploads" não existe no Supabase Storage.
📋 SOLUÇÃO:
1. Executa: scripts/fix-posts-storage-completo.sql
```

**Erro de Permissão:**
```
❌ Erro: Sem permissão para criar posts.
📋 SOLUÇÃO:
1. Verifica se és VIP ou Admin
2. Executa: scripts/fix-posts-storage-completo.sql
```

---

## 📋 **VERIFICAÇÃO MANUAL (OPCIONAL)**

### **Verificar Tabela Posts:**
```sql
SELECT * FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'posts';
```

### **Verificar Bucket Uploads:**
```sql
SELECT * FROM storage.buckets WHERE id = 'uploads';
```

Ou via Dashboard:
https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/storage/buckets

### **Verificar RLS:**
```sql
SELECT * FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'posts';
```

---

## 🎯 **CHECKLIST DE RESOLUÇÃO**

- [ ] Executar `scripts/diagnostico-posts-supabase.sql` (verificar estado)
- [ ] Executar `scripts/fix-posts-storage-completo.sql` (corrigir tudo)
- [ ] Verificar bucket `uploads` existe e é público
- [ ] Verificar políticas RLS estão ativas
- [ ] Testar criação de post sem anexo
- [ ] Testar criação de post com anexo
- [ ] Verificar console do browser para erros específicos

---

## 🔄 **DEPLOY DAS CORREÇÕES**

As correções no código já foram commitadas. Após executar o SQL:

1. ✅ **Código corrigido** (mensagens de erro melhoradas)
2. ⏳ **Aguardar deploy** automático no Vercel
3. ✅ **Executar SQL** no Supabase (obrigatório)

---

## 📝 **NOTAS TÉCNICAS**

### **Schema da Tabela Posts:**
```sql
posts (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  user_name TEXT NOT NULL,
  content TEXT NOT NULL,
  media_url TEXT,
  category TEXT CHECK (...),
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

### **Storage Path:**
```
uploads/posts/{user_id}-{timestamp}.{ext}
```

### **RLS Policies Necessárias:**
- ✅ SELECT: Todos podem ver
- ✅ INSERT: Autenticados podem criar
- ✅ UPDATE: Donos podem editar
- ✅ DELETE: Donos ou Admins podem deletar

---

## ✅ **APÓS EXECUTAR SQL**

Testar novamente:
1. Criar post sem anexo → Deve funcionar
2. Criar post com anexo → Deve funcionar
3. Ver posts no feed → Deve aparecer
4. Filtrar por categoria → Deve funcionar

**Se ainda houver erro, verificar console do browser para mensagem específica!**

