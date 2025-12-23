# 🧪 TESTES DE ROLES E PERMISSÕES

**Data**: 26 de Outubro de 2025  
**Objetivo**: Verificar se todos os fluxos de acesso por role estão funcionando corretamente

---

## ✅ **CHECKLIST DE TESTES**

### **1. Redirecionamento Após Login**

- [ ] **Admin** → Deve redirecionar para `/admin`
- [ ] **VIP** → Deve redirecionar para `/app-mobile`
- [ ] **Membro IQ** → Deve redirecionar para `/app-mobile`
- [ ] **Membro Skool** → Deve redirecionar para `/app-mobile`
- [ ] **Guest (Trial)** → Deve redirecionar para `/app-mobile`
- [ ] **Presentation** → Deve redirecionar para `/new-landing`

### **2. Acesso a `/portfolios`**

- [ ] **Admin** → ✅ Acesso permitido
- [ ] **VIP** → ✅ Acesso permitido
- [ ] **Membro IQ** → ✅ Acesso permitido
- [ ] **Membro Skool** → ❌ Acesso negado (redirecionar para `/app-mobile`)
- [ ] **Guest** → ❌ Acesso negado (redirecionar para `/app-mobile`)

### **3. Acesso a `/aimtm` (AI MTM Trader)**

- [ ] **Admin** → ✅ Acesso permitido
- [ ] **VIP** → ✅ Acesso permitido
- [ ] **Membro IQ** → ❌ Acesso negado
- [ ] **Membro Skool** → ❌ Acesso negado
- [ ] **Guest** → ❌ Acesso negado

### **4. Acesso a `/admin`**

- [ ] **Admin** → ✅ Acesso permitido
- [ ] **VIP** → ❌ Acesso negado
- [ ] **Membro IQ** → ❌ Acesso negado
- [ ] **Membro Skool** → ❌ Acesso negado
- [ ] **Guest** → ❌ Acesso negado

### **5. Social Feed (Criar Posts)**

- [ ] **Admin** → ✅ Pode criar posts
- [ ] **VIP** → ✅ Pode criar posts
- [ ] **Membro IQ** → ❌ Não pode criar
- [ ] **Membro Skool** → ❌ Não pode criar
- [ ] **Guest** → ❌ Não pode criar

### **6. Google Login + Atribuição de Role**

- [ ] Utilizador novo faz Google Login
- [ ] Perfil criado automaticamente
- [ ] Admin define `member_category` em `/admin`
- [ ] Utilizador faz logout e login novamente
- [ ] Redirecionamento correto baseado no role

---

## 🔧 **ANTES DE TESTAR**

1. ✅ Executar SQL no Supabase:
   ```bash
   psql [CONNECTION_STRING] -f scripts/add-member-category-column.sql
   ```

2. ✅ Verificar se coluna `member_category` existe na tabela `profiles`

3. ✅ Criar utilizadores de teste com diferentes roles

---

## 📝 **NOTAS DE TESTE**

- Todos os testes devem ser feitos em ambiente de produção/staging
- Verificar logs do console no browser
- Verificar logs do servidor Vercel
- Testar em diferentes navegadores (Chrome, Safari, Firefox)

---

**Status**: ⏳ Em execução...

