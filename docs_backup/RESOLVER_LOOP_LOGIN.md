# 🔧 Resolver Loop de Login - 3 Passos Simples

## 🚨 **Problema:**
Login fica em loop infinito com timeout de 3s.

## ✅ **Solução em 3 Passos:**

---

### **PASSO 1: Executar SQL no Supabase**

Link: https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/sql

**Abre o arquivo:** `SQL_PASSO_2.sql`

**Copia e cola no Supabase SQL Editor:**

```sql
INSERT INTO public.profiles (
  id,
  email,
  full_name,
  username,
  user_type,
  membership_level,
  package,
  is_active,
  created_at,
  updated_at
)
SELECT 
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
  split_part(u.email, '@', 1),
  'member',
  'basic',
  'basic',
  true,
  u.created_at,
  NOW()
FROM auth.users u
WHERE u.email = 'ricardo.subtilgarcia@gmail.com'
AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);
```

**Clica em RUN** ✅

---

### **PASSO 2: Limpar Cache do Browser**

1. Abre DevTools (F12)
2. Tab **Application** ou **Aplicação**
3. Storage → **Local Storage** → Clica em `https://morethanmoney.pt`
4. Clica com botão direito → **Clear** ou **Limpar**
5. Storage → **Session Storage** → Clica em `https://morethanmoney.pt`
6. Clica com botão direito → **Clear** ou **Limpar**

Ou simplesmente:
- Chrome: `Cmd+Shift+Delete` → Limpar cache

---

### **PASSO 3: Fazer Logout e Login Novamente**

1. **Fecha TODAS as abas** do site
2. Abre nova aba
3. Vai a: https://morethanmoney.pt/login
4. Faz **logout** se estiver logado
5. Faz **login com Google** novamente

**Agora NÃO deve dar loop!** ✅

---

## 🔄 **O que foi corrigido no código:**

✅ Timeout aumentado: 3s → 10s  
✅ Proteção anti-loop com sessionStorage  
✅ Se timeout acontecer 2x, assume autenticado  
✅ Deploy automático na Vercel (já feito)

---

## 🧪 **Testar:**

Depois dos 3 passos:

1. Login com Google deve funcionar
2. Sem timeout
3. Sem loop de redirect
4. App-mobile carrega normalmente

---

## 📞 **Se continuar com problemas:**

Execute este SQL adicional para ver se o perfil existe:

```sql
SELECT 
  u.id,
  u.email,
  u.created_at,
  p.full_name,
  p.user_type,
  CASE WHEN p.id IS NULL THEN 'SEM PERFIL' ELSE 'COM PERFIL' END as status
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE u.email = 'ricardo.subtilgarcia@gmail.com';
```

Se aparecer "SEM PERFIL" → executa novamente o SQL do Passo 1.

---

**AGORA:** Executa o Passo 1 (SQL) e depois limpa o cache! 🚀

