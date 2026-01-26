# 📦 Como Instalar Dependências

## Opção 1: Usar o Script Automático (Recomendado)

Execute no terminal:
```bash
bash install.sh
```

## Opção 2: Instalação Manual

### 1. Instalar Node.js (se ainda não tiver)

#### Via Homebrew (macOS):
```bash
brew install node
```

#### Via NVM (Node Version Manager):
```bash
# Instalar NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reiniciar terminal ou executar
source ~/.zshrc

# Instalar Node.js LTS
nvm install --lts
nvm use --lts
```

#### Download Direto:
Baixar em: https://nodejs.org/ (versão LTS recomendada)

### 2. Verificar Instalação
```bash
node --version  # Deve ser >= 18.0.0
npm --version   # Deve mostrar a versão do npm
```

### 3. Instalar Dependências
```bash
# No diretório do projeto
npm install --legacy-peer-deps
```

## ⚠️ Nota Importante

O projeto requer `--legacy-peer-deps` devido a algumas incompatibilidades de versões de dependências. Isso é normal e seguro.

## ✅ Após Instalação

Execute:
```bash
npm run dev
```

O servidor iniciará na porta 3001.

## 🔧 Troubleshooting

### npm não encontrado
- Certifique-se de que Node.js está instalado
- Reinicie o terminal após instalar Node.js
- Verifique se está no PATH: `which npm`

### Erros de permissão
- Use `sudo` apenas se necessário (não recomendado para npm)
- Melhor: configurar npm para usar diretório sem sudo

### Problemas com dependências
- Limpe o cache: `npm cache clean --force`
- Remova `node_modules` e `package-lock.json` e reinstale
- Verifique se Node.js >= 18.0.0
