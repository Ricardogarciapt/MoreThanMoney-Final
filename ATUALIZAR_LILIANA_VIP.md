# 📧 Atualizar Liliana Faria para VIP

## ✅ **INSTRUÇÕES**

**Email**: liliana.icfaria@gmail.com  
**Promover para**: VIP  
**Categoria**: VIP

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
  user_type = 'vip',
  member_category = 'vip',
  updated_at = NOW()
WHERE email = 'liliana.icfaria@gmail.com'
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
abc| liliana...@gmail.com | Liliana Faria | vip | vip | 2024-12-...
```

---

## 📋 **ALTERNATIVA: Via Admin Panel**

Se preferires usar a interface:

1. Fazer login em https://www.morethanmoney.pt/admin
2. Ir para: **Gestão de Utilizadores**
3. Procurar: `liliana.icfaria@gmail.com`
4. Alterar dropdown **Status** para: `⭐ VIP`
5. Guardar

---

## ✅ **CONFIRMAÇÃO**

Após executar, verifica:

- ✅ `user_type = 'vip'`
- ✅ `member_category = 'vip'`
- ✅ `updated_at` atualizado

---

**Pronto para executar no Supabase!** 🎉

