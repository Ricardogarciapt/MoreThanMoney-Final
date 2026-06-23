# Educator Setup Guide - Adilson Araujo & Liliana Faria

## Overview

Este documento detalha o processo completo de setup para dois novos educadores na plataforma MTM LMS:

- **Adilson Araujo** (Mindset, Psicologia do Trading)
- **Liliana Faria** (Social Media, Personal Branding)

## Phase 1: Database Migration

### Step 1.1 - Apply SQL Migration

File: `supabase/migrations/052_lms_educators_adilson_liliana.sql`

```bash
# Via Supabase CLI
supabase db push

# Or via Supabase Dashboard SQL Editor
# Copiar conteúdo do arquivo e executar
```

**Expected Result:**
- 2 educadores inseridos na tabela `lms_educators`
- `stream_key_fixed` auto-gerado para cada educador
- Ambos com status `is_active = true`

### Step 1.2 - Verify Insertion

```sql
SELECT 
  id,
  email,
  display_name,
  specialty,
  stream_key_fixed,
  avatar_url
FROM public.lms_educators
WHERE email IN ('adilson@morethanmoney.pt', 'liliana@morethanmoney.pt');
```

**Note on Passwords:**
- Migration usa `crypt()` do PostgreSQL com random salt `gen_salt('bf')`
- Educadores devem resetar senha na primeira login (implementar reset flow se não existir)
- Não usar senhas temporárias em produção - comunicar reset seguro

## Phase 2: Asset Generation

### Step 2.1 - AI Avatar Generation

**Tools Options:**
1. Midjourney
2. DALL-E 3
3. Claude Canvas Design
4. Leonardo.ai

#### For Adilson Araujo

**Avatar Prompt:**
```
Professional avatar for Adilson Araujo, 40-50 years old, psychology trading coach, 
confident serious expression, professional attire (dark suit/casual professional), 
mindset-focused aesthetic, subtle gold/navy color scheme, high contrast background, 
modern minimalist style, headshot composition, 500x500px
```

**Cover Prompt:**
```
Professional cover banner 1500x400px for Adilson Araujo psychology trading coach,
dark navy/gold color scheme, subtle candlestick chart patterns in background,
text overlay ready, professional motivational atmosphere, 
composition: 70% darker left (for text), 30% lighter right (visual element)
```

**Thumbnail Prompt:**
```
300x300px professional thumbnail for Adilson Araujo, 
extracted from avatar, add small badge "Psicologia Trading",
modern minimalist design
```

#### For Liliana Faria

**Avatar Prompt:**
```
Professional avatar for Liliana Faria, 25-35 years old, social media expert, 
confident friendly smile, modern professional attire, community-focused aesthetic,
vibrant but professional color palette (coral/teal accents), 
high quality lighting, modern minimalist background,
headshot composition, 500x500px
```

**Cover Prompt:**
```
Professional cover banner 1500x400px for Liliana Faria social media growth expert,
vibrant modern color scheme (coral, teal, white), 
subtle social media icons in background,
growth upward arrows subtle pattern,
text overlay ready, energetic professional atmosphere,
composition: 40% lighter left (visual), 60% darker right (for text)
```

**Thumbnail Prompt:**
```
300x300px professional thumbnail for Liliana Faria,
extracted from avatar, add small badge "Redes Sociais",
vibrant modern design with community feel
```

### Step 2.2 - Download & Prepare Files

Directory Structure:
```
public/assets/educadores/
├── adilson-araujo/
│   ├── avatar.jpg (500x500)
│   ├── cover.jpg (1500x400)
│   ├── thumbnail.jpg (300x300)
│   ├── overlay.png (1280x720) - placeholder
│   ├── obs-template.json ✓ (ready)
│   └── README.md
├── liliana-faria/
│   ├── avatar.jpg (500x500)
│   ├── cover.jpg (1500x400)
│   ├── thumbnail.jpg (300x300)
│   ├── overlay.png (1280x720) - placeholder
│   ├── intervalo-screen.png (1280x720) - placeholder
│   ├── obs-template.json ✓ (ready)
│   └── README.md
└── educators-manifest.json ✓ (ready)
```

## Phase 3: Design & Graphics

### Step 3.1 - Create Overlay Graphics

