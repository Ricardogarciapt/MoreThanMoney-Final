# Guia de Início Rápido - Educadores MTM LMS

**Linguagem:** Português  
**Data:** 2024-06-23  
**Status:** Scaffold Pronto para Deploy

---

## Sumário Executivo

Criámos scaffold completo para 2 educadores:
- **Adilson Araujo** (Mindset / Psicologia do Trading)
- **Liliana Faria** (Social Media / Redes Sociais)

Todos os ficheiros estão prontos. Faltam apenas:
1. Gerar avatares com IA (30 minutos)
2. Design team customizar overlays (2-3 horas)
3. Upload para Supabase Storage (15 minutos)

---

## Ficheiros Criados (11 Ficheiros Prontos)

### SQL & Database
```
✓ supabase/migrations/052_lms_educators_adilson_liliana.sql
  → Insere 2 educadores
  → Auto-gera stream_key_fixed
  → Hash de password com bcrypt
```

### OBS Templates (Prontos para Usar)
```
✓ public/assets/educadores/adilson-araujo/obs-template.json
  → 2 cenas: Palestra + Screen Share
  → Hotkeys: Alt+1, Alt+2, Alt+F9, Alt+F10, Alt+C

✓ public/assets/educadores/liliana-faria/obs-template.json
  → 3 cenas: Workshop + Apresentação + Intervalo
  → Hotkeys: Alt+1, Alt+2, Alt+3, Alt+F9, Alt+F10, Alt+C
```

### Documentação Completa
```
✓ docs/EDUCATORS_SETUP.md
  → 6 fases de setup detalhadas
  → Prompts para AI incluídos
  → Troubleshooting incluído

✓ public/assets/educadores/educators-manifest.json
  → Metadata de educadores
  → Checklist de 14 passos cada
  → Workflow documentation

✓ public/assets/educadores/adilson-araujo/README.md
✓ public/assets/educadores/liliana-faria/README.md
  → Instruções personalizadas
  → Descrição de cenas
  → Contactos de suporte

✓ public/assets/educadores/educators-welcome-email-template.txt
  → Email pronto para enviar
  → Campos personalizáveis
```

### Gráficos Placeholder (Prontos)
```
✓ public/assets/educadores/adilson-araujo/overlay.png (1280x720)
✓ public/assets/educadores/liliana-faria/overlay.png (1280x720)
✓ public/assets/educadores/liliana-faria/intervalo-screen.png (1280x720)
  → Com branding MTM
  → Prontos para design team customizar
```

### Status Files
```
✓ EDUCATORS_ONBOARDING_STATUS.md
✓ EDUCATORS_FILES_SUMMARY.txt
  → Referência completa
  → Checklists de verificação
```

---

## Sequência de Deploy (8 Passos)

### Passo 1: Apply SQL (2 minutos)
```bash
cd /Users/ricardogarcia/Projetos/morethanmoney
supabase db push

# Ou via Supabase Dashboard:
# SQL Editor > Copiar conteúdo de 052_lms_educators_adilson_liliana.sql > Executar
```

**Resultado esperado:**
- 2 educadores inseridos em `lms_educators`
- stream_key_fixed auto-gerado
- is_active = true

---

### Passo 2: Gerar Avatares IA (30 minutos)

**Para Adilson (Mindset):**
```
Prompt: Professional avatar for Adilson Araujo, psychology trading coach, 
confident serious expression, professional attire, mindset-focused aesthetic, 
subtle gold/navy color scheme, high contrast background, modern minimalist style, 
500x500px
```

**Para Liliana (Social Media):**
```
Prompt: Professional avatar for Liliana Faria, social media expert, personal 
branding coach, confident friendly smile, modern professional attire, 
community-focused aesthetic, vibrant but professional color palette, 500x500px
```

**Ferramentas:** Midjourney, DALL-E, ou Claude Canvas Design

