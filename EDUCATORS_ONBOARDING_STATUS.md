# Educators Onboarding Status - Adilson Araujo & Liliana Faria

**Date:** 2024-06-23
**Status:** SCAFFOLD READY FOR DEPLOYMENT

---

## Summary

Criado scaffold completo SQL + OBS templates para 2 educadores:
1. **Adilson Araujo** (Mindset, Psicologia do Trading)
2. **Liliana Faria** (Social Media, Redes Sociais)

Estrutura pronta para imediata execução do deploy com placeholders para avatars/imagens finais.

---

## Deliverables Completed

### 1. SQL Migration ✓
**File:** `supabase/migrations/052_lms_educators_adilson_liliana.sql`

```sql
-- 2 educadores inseridos:
-- adilson@morethanmoney.pt (Mindset)
-- liliana@morethanmoney.pt (Social Media)

-- stream_key_fixed auto-gerado para cada um
-- password_hash via bcrypt (PostgreSQL crypt)
-- is_active = true
-- avatar_url placeholders: https://storage.supabase.co/mtm-public/educadores/[slug]/avatar.jpg
```

**Status:** Ready to apply via `supabase db push`

---

### 2. OBS Configuration Templates ✓

#### Adilson's Template
**File:** `public/assets/educadores/adilson-araujo/obs-template.json`

**Scenes:**
1. Stream Palestra (Webcam 1280x720 + Overlay + Chat)
2. Screen Share + Chat

**Hotkeys:**
- Alt+F9: Start streaming
- Alt+F10: Stop streaming
- Alt+1: Scene 1
- Alt+2: Scene 2
- Alt+C: Toggle chat

---

#### Liliana's Template
**File:** `public/assets/educadores/liliana-faria/obs-template.json`

**Scenes:**
1. Stream Workshop (Webcam + Overlay + Chat)
2. Tela de Apresentação (Screen Share + Chat + Stats)
3. Intervalo (Break Screen)

**Hotkeys:**
- Alt+F9: Start streaming
- Alt+F10: Stop streaming
- Alt+1: Scene 1 (Workshop)
- Alt+2: Scene 2 (Presentation)
- Alt+3: Scene 3 (Break)
- Alt+C: Toggle chat

---

### 3. Asset Directory Structure ✓

```
public/assets/educadores/
│
├── adilson-araujo/
│   ├── obs-template.json ✓
│   ├── overlay.png (PLACEHOLDER) ✓
│   ├── README.md (setup instructions) ✓
│   ├── avatar.jpg (TO GENERATE)
│   ├── cover.jpg (TO GENERATE)
│   └── thumbnail.jpg (TO GENERATE)
│
├── liliana-faria/
│   ├── obs-template.json ✓
│   ├── overlay.png (PLACEHOLDER) ✓
│   ├── intervalo-screen.png (PLACEHOLDER) ✓
│   ├── README.md (setup instructions) ✓
│   ├── avatar.jpg (TO GENERATE)
│   ├── cover.jpg (TO GENERATE)
│   └── thumbnail.jpg (TO GENERATE)
│
└── educators-manifest.json (asset references & workflows) ✓
```

---

### 4. Documentation ✓

#### Main Setup Guide
**File:** `docs/EDUCATORS_SETUP.md`

Comprehensive guide covering:
- Phase 1: Database Migration
- Phase 2: Asset Generation (AI prompts included)
- Phase 3: Design & Graphics
- Phase 4: Database Updates
- Phase 5: OBS Configuration
- Phase 6: Communication & Onboarding
- Troubleshooting section

---

#### Asset Manifest
**File:** `public/assets/educadores/educators-manifest.json`

Contains:
- Educator profiles
- Asset status tracking
- Setup checklists (14 steps each)
- Database migration references
- Asset workflow documentation

---

#### Individual README Files
- `public/assets/educadores/adilson-araujo/README.md`
- `public/assets/educadores/liliana-faria/README.md`

