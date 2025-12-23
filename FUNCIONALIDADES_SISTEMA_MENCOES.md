# Sistema de Menções (@mentions) - Documentação

## 📋 Visão Geral

Sistema completo de menções de usuários no feed social, similar ao Instagram, permitindo mencionar membros em posts e comentários usando `@`.

## ✨ Funcionalidades Implementadas

### 1. Autocomplete de Menções
- **Componente**: `components/mobile/mention-input.tsx`
- **Funcionalidade**: 
  - Ao digitar `@`, aparece um dropdown com sugestões de usuários
  - Busca por nome, username ou email
  - Navegação por teclado (setas ↑↓, Enter, Tab, Escape)
  - Não mostra o próprio usuário nas sugestões
  - Suporta tanto `textarea` quanto `input` (single-line)

### 2. Renderização de Menções
- **Componente**: `components/mobile/mention-text.tsx`
- **Funcionalidade**:
  - Renderiza menções como links destacados
  - Formato: `@[Nome do Usuário](user_id)`
  - Links clicáveis que redirecionam para o perfil do membro
  - Estilo destacado com cor `#D2A63C`

### 3. Integração no Feed Social
- **Arquivo**: `components/mobile/social-feed.tsx`
- **Funcionalidades**:
  - Menções em posts (textarea de criação)
  - Menções em comentários (input de comentários)
  - Extração automática de IDs de menções
  - Armazenamento no banco de dados (coluna `mentions UUID[]`)

### 4. Notificações Push
- **Funcionalidade**:
  - Notificações automáticas para membros mencionados
  - Notificação quando mencionado em post
  - Notificação quando mencionado em comentário
  - Tag: `mention`

### 5. Banco de Dados
- **Script**: `scripts/add-mentions-system.sql`
- **Alterações**:
  - Coluna `mentions UUID[]` na tabela `posts`
  - Coluna `mentions UUID[]` na tabela `post_comments`
  - Índices GIN para busca rápida
  - Função SQL `get_user_mentions(user_id)` para buscar menções

### 6. Feed RSS Social no Site Principal
- **Componente**: `components/social-feed-rss.tsx`
- **Funcionalidade**:
  - Mostra últimos 5 posts do feed social
  - Aparece abaixo da navbar no site principal
  - **NÃO aparece** em `/app-mobile` e `/mobile`
  - Apenas para usuários autenticados
  - Link para ver tudo no app mobile

## 🎯 Como Usar

### Para Usuários

1. **Criar Post com Menção**:
   - Digite `@` no campo de texto
   - Selecione o usuário da lista de sugestões
   - Ou continue digitando para filtrar
   - Pressione Enter/Tab ou clique para confirmar

2. **Comentar com Menção**:
   - Abra os comentários de um post
   - Digite `@` no campo de comentário
   - Selecione o usuário
   - Publique o comentário

3. **Visualizar Menções**:
   - Menções aparecem como links destacados em dourado
   - Clique para ver o perfil do membro mencionado

### Para Desenvolvedores

#### Componente MentionInput

```tsx
import MentionInput from "@/components/mobile/mention-input"

<MentionInput
  value={text}
  onChange={setText}
  placeholder="Escreve algo... (usa @ para mencionar)"
  className="..."
  rows={4} // ou 1 para input single-line
  onMentionsChange={(mentions) => {
    // Array de usuários mencionados
    console.log(mentions)
  }}
/>
```

#### Componente MentionText

```tsx
import MentionText from "@/components/mobile/mention-text"

<MentionText text={post.content} />
```

#### Extrair Menções do Texto

```typescript
const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g
const mentionedUserIds: string[] = []
let match
while ((match = mentionRegex.exec(text)) !== null) {
  mentionedUserIds.push(match[2]) // user_id
}
```

## 📁 Arquivos Criados/Modificados

### Novos Arquivos
- `components/mobile/mention-input.tsx` - Componente de input com autocomplete
- `components/mobile/mention-text.tsx` - Componente de renderização de menções
- `components/social-feed-rss.tsx` - Feed RSS social para site principal
- `scripts/add-mentions-system.sql` - Script SQL para banco de dados
- `FUNCIONALIDADES_SISTEMA_MENCOES.md` - Esta documentação

### Arquivos Modificados
- `components/mobile/social-feed.tsx` - Integração de menções
- `app/layout.tsx` - Adição do SocialFeedRSS

## 🔧 Configuração do Banco de Dados

Execute o script SQL:

```sql
-- Executar: scripts/add-mentions-system.sql
```

Isso irá:
1. Adicionar coluna `mentions UUID[]` nas tabelas `posts` e `post_comments`
2. Criar índices GIN para busca rápida
3. Criar função `get_user_mentions(user_id)` para buscar menções

## 🎨 Estilo Visual

- **Cor de destaque**: `#D2A63C` (dourado MTM)
- **Hover**: `#BB8525`
- **Background**: Gradiente preto/cinza
- **Bordas**: `border-[#D2A63C]/20`

## 📱 Responsividade

- **Mobile**: Dropdown de menções adaptável
- **Desktop**: Feed RSS em grid responsivo (1-3 colunas)
- **Tablet**: Layout intermediário

## 🔒 Segurança

- Apenas usuários autenticados podem mencionar
- Validação de IDs de usuários
- RLS (Row Level Security) do Supabase aplicado
- Não permite auto-menção

## 🚀 Próximas Melhorias (Opcional)

- [ ] Busca de menções por usuário
- [ ] Página de "Menções" no perfil
- [ ] Notificações por email além de push
- [ ] Analytics de menções
- [ ] Limite de menções por post/comentário

## 📝 Notas Técnicas

- Formato de armazenamento: `@[Nome](user_id)`
- Regex de extração: `/@\[([^\]]+)\]\(([^)]+)\)/g`
- Busca de usuários: `ILIKE` case-insensitive
- Limite de sugestões: 10 usuários
- Limite de posts no RSS: 5 posts

## ✅ Status

- ✅ Autocomplete de menções
- ✅ Renderização de menções
- ✅ Integração em posts
- ✅ Integração em comentários
- ✅ Notificações push
- ✅ Banco de dados
- ✅ Feed RSS social
- ✅ Documentação

---

**Última atualização**: 2024
**Versão**: 1.0.0