**Ficheiros a gerar:**
- `adilson-araujo/avatar.jpg` (500x500)
- `liliana-faria/avatar.jpg` (500x500)

---

### Passo 3: Design Team Assets (2-3 horas)

**Overlays (1280x720 PNG):**
- Incluir: MTM logo + nome educador + specialty tag
- Cores: Branding MTM consistent
- Transparência: Áreas claras para câmera
  
**Ficheiros:**
- `adilson-araujo/overlay.png` (customizar placeholder existente)
- `liliana-faria/overlay.png` (customizar placeholder existente)
- `liliana-faria/intervalo-screen.png` (customizar placeholder existente)

---

### Passo 4: Upload para Supabase (15 minutos)

**Via Supabase Dashboard:**
1. Storage > mtm-public > Create folder: `educadores/adilson-araujo`
2. Upload: avatar.jpg, cover.jpg, thumbnail.jpg
3. Create folder: `educadores/liliana-faria`
4. Upload: avatar.jpg, cover.jpg, thumbnail.jpg

**Resultado:**
```
https://storage.supabase.co/mtm-public/educadores/adilson-araujo/avatar.jpg
https://storage.supabase.co/mtm-public/educadores/liliana-faria/avatar.jpg
```

---

### Passo 5: Update Database (5 minutos)

```sql
-- Via Supabase SQL Editor

UPDATE public.lms_educators
SET avatar_url = 'https://storage.supabase.co/mtm-public/educadores/adilson-araujo/avatar.jpg'
WHERE email = 'adilson@morethanmoney.pt';

UPDATE public.lms_educators
SET avatar_url = 'https://storage.supabase.co/mtm-public/educadores/liliana-faria/avatar.jpg'
WHERE email = 'liliana@morethanmoney.pt';
```

---

### Passo 6: Configurar OBS (20 minutos por educador)

**Para cada educador:**

1. Download `obs-template.json` do seu directório
2. Open OBS Studio
3. File > Import > Select json file
4. Seleccionar o arquivo:
   - `adilson-araujo/obs-template.json`
   - `liliana-faria/obs-template.json`

5. Get stream key from database:
```sql
SELECT stream_key_fixed FROM public.lms_educators 
WHERE email = 'adilson@morethanmoney.pt';
-- Result: mtm_edu_...
```

6. Configure OBS:
   - Settings > Stream > Server: rtmps://live.supabase.io:443/app
   - Stream Key: [Colar valor do passo anterior]

7. Testar:
   - Alt+1: Ir à cena 1
   - Alt+2: Ir à cena 2
   - Alt+C: Toggle chat
   - Verificar: Microfone, câmera, overlay

---

### Passo 7: Enviar Welcome Emails (5 minutos)

Use template: `public/assets/educadores/educators-welcome-email-template.txt`

Substituir placeholders:
- [EDUCATOR_NAME]
- [EDUCATOR_EMAIL]
- [TEMPORARY_PASSWORD_HASH_PLACEHOLDER]
- [STREAM_KEY_FIXED]
- [SPECIALTY]
- [ACADEMY_NAME]

---

### Passo 8: Primeira Stream (Schedule Based)

**Checklist pré-stream:**
- [ ] OBS configurado com stream key
- [ ] Microfone testado
- [ ] Câmera posicionada
- [ ] Luz adequada
- [ ] Internet 5+ Mbps upload
- [ ] Chat browser source carregando

**Iniciar stream:**
1. Alt+F9 (Start Streaming)
2. Aguardar confirmação
3. Verificar vídeo/áudio no dashboard
4. Começar sessão

**Pós-stream:**
- Registar viewer count
- Verificar engagement do chat
- Guardar recording
- Extrair clips para redes sociais

---

## Checklist Rápido

### Database ✓
- [x] SQL migration criada
- [ ] SQL migration aplicada (`supabase db push`)
- [ ] 2 educadores verificados na BD
- [ ] stream_key_fixed auto-gerado