**For Both Educators** - 1280x720px PNG overlay

**Design Requirements:**
- MTM branding (logo, color palette)
- Educator name in bottom/top corner
- Social media handles (if applicable)
- Transparent areas for camera feed
- Consistency with platform branding guidelines

**Reference:**
- Existing brand guidelines: `public/MTM/` (check for existing overlays)
- Color palette: Primary brand colors
- Font: Inter or platform default

**Deliverables:**
- `adilson-araujo/overlay.png`
- `liliana-faria/overlay.png`
- `liliana-faria/intervalo-screen.png` (break screen, full fill 1280x720)

### Step 3.2 - Upload to Supabase Storage

```bash
# Via Supabase Dashboard
# Navigate to: Storage > mtm-public > educadores > [educator-slug]
# Upload all image files

# Or via Supabase CLI/SDK
supabase storage from-file public/assets/educadores/adilson-araujo/avatar.jpg \
  mtm-public/educadores/adilson-araujo/avatar.jpg
```

**Storage Path Convention:**
```
mtm-public/educadores/[slug]/[filename]
```

**Expected URLs:**
```
https://storage.supabase.co/mtm-public/educadores/adilson-araujo/avatar.jpg
https://storage.supabase.co/mtm-public/educadores/liliana-faria/avatar.jpg
```

## Phase 4: Database Updates

### Step 4.1 - Update Avatar URLs

```sql
UPDATE public.lms_educators
SET avatar_url = 'https://storage.supabase.co/mtm-public/educadores/adilson-araujo/avatar.jpg'
WHERE email = 'adilson@morethanmoney.pt';

UPDATE public.lms_educators
SET avatar_url = 'https://storage.supabase.co/mtm-public/educadores/liliana-faria/avatar.jpg'
WHERE email = 'liliana@morethanmoney.pt';
```

### Step 4.2 - Verify Stream Keys

```sql
-- Check auto-generated stream keys
SELECT 
  display_name,
  stream_key_fixed,
  is_active
FROM public.lms_educators
WHERE email IN ('adilson@morethanmoney.pt', 'liliana@morethanmoney.pt');
```

## Phase 5: OBS Configuration

### Step 5.1 - For Each Educator

**Files Ready:**
- `public/assets/educadores/adilson-araujo/obs-template.json`
- `public/assets/educadores/liliana-faria/obs-template.json`

**OBS Import Process:**
1. Open OBS Studio
2. File > Import > Select JSON template
3. Configure stream key: `stream_key_fixed` from database
4. Test scenes:
   - Scene 1: Webcam + Overlay
   - Scene 2: Screen Share + Chat
   - Scene 3 (Liliana only): Break Screen

**Configuration Steps:**

#### Adilson - OBS Setup

```json
{
  "StreamServer": "rtmps://live.supabase.io:443/app",
  "StreamKey": "[COPY_FROM_DB_stream_key_fixed]",
  "Scenes": [
    "Stream Palestra (Webcam + Overlay)",
    "Screen Share + Chat"
  ]
}
```

#### Liliana - OBS Setup

```json
{
  "StreamServer": "rtmps://live.supabase.io:443/app",
  "StreamKey": "[COPY_FROM_DB_stream_key_fixed]",
  "Scenes": [
    "Stream Workshop (Webcam + Overlay)",
    "Tela de Apresentação (Screen Share)",
    "Intervalo (Break Screen)"
  ]
}
```

### Step 5.2 - Audio/Video Diagnostics

Before first live:
- [ ] Test microphone input
- [ ] Test camera resolution (1280x720 @ 30fps)
- [ ] Test chat browser source loading
- [ ] Verify overlay rendering
- [ ] Check bitrate (2500 kbps video, 128 kbps audio)

## Phase 6: Communication & Onboarding

### Step 6.1 - Educator Notifications

Email Template to Send:

```
Subject: Your MTM LMS Educator Account is Ready

Hi [Educator Name],

Your educator account is now active on the MTM Learning Management System!

Account Details:
- Email: [email]
- Dashboard: https://morethanmoney.pt/lms/educator/dashboard
- Stream Key: [stream_key_fixed] (kept secure, configured in your OBS template)

Next Steps:
1. Reset your password on first login (you'll receive a secure reset link)
2. Download your OBS configuration template: [link-to-json]
3. Import template into OBS Studio
4. Join our team onboarding call on [date]

Your Specialty: [specialty]
Your Academy: [academy]

Questions? Contact: support@morethanmoney.pt

Best regards,
MTM Community Team
```