Each includes:
- Profile overview
- Assets status
- Quick setup steps
- Hotkeys reference
- Scene descriptions
- Support contacts
- Password reset instructions

---

## Asset Generation Plan

### Step 1: AI Avatar Generation (Immediate)

**For Adilson Araujo:**
- Tool: Midjourney / DALL-E / Claude Canvas
- Size: 500x500px
- Prompt provided in `EDUCATORS_SETUP.md` (Phase 2.1)

**For Liliana Faria:**
- Tool: Midjourney / DALL-E / Claude Canvas
- Size: 500x500px
- Prompt provided in `EDUCATORS_SETUP.md` (Phase 2.1)

### Step 2: Design Team Assets (Before First Stream)

**Overlays (1280x720):**
- adilson-araujo/overlay.png - Psychology/Mindset theme
- liliana-faria/overlay.png - Social Media/Growth theme
- Include MTM branding, educator name, specialty tag

**Break Screen (for Liliana):**
- liliana-faria/intervalo-screen.png (1280x720)
- Professional pause screen messaging

### Step 3: Supabase Storage Upload
- Bucket: `mtm-public`
- Path: `educadores/[educator-slug]/`
- Files: All JPG/PNG assets

### Step 4: Database Avatar URL Update
```sql
UPDATE public.lms_educators
SET avatar_url = 'https://storage.supabase.co/mtm-public/educadores/adilson-araujo/avatar.jpg'
WHERE email = 'adilson@morethanmoney.pt';
```

---

## Deployment Sequence

### ✓ Already Done
- SQL migration created
- OBS templates configured
- Directory structure created
- Documentation complete
- Placeholder images generated

### Ready to Execute (In Order)

**1. Apply SQL Migration (2 min)**
```bash
supabase db push
# Or: Supabase Dashboard > SQL Editor > Paste 052_lms_educators_adilson_liliana.sql
```

**2. Generate AI Avatars (30 min)**
- Use prompts from `EDUCATORS_SETUP.md` Phase 2.1
- Generate 500x500 avatars for both educators

**3. Design Overlays & Break Screen (2-3 hours)**
- Design team: Create 1280x720 overlay PNGs
- Include: MTM branding, educator names, specialty tags
- Design team: Create intervalo-screen.png for Liliana

**4. Upload Assets to Supabase Storage (15 min)**
- Create folder: `mtm-public/educadores/adilson-araujo/`
- Create folder: `mtm-public/educadores/liliana-faria/`
- Upload all JPG/PNG files

**5. Update Database Avatar URLs (5 min)**
```sql
-- Run UPDATE statements from EDUCATORS_SETUP.md Phase 4.1
```

**6. Configure OBS (Per Educator, 20 min each)**
- Get stream_key_fixed from DB
- Import obs-template.json
- Replace placeholder with actual stream key
- Test scenes and hotkeys
- Verify chat browser source

**7. Send Welcome Emails (5 min)**
- Email template in `EDUCATORS_SETUP.md` Phase 6.1
- Include: account details, password reset link, OBS template
- Schedule onboarding call

**8. Conduct First Streams (Schedule Based)**
- Use pre-stream checklist
- Monitor chat and engagement
- Record sessions

---

## Verification Checklist

### Database
- [ ] SQL migration applied successfully
- [ ] 2 educators visible in `lms_educators` table
- [ ] stream_key_fixed auto-generated for both
- [ ] is_active = true
- [ ] academy_id references correct LMS academies

### Assets
- [ ] Adilson avatar.jpg uploaded and accessible
- [ ] Adilson cover.jpg uploaded and accessible
- [ ] Adilson thumbnail.jpg uploaded and accessible
- [ ] Liliana avatar.jpg uploaded and accessible
- [ ] Liliana cover.jpg uploaded and accessible
- [ ] Liliana thumbnail.jpg uploaded and accessible
- [ ] All overlay.png files in place
- [ ] Liliana intervalo-screen.png in place