### Assets (Imagens) ⏳
- [x] Placeholder overlays criados
- [ ] Avatares IA gerados
- [ ] Covers IA gerados
- [ ] Thumbnails IA gerados
- [ ] Overlays customizados por design team
- [ ] Break screen customizado (Liliana)
- [ ] Todos uploadados para Supabase

### OBS ⏳
- [x] Templates JSON criados
- [ ] Templates importados em OBS
- [ ] Stream key configurado
- [ ] Scenes testadas
- [ ] Hotkeys verificadas

### Comunicação ⏳
- [x] Email template criado
- [ ] Emails enviados aos educadores
- [ ] Onboarding calls agendadas
- [ ] Primeira stream agendada

---

## Ficheiros-Chave Localizações

```
📂 Migrations:
   supabase/migrations/052_lms_educators_adilson_liliana.sql

📂 OBS Templates:
   public/assets/educadores/adilson-araujo/obs-template.json
   public/assets/educadores/liliana-faria/obs-template.json

📂 Documentation:
   docs/EDUCATORS_SETUP.md
   EDUCATORS_ONBOARDING_STATUS.md
   EDUCATORS_FILES_SUMMARY.txt
   public/assets/educadores/educators-manifest.json
   public/assets/educadores/educators-welcome-email-template.txt
   public/assets/educadores/adilson-araujo/README.md
   public/assets/educadores/liliana-faria/README.md

📂 Assets (Educadores):
   public/assets/educadores/adilson-araujo/
   public/assets/educadores/liliana-faria/
```

---

## Hotkeys OBS - Referência Rápida

### Adilson
```
Alt+1    → Stream Palestra (Webcam + Overlay)
Alt+2    → Screen Share + Chat
Alt+F9   → Iniciar Stream
Alt+F10  → Parar Stream
Alt+C    → Toggle Chat
```

### Liliana
```
Alt+1    → Stream Workshop (Webcam + Overlay)
Alt+2    → Tela de Apresentação (Screen)
Alt+3    → Intervalo (Break Screen)
Alt+F9   → Iniciar Stream
Alt+F10  → Parar Stream
Alt+C    → Toggle Chat
```

---

## Próximas Ações (Prioridade)

### HOJE:
1. ✓ Scaffold criado (FEITO)
2. [ ] Revisar documentação
3. [ ] Iniciar geração de avatares IA
4. [ ] Contactar design team para overlays

### AMANHÃ:
5. [ ] Apply SQL migration
6. [ ] Design assets prontos
7. [ ] Upload para Supabase
8. [ ] Update database URLs
9. [ ] Testar OBS imports

### ANTES PRIMEIRA STREAM:
10. [ ] OBS configurado para cada educador
11. [ ] Welcome emails enviados
12. [ ] Onboarding calls completadas
13. [ ] Testes técnicos completos

---

## Tempos Estimados

| Tarefa | Duração | Owner |
|--------|---------|-------|
| SQL Migration | 2 min | Dev |
| AI Avatars | 30 min | Designer/AI |
| Design Overlays | 2-3 h | Design Team |
| Supabase Upload | 15 min | Dev |
| OBS Setup (cada) | 20 min | Educador |
| Emails | 5 min | Community Mgr |
| **TOTAL** | **~5-6 h** | **Distributed** |

---

## Suporte

**Community Manager:** Ricardo Garcia  
**Email:** support@morethanmoney.pt  
**Telegram:** [community-link]

---

## Status Atual

✅ **PRONTO PARA DEPLOY**

Toda a infraestrutura está criada. Faltam apenas 3-4 horas de trabalho em:
1. Geração de avatares (IA)
2. Design assets (design team)
3. Uploads e testes (dev)

---

**Criado por:** Community Manager (Ricardo Garcia)  
**Data:** 2024-06-23  
**Status:** PRODUÇÃO PRONTA