### Step 6.2 - First Stream Checklist

Provide each educator with:

```
PRE-STREAM CHECKLIST

Equipment:
- [ ] Microphone working, no background noise
- [ ] Camera positioned at eye level, good lighting
- [ ] Internet connection stable (recommend 5+ Mbps upload)

OBS Setup:
- [ ] Stream key configured correctly
- [ ] All scenes visible in scene list
- [ ] Chat browser source showing messages
- [ ] Overlay PNG rendering correctly

Test Stream:
- [ ] Start stream, check preview in dashboard
- [ ] Verify chat is working (send test message)
- [ ] Check video/audio quality for 2-3 minutes
- [ ] Stop stream, review recording
- [ ] Make adjustments if needed

Go Live:
- [ ] Announce stream start in community channels
- [ ] Monitor chat for engagement
- [ ] Check viewer count in real-time
- [ ] Keep stream running for scheduled duration
```

## Asset Checklist

- [ ] SQL Migration Applied
  - File: `supabase/migrations/052_lms_educators_adilson_liliana.sql`
  - Status: `supabase db push`

- [ ] Avatar Images Generated
  - [ ] adilson-araujo/avatar.jpg (500x500)
  - [ ] liliana-faria/avatar.jpg (500x500)

- [ ] Cover Images Generated
  - [ ] adilson-araujo/cover.jpg (1500x400)
  - [ ] liliana-faria/cover.jpg (1500x400)

- [ ] Thumbnails Generated
  - [ ] adilson-araujo/thumbnail.jpg (300x300)
  - [ ] liliana-faria/thumbnail.jpg (300x300)

- [ ] Design Assets Created
  - [ ] adilson-araujo/overlay.png (1280x720)
  - [ ] liliana-faria/overlay.png (1280x720)
  - [ ] liliana-faria/intervalo-screen.png (1280x720)

- [ ] OBS Templates Ready
  - [ ] adilson-araujo/obs-template.json ✓
  - [ ] liliana-faria/obs-template.json ✓

- [ ] Supabase Storage Uploads Complete
  - [ ] All JPG/PNG files uploaded to mtm-public/educadores/
  - [ ] URLs verified and working

- [ ] Database Updates Complete
  - [ ] avatar_url fields updated
  - [ ] stream_key_fixed verified for both educators

- [ ] Educator Notifications Sent
  - [ ] Welcome email sent to adilson@morethanmoney.pt
  - [ ] Welcome email sent to liliana@morethanmoney.pt
  - [ ] OBS templates delivered

- [ ] First Stream Scheduled
  - [ ] Date & time confirmed
  - [ ] Community notified
  - [ ] Educator onboarding call completed

## Troubleshooting

### Stream Key Issues
```sql
-- Regenerate stream_key_fixed if needed
UPDATE public.lms_educators
SET stream_key_fixed = concat('mtm_edu_', replace(id::text, '-', ''), '_', substring(replace(gen_random_uuid()::text, '-', '') from 1 for 10))
WHERE email = '[educator-email]';
```

### Password Reset
```sql
-- Ensure educator can reset password via UI
-- If no reset flow exists, create token-based reset
-- Contact: [your-auth-team]
```

### Avatar URL Issues
```sql
-- Verify asset URLs
SELECT 
  display_name,
  avatar_url
FROM public.lms_educators
WHERE email IN ('adilson@morethanmoney.pt', 'liliana@morethanmoney.pt');

-- Test URL in browser to confirm it returns 200 OK
```

## References

- **LMS Schema:** `supabase/migrations/008_live_sessions_lms.sql`
- **Educator Fields:** `supabase/migrations/010_lms_lobby_educator_fields.sql`
- **Asset Manifest:** `public/assets/educadores/educators-manifest.json`
- **OBS Templates:** `public/assets/educadores/[slug]/obs-template.json`

---

**Status:** Ready for Deployment
**Last Updated:** 2024-06-23
**Maintained By:** Community Manager (Ricardo)
