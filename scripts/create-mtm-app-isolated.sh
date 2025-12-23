#!/bin/bash

# ========================================
# CRIAR APP MTM ISOLADA NO DESKTOP
# ========================================

DESKTOP_PATH="$HOME/Desktop"
APP_NAME="MTM-APP"
SOURCE_DIR="."
DEST_DIR="$DESKTOP_PATH/$APP_NAME"

echo "🚀 Criando MTM-APP isolada no Desktop..."

# Criar estrutura de pastas
mkdir -p "$DEST_DIR"
mkdir -p "$DEST_DIR/app/mobile"
mkdir -p "$DEST_DIR/components/mobile"
mkdir -p "$DEST_DIR/components/ui"
mkdir -p "$DEST_DIR/lib"
mkdir -p "$DEST_DIR/public"
mkdir -p "$DEST_DIR/contexts"
mkdir -p "$DEST_DIR/hooks"
mkdir -p "$DEST_DIR/styles"

echo "✅ Estrutura de pastas criada"

# Copiar página mobile
cp "app/mobile/page.tsx" "$DEST_DIR/app/mobile/page.tsx"
cp "app/mobile/layout.tsx" "$DEST_DIR/app/mobile/layout.tsx" 2>/dev/null || echo "layout.tsx não existe, pulando..."

# Copiar componentes mobile
cp "components/mobile/social-feed.tsx" "$DEST_DIR/components/mobile/"
cp "components/mobile/portfolio-mobile.tsx" "$DEST_DIR/components/mobile/"
cp "components/mobile/scanner-mobile.tsx" "$DEST_DIR/components/mobile/"

# Copiar componentes UI necessários
cp "components/ui/tabs.tsx" "$DEST_DIR/components/ui/"
cp "components/ui/button.tsx" "$DEST_DIR/components/ui/"
cp "components/ui/card.tsx" "$DEST_DIR/components/ui/"
cp "components/ui/badge.tsx" "$DEST_DIR/components/ui/" 2>/dev/null || echo "badge.tsx não existe"
cp "components/ui/input.tsx" "$DEST_DIR/components/ui/"
cp "components/ui/dropdown-menu.tsx" "$DEST_DIR/components/ui/"
cp "components/ui/dialog.tsx" "$DEST_DIR/components/ui/"
cp "components/ui/select.tsx" "$DEST_DIR/components/ui/"
cp "components/ui/alert.tsx" "$DEST_DIR/components/ui/"
cp "components/ui/label.tsx" "$DEST_DIR/components/ui/"

# Copiar libs
cp "lib/supabase.ts" "$DEST_DIR/lib/"
cp "lib/auth-cache.ts" "$DEST_DIR/lib/"
cp "lib/role-redirect.ts" "$DEST_DIR/lib/"
cp "lib/route-protection.tsx" "$DEST_DIR/lib/"

# Copiar contexts
cp "contexts/auth-context.tsx" "$DEST_DIR/contexts/" 2>/dev/null || echo "auth-context.tsx não existe"

# Copiar componentes necessários
cp "components/protected-page.tsx" "$DEST_DIR/components/"
cp "components/notifications-panel.tsx" "$DEST_DIR/components/"
cp "components/youtube-embed.tsx" "$DEST_DIR/components/" 2>/dev/null || echo "youtube-embed.tsx não existe"
cp "components/youtube-player.tsx" "$DEST_DIR/components/" 2>/dev/null || echo "youtube-player.tsx não existe"
cp "components/trading-view-widget-mobile.tsx" "$DEST_DIR/components/"
cp "components/portfolio-growth-charts.tsx" "$DEST_DIR/components/" 2>/dev/null || echo "portfolio-growth-charts.tsx não existe"

# Copiar assets (se existirem)
cp -r "public" "$DEST_DIR/" 2>/dev/null || echo "public não existe"

# Copiar estilos globais
cp "app/globals.css" "$DEST_DIR/styles/" 2>/dev/null || echo "globals.css não existe em app/"
cp "styles/globals.css" "$DEST_DIR/styles/" 2>/dev/null || echo "styles/globals.css não existe"

echo "✅ Arquivos copiados"

# Criar package.json básico
cat > "$DEST_DIR/package.json" << 'EOF'
{
  "name": "mtm-mobile-app",
  "version": "1.0.0",
  "description": "MoreThanMoney Mobile App - Isolated PWA",
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001"
  },
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "@supabase/supabase-js": "^2.38.0",
    "lucide-react": "^0.292.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0",
    "@radix-ui/react-tabs": "^1.0.0",
    "@radix-ui/react-dropdown-menu": "^2.0.0",
    "@radix-ui/react-dialog": "^1.0.0",
    "@radix-ui/react-select": "^2.0.0",
    "@radix-ui/react-label": "^2.0.0",
    "sonner": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.0.0",
    "typescript": "^5.0.0",
    "tailwindcss": "^3.3.0",
    "postcss": "^8.0.0",
    "autoprefixer": "^10.0.0"
  }
}
EOF

echo "✅ package.json criado"

# Criar tsconfig.json
cat > "$DEST_DIR/tsconfig.json" << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF

echo "✅ tsconfig.json criado"

# Criar next.config.mjs
cat > "$DEST_DIR/next.config.mjs" << 'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['supabase.co', '*.supabase.co', 'i.imgur.com', 'ytimg.com'],
    unoptimized: true
  },
  experimental: {
    serverActions: true
  }
}

export default nextConfig
EOF

echo "✅ next.config.mjs criado"

echo "✅ MTM-APP isolada criada em: $DEST_DIR"
echo ""
echo "📋 PRÓXIMOS PASSOS:"
echo "1. cd $DEST_DIR"
echo "2. npm install"
echo "3. Copiar .env.local com credenciais"
echo "4. npm run dev"
echo ""
echo "🌐 App estará disponível em: http://localhost:3001/mobile"

