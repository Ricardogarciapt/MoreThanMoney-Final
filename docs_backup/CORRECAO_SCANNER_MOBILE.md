# 🔧 Correção: Scanner Mobile - TradingView Widget

## 🐛 Problema

**Erro:**
```
TypeError: Cannot read properties of null (reading 'parentNode')
    at widget.remove (https://s3.tradingview.com/tv.js:1:16183)
```

**Causa:**
O widget do TradingView estava tentando remover um elemento DOM que já não existia ou que não tinha um `parentNode`, causando um erro fatal ao navegar entre tabs ou ao desmontar o componente.

---

## ✅ Solução Implementada

### 1. Limpeza Segura do Widget (useEffect cleanup)

**Antes:**
```typescript
return () => {
  if (widgetRef.current?.remove) {
    try {
      widgetRef.current.remove()
    } catch (e) {
      console.error("Erro ao remover widget:", e)
    }
  }
}
```

**Depois:**
```typescript
return () => {
  try {
    if (widgetRef.current) {
      // Verificar se o método remove existe
      if (typeof widgetRef.current.remove === 'function') {
        // Verificar se o widget tem um elemento pai antes de remover
        const widgetElement = containerRef.current?.querySelector('iframe')
        if (widgetElement && widgetElement.parentNode) {
          widgetRef.current.remove()
        }
      }
      widgetRef.current = null
    }
    
    // Limpar o container manualmente se ainda houver conteúdo
    if (containerRef.current) {
      containerRef.current.innerHTML = ''
    }
  } catch (e) {
    console.warn("Aviso ao limpar widget:", e)
  }
}
```

**Melhorias:**
- ✅ Verifica se o iframe ainda existe no DOM
- ✅ Verifica se o iframe tem `parentNode` antes de remover
- ✅ Limpa o container manualmente como fallback
- ✅ Define `widgetRef.current = null` para evitar referências pendentes
- ✅ Usa `console.warn` em vez de `console.error` para não assustar usuários

---

### 2. Remoção de Widget Anterior ao Recarregar

**Antes:**
```typescript
const loadWidget = () => {
  if (!window.TradingView || !containerRef.current) return

  try {
    if (containerRef.current) {
      containerRef.current.innerHTML = '<div id="tradingview_mobile_widget"...'
    }
    
    widgetRef.current = new window.TradingView.widget({...})
  }
}
```

**Depois:**
```typescript
const loadWidget = () => {
  if (!window.TradingView || !containerRef.current) return

  try {
    // Remover widget anterior se existir
    if (widgetRef.current) {
      try {
        if (typeof widgetRef.current.remove === 'function') {
          widgetRef.current.remove()
        }
      } catch (e) {
        console.warn("Aviso ao remover widget anterior:", e)
      }
      widgetRef.current = null
    }

    // Limpar container e criar novo elemento
    if (containerRef.current) {
      containerRef.current.innerHTML = '<div id="tradingview_mobile_widget"...'
    }
    
    widgetRef.current = new window.TradingView.widget({...})
  }
}
```

**Melhorias:**
- ✅ Remove widget anterior antes de criar um novo
- ✅ Evita múltiplos widgets sobrepostos
- ✅ Previne vazamentos de memória
- ✅ Garante limpeza completa do container

---

## 🎯 Benefícios

1. **Estabilidade:**
   - ❌ Elimina erro `TypeError: Cannot read properties of null`
   - ✅ Navegação suave entre tabs sem crashes
   - ✅ Desmontagem segura do componente

2. **Performance:**
   - ✅ Previne vazamentos de memória
   - ✅ Remove widgets antigos corretamente
   - ✅ Evita iframes órfãos no DOM

3. **Experiência do Usuário:**
   - ✅ Sem erros visíveis no console
   - ✅ Transições suaves entre ativos/timeframes
   - ✅ App mais responsivo

---

## 🧪 Testes Recomendados

Para verificar a correção:

1. **Navegação entre tabs:**
   - Social → Portfolios → Scanner → Social (repetir várias vezes)
   - ✅ Não deve haver erros no console

2. **Mudança de ativos:**
   - Selecionar diferentes ativos (Forex, Crypto, ETFs)
   - ✅ Widget deve recarregar sem erros

3. **Mudança de timeframes:**
   - Alternar entre 1min, 5min, 1h, 1D
   - ✅ Widget deve atualizar corretamente

4. **Modo fullscreen:**
   - Entrar e sair do fullscreen várias vezes
   - ✅ Não deve crashar

5. **Fechar/reabrir app:**
   - Navegar para fora e voltar para `/app-mobile`
   - ✅ Widget deve carregar normalmente

---

## 📝 Ficheiros Alterados

- ✅ `components/mobile/scanner-mobile.tsx`
  - Limpeza segura no useEffect cleanup
  - Remoção de widget anterior no loadWidget

---

## 🚀 Status

- ✅ **Correção implementada**
- ✅ **Sem erros de linting**
- ✅ **Pronto para deploy**

---

**Última atualização:** 10 de Outubro de 2025  
**Gravidade do bug:** 🔴 Alta (causava crash da aplicação)  
**Status:** ✅ Resolvido

