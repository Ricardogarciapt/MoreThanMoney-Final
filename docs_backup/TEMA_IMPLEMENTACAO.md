# Implementação do Novo Tema MoreThanMoney

## 🎨 Nova Paleta de Cores

### Cores Principais
- **Primary:** `#efb810` (Dourado principal)
- **Primary Light:** `#f9db5c` (Dourado claro)
- **Primary Dark:** `#b28405` (Dourado escuro)  
- **Primary Darker:** `#795300` (Dourado mais escuro)
- **Background:** `#000000` (Preto)
- **Background Light:** `#1a1a1a` (Preto claro)
- **Text:** `#ffffff` (Branco)
- **Text Muted:** `#a0a0a0` (Cinza)

## 📋 Classes CSS Criadas

### Cores de Fundo
- `.bg-mtm-primary` - Dourado principal
- `.bg-mtm-primary-light` - Dourado claro
- `.bg-mtm-primary-dark` - Dourado escuro
- `.bg-mtm-primary-darker` - Dourado mais escuro

### Cores de Texto
- `.text-mtm-primary` - Texto dourado
- `.text-mtm-primary-light` - Texto dourado claro
- `.text-mtm-primary-dark` - Texto dourado escuro

### Gradientes
- `.bg-gradient-mtm` - Gradiente principal
- `.bg-gradient-mtm-dark` - Gradiente escuro
- `.text-gradient-mtm` - Texto com gradiente

### Cartões
- `.card-modern` - Cartão com efeito moderno e hover
- `.card-glass` - Cartão com efeito de vidro

### Botões
- `.btn-mtm-primary` - Botão principal dourado
- `.btn-mtm-secondary` - Botão secundário outline
- `.btn-mtm-ghost` - Botão ghost translúcido

### Animações de Scroll
- `.scroll-fade-in` - Fade in ao scroll
- `.scroll-slide-up` - Slide up ao scroll
- `.scroll-slide-left` - Slide left ao scroll
- `.scroll-slide-right` - Slide right ao scroll
- `.scroll-scale-in` - Scale in ao scroll

### Delays de Animação
- `.animation-delay-100` até `.animation-delay-600`

## 🔧 Substituições Necessárias

### De (Cores Antigas) → Para (Novas Cores)

#### Texto
- `text-amber-400` → `text-mtm-primary`
- `text-amber-500` → `text-mtm-primary`
- `text-gold-400` → `text-mtm-primary-light`
- `text-gold-500` → `text-mtm-primary`

#### Fundo
- `bg-amber-500` → `bg-mtm-primary`
- `bg-amber-600` → `bg-mtm-primary-dark`
- `bg-gold-500` → `bg-mtm-primary`
- `bg-gold-600` → `bg-mtm-primary-dark`

#### Bordas
- `border-amber-500` → `border-mtm-primary`
- `border-gold-500` → `border-mtm-primary`

#### Gradientes
- `from-amber-400 to-amber-600` → `bg-gradient-mtm`
- `from-gold-400 to-gold-600` → `bg-gradient-mtm`

## 📁 Arquivos Atualizados

### Core
- ✅ `app/globals.css` - Variáveis e classes CSS
- ✅ `lib/theme-config.ts` - Configuração de temas
- ✅ `components/particle-background.tsx` - Cores atualizadas
- ✅ `components/youtube-player.tsx` - Player otimizado
- ✅ `hooks/use-scroll-animation.tsx` - Hook de animações

### Componentes
- ✅ `components/navbar.tsx` - Nova paleta aplicada
- ✅ `components/footer.tsx` - Nova paleta aplicada
- ✅ `components/admin/theme-manager.tsx` - Gestor de tema criado

### Páginas com Particle Background
- ✅ `app/new-landing/page.tsx`
- ✅ `app/iqonic/page.tsx`
- ✅ `app/scanner/page.tsx`
- ✅ `app/onboarding/page.tsx`
- ✅ `app/fast-start/page.tsx`
- ✅ `app/automation/page.tsx`
- ✅ `app/swipetotrade/page.tsx`

### Admin
- ✅ `app/admin/page.tsx` - Aba Tema adicionada
- ✅ `app/api/admin/theme/route.ts` - API de tema
- ✅ `app/layout.tsx` - Metadata e ícones

## 🎯 Temas Pré-definidos

1. **MoreThanMoney Gold** (Default) - #efb810, #f9db5c, #b28405, #795300
2. **Dark Elegance** - Roxo (#8b5cf6)
3. **Light Professional** - Azul (#2563eb)
4. **Ocean Breeze** - Ciano (#06b6d4)

## 🚀 Como Usar

### Aplicar Tema via Admin
1. Aceder a `/admin`
2. Ir para aba "Tema"
3. Selecionar tema pré-definido ou personalizar cores
4. Clicar em "Guardar Tema"
5. Página recarrega automaticamente com novo tema

### Classes CSS
```tsx
// Cartão moderno
<div className="card-modern">
  <h3 className="text-mtm-primary">Título</h3>
  <p className="text-gray-300">Conteúdo</p>
</div>

// Botão principal
<button className="btn-mtm-primary">
  Ação Principal
</button>

// Animação de scroll
<div className="scroll-slide-up animation-delay-200">
  Conteúdo animado
</div>
```

## 📊 Status da Implementação

- ✅ Sistema de tema centralizado
- ✅ 4 Temas pré-definidos
- ✅ Gestor visual de tema no admin
- ✅ API para salvar tema
- ✅ Particle background em todas as páginas principais
- ✅ Navbar e Footer com nova paleta
- ✅ Classes CSS utilitárias
- ✅ Animações de scroll
- ✅ Componente YouTubePlayer otimizado
- 🔄 Reformatar cartões (em progresso)
- 🔄 Aplicar tema em todas as páginas (em progresso)

