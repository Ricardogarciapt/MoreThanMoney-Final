# 👑 Atualizar Ricardo Garcia para Admin

## ✅ **INSTRUÇÕES**

**Email**: ricardogarciapt@proton.me  
**Promover para**: Admin (Acesso Total)  
**Categoria**: Standard

---

## 🚀 **COMO EXECUTAR**

### **1. Aceder ao Supabase**

1. Ir para: https://supabase.com/dashboard
2. Selecionar o projeto: `SITE-MORETHANMONEY-FINAL`
3. Clicar em: **SQL Editor** (menu lateral)

### **2. Executar o SQL**

Copiar e colar o seguinte SQL:

```sql
UPDATE profiles
SET 
  user_type = 'admin',
  member_category = 'standard',
  updated_at = NOW()
WHERE email = 'ricardogarciapt@proton.me'
RETURNING 
  id, 
  email, 
  full_name, 
  user_type, 
  member_category,
  updated_at;
```

### **3. Verificar Resultado**

Deves ver algo como:

```
1 row updated

id | email | full_name | user_type | member_category | updated_at
---|-------|-----------|-----------|-----------------|-----------
xyz| ricardogarciapt@proton.me | Ricardo Garcia | admin | standard | 2024-12-...
```

---

## 📋 **ALTERNATIVA: Via Admin Panel**

Se preferires usar a interface:

1. Fazer login em https://www.morethanmoney.pt/admin
2. Ir para: **Gestão de Utilizadores**
3. Procurar: `ricardogarciapt@proton.me`
4. Alterar dropdown **Status** para: `👑 Admin`
5. Guardar

---

## ✅ **CONFIRMAÇÃO**

Após executar, verifica:

- ✅ `user_type = 'admin'`
- ✅ `member_category = 'standard'`
- ✅ `updated_at` atualizado

---

**Pronto para executar no Supabase!** 🎉

