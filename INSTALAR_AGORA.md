# 🚀 Instalar Dependências - Execute no Terminal Externo

## ⚡ Método Mais Rápido (2 minutos)

Abra o **Terminal.app** ou **iTerm** e execute estes comandos um por um:

```bash
# 1. Navegar para o projeto
cd "/Users/ricardogarcia/Documents/Repositório SITE/SITE-MORETHANMONEY-FINAL-39aae3022258dec0b1e9cce3dc39489035c05b36"

# 2. Instalar Homebrew (se não tiver)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 3. Instalar Node.js (que inclui npm)
brew install node

# 4. Verificar instalação
node --version
npm --version

# 5. Instalar dependências do projeto
npm install --legacy-peer-deps
```

## ✅ Após Instalação

Execute no Cursor ou no terminal:
```bash
npm run dev
```

O servidor iniciará na porta **3001**.

---

## 📝 Notas

- O Homebrew pedirá a sua senha (é normal)
- O processo pode levar 2-5 minutos
- Após instalar, os comandos funcionarão no Cursor também
