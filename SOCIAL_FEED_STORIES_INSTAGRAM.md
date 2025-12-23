# 🎨 **SOCIAL FEED COM STORIES ESTILO INSTAGRAM**

## ✅ **IMPLEMENTAÇÃO COMPLETA!**

---

### **🎯 O que foi implementado:**

1. ✅ **Stories estilo Instagram** - Círculos com preview visual e animações
2. ✅ **7 Categorias** - Updates, Forex, Crypto, Mindset, Liderança, Network, Social
3. ✅ **Filtragem por categoria** - Clique no story para filtrar posts
4. ✅ **Preview visual** - Mini thumbnails das últimas imagens de cada categoria
5. ✅ **Animações suaves** - Glow, pulse, slide-in
6. ✅ **Contador de posts** - Badge mostrando quantos posts em cada categoria
7. ✅ **Upload de mídia** - Suporte para imagens e vídeos
8. ✅ **Sistema de likes** - Com sincronização em tempo real
9. ✅ **Interface moderna** - Design dourado MTM com paleta F3F3E6, D2A63C, BB8525

---

## 📋 **PRÓXIMOS PASSOS:**

### **1️⃣ Executar SQL no Supabase** (OBRIGATÓRIO)

```bash
# Aceder ao Supabase Dashboard:
https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/sql/new

# Copiar e executar o conteúdo de:
scripts/create-posts-table-with-categories.sql
```

**O que o SQL cria:**
- ✅ Tabela `posts` com categorias
- ✅ Tabela `post_likes` para likes individuais
- ✅ Tabela `post_comments` (preparada para futuro)
- ✅ Políticas RLS (Row Level Security)
- ✅ Índices para performance
- ✅ Triggers para atualização automática

---

### **2️⃣ Verificar Storage Bucket**

```bash
# No Supabase Dashboard:
# Storage → Verificar se bucket "uploads" existe

# Se não existir:
# 1. Criar bucket "uploads"
# 2. Marcar como Público
# 3. Configurar políticas de upload:
```

**Política de Storage recomendada:**

```sql
-- Permitir upload para usuários autenticados
CREATE POLICY "Users can upload posts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'uploads' AND (storage.foldername(name))[1] = 'posts');
```

---

### **3️⃣ Testar no Dev Server**

```bash
# 1. Parar servidor atual (Ctrl+C)
# 2. Reiniciar:
npm run dev

# 3. Aceder:
http://localhost:3000/app-mobile

# 4. Ir à aba "Social"
# 5. Testar:
   - ✅ Ver stories no topo
   - ✅ Criar novo post (se VIP/Admin)
   - ✅ Selecionar categoria
   - ✅ Upload de imagem
   - ✅ Dar like
   - ✅ Filtrar por categoria
```

---

## 🎨 **FUNCIONALIDADES:**

### **Stories Section:**
- 🎯 **7 círculos** com ícones das categorias
- 🖼️ **Preview visual** - Última imagem da categoria aparece no círculo
- 🔢 **Badge contador** - Mostra quantos posts em cada categoria
- ✨ **Animação glow** - Quando categoria está ativa
- 🎨 **Gradientes coloridos** - Cada categoria tem cor única

### **Create Post:**
- 📝 **Textarea** para conteúdo
- 📷 **Upload de mídia** - Imagem ou vídeo
- 🏷️ **Seleção de categoria** - Dropdown com ícones
- ✅ **Validação** - Só VIP/Admin podem postar
- 🔄 **Preview de mídia** antes de publicar

### **Feed de Posts:**
- 📱 **Cards modernos** - Design dourado MTM
- 🏷️ **Badge de categoria** - Mostra ícone e nome
- ⏰ **Time ago** - "5min", "2h", "3d"
- ❤️ **Sistema de likes** - Com animação
- 💬 **Comentários** - (preparado para futuro)
- 📤 **Partilhar** - Web Share API

### **Filtragem:**
- 🎯 **Clicar no story** - Filtra posts por categoria
- 🔄 **Clicar novamente** - Remove filtro
- 📊 **Contador** - Mostra quantos posts filtrados
- 🎨 **Badge ativo** - Mostra categoria filtrada

---

## 🐛 **DEBUGGING:**

### **Problemas comuns:**

1. **"Erro ao carregar posts"**
   ```bash
   # Verificar:
   - ✅ SQL executado no Supabase?
   - ✅ Tabela posts existe?
   - ✅ RLS configurado?
   ```

2. **"Upload falha"**
   ```bash
   # Verificar:
   - ✅ Bucket "uploads" existe?
   - ✅ Bucket está público?
   - ✅ Política de upload configurada?
   ```

3. **"Não consigo criar post"**
   ```bash
   # Verificar:
   - ✅ Usuário é VIP ou Admin?
   - ✅ Perfil carregado corretamente?
   - ✅ Console para erros?
   ```

---

## 📱 **SCREENSHOTS ESPERADOS:**

### **Topo (Stories):**
```
[🆕] [💹] [₿] [🧠] [👑] [🌐] [🤝]
Updates Forex Crypto Mindset Liderança Network Social
```

### **Criar Post:**
```
[+ Criar Nova Publicação]
ou
[Textarea]
[Adicionar Mídia] [Selecionar categoria ▼] [Publicar]
```

### **Feed:**
```
┌─────────────────────────────────┐
│ 👤 User Name        ⏰ 5min     │
│ 🆕 Updates                      │
│                                 │
│ Conteúdo do post...            │
│                                 │
│ [Imagem do post]                │
│                                 │
│ ❤️ 5  💬 2  📤                 │
└─────────────────────────────────┘
```

---

## 🚀 **DEPLOY:**

Após testar localmente:

```bash
# 1. Commit:
git add .
git commit -m "✨ Social Feed com Stories Instagram + Categorias"

# 2. Push:
git push origin main

# 3. Vercel faz deploy automático!
```

---

## 📚 **ARQUIVOS MODIFICADOS:**

1. ✅ `components/mobile/social-feed.tsx` - **COMPLETO REESCRITO**
2. ✅ `app/globals.css` - **Adicionados estilos para Stories**
3. ✅ `scripts/create-posts-table-with-categories.sql` - **NOVO**

---

## 🎉 **TUDO PRONTO!**

Sistema completo de Social Feed com Stories estilo Instagram implementado!

**Próximo:** Executar SQL e testar! 🔥