### OBS Configuration
- [ ] Adilson: obs-template.json imports without errors
- [ ] Adilson: Both scenes appear correctly
- [ ] Adilson: Chat browser source loads
- [ ] Liliana: obs-template.json imports without errors
- [ ] Liliana: All 3 scenes appear correctly
- [ ] Liliana: Chat browser source loads

### Documentation
- [ ] EDUCATORS_SETUP.md readable and complete
- [ ] educators-manifest.json valid JSON
- [ ] adilson-araujo/README.md present
- [ ] liliana-faria/README.md present

---

## Next Steps for Community Manager

### Immediate (Today)
1. Review this status document
2. Share documentation with design team for assets
3. Initiate AI avatar generation

### Within 24 hours
4. Design team completes overlays & break screen
5. Upload all assets to Supabase Storage
6. Update database avatar URLs
7. Test OBS imports

### Before First Stream
8. Configure OBS for each educator
9. Send welcome emails with credentials
10. Schedule onboarding calls
11. Conduct technical readiness tests

---

## File Locations Reference

**SQL Migration:**
```
/Users/ricardogarcia/Projetos/morethanmoney/supabase/migrations/052_lms_educators_adilson_liliana.sql
```

**OBS Templates:**
```
/Users/ricardogarcia/Projetos/morethanmoney/public/assets/educadores/adilson-araujo/obs-template.json
/Users/ricardogarcia/Projetos/morethanmoney/public/assets/educadores/liliana-faria/obs-template.json
```

**Documentation:**
```
/Users/ricardogarcia/Projetos/morethanmoney/docs/EDUCATORS_SETUP.md
/Users/ricardogarcia/Projetos/morethanmoney/public/assets/educadores/educators-manifest.json
/Users/ricardogarcia/Projetos/morethanmoney/public/assets/educadores/adilson-araujo/README.md
/Users/ricardogarcia/Projetos/morethanmoney/public/assets/educadores/liliana-faria/README.md
```

**Assets Directory:**
```
/Users/ricardogarcia/Projetos/morethanmoney/public/assets/educadores/
```

---

## Time Estimates

| Task | Duration | Owner |
|------|----------|-------|
| SQL Migration | 2 min | Dev Team |
| AI Avatar Generation | 30 min | AI/Designer |
| Design Overlays | 2-3 hours | Design Team |
| Supabase Upload | 15 min | Dev Team |
| DB URL Update | 5 min | Dev Team |
| OBS Setup (each educator) | 20 min | Educator / Tech Support |
| Welcome Emails | 5 min | Community Manager |
| First Stream Test | 1 hour | Tech Support |
| **TOTAL** | **~5-6 hours** | **Distributed** |

---

## Success Criteria

- [x] SQL migration created and ready
- [x] OBS templates configured
- [x] Directory structure established
- [x] Documentation complete
- [ ] AI avatars generated
- [ ] Design assets created
- [ ] Assets uploaded to Supabase
- [ ] Database URLs updated
- [ ] OBS configured for both educators
- [ ] Welcome emails sent
- [ ] First stream executed successfully
- [ ] Chat engagement recorded
- [ ] Technical issues resolved

---

## Notes

- **Passwords:** SQL migration uses bcrypt hashing. Educadores recebem temporary password - devem resetar na primeira login
- **Stream Keys:** Auto-gerado no migration. Cada educador tem stream_key_fixed única e imutável
- **Avatar URLs:** Placeholders até upload final. URLs seguem pattern: `https://storage.supabase.co/mtm-public/educadores/[slug]/[file]`
- **OBS Import:** Templates são JSON válidos. Importar via File > Import > Select JSON
- **Chat Browser:** Fonte precisa estar configurada com URL correta do endpoint LMS

---

**Created by:** Community Manager (Ricardo)
**Status:** Ready for Production Deployment
**Last Updated:** 2024-06-23

