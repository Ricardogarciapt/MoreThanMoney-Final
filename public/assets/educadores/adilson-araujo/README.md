# Adilson Araujo - Educator Setup

## Profile

- **Name:** Adilson Araujo
- **Email:** adilson@morethanmoney.pt
- **Specialty:** Psicologia Trading
- **Academy:** Mindset
- **Bio:** Especialista em Psicologia do Trading, Mentalidade Empreendedora e Coaching de Performance

## Assets in This Directory

```
adilson-araujo/
├── avatar.jpg (500x500) - Profile picture
├── cover.jpg (1500x400) - Academy cover banner
├── thumbnail.jpg (300x300) - Small profile thumbnail
├── overlay.png (1280x720) - OBS camera overlay (PLACEHOLDER - customize)
├── obs-template.json - OBS Studio configuration
└── README.md (this file)
```

## Quick Setup

### 1. Database
Migration already applied: `052_lms_educators_adilson_liliana.sql`
- Account created with temporary password
- Stream key auto-generated: `stream_key_fixed`

### 2. Get Your Stream Key
Ask admin or check database:
```sql
SELECT stream_key_fixed FROM public.lms_educators 
WHERE email = 'adilson@morethanmoney.pt';
```

### 3. OBS Configuration
1. Download `obs-template.json`
2. Open OBS Studio
3. File > Import > Select JSON
4. Replace placeholder `STREAM_KEY_FROM_LMS_EDUCATORS` with your actual stream key

### 4. Assets Status

| Asset | Status | Action Required |
|-------|--------|-----------------|
| avatar.jpg | Placeholder | ⏳ Waiting for AI generation |
| cover.jpg | Placeholder | ⏳ Waiting for AI generation |
| thumbnail.jpg | Placeholder | ⏳ Waiting for AI generation |
| overlay.png | Placeholder | 🎨 Needs design team customization |
| obs-template.json | Ready | ✅ Can use immediately |

### 5. Avatar Generation Prompt

When creating your avatar, request:
```
Professional avatar for Adilson Araujo, psychology trading coach, 
confident serious expression, professional attire, mindset-focused aesthetic, 
subtle gold/navy color scheme, high contrast background, 
modern minimalist style, 500x500px
```

### 6. First Stream

Pre-stream checklist:
- [ ] OBS configured with stream key
- [ ] Microphone tested
- [ ] Camera positioned at eye level
- [ ] Lighting adequate
- [ ] Internet speed 5+ Mbps
- [ ] Chat browser source working

**Start streaming:**
1. Click "Start Streaming" in OBS
2. Wait for connection confirmation
3. Verify video/audio in dashboard
4. Begin your session

## Hotkeys (OBS)

- **Alt+F9** - Start stream
- **Alt+F10** - Stop stream
- **Alt+1** - Switch to "Stream Palestra" scene (Webcam)
- **Alt+2** - Switch to "Screen Share + Chat" scene
- **Alt+C** - Toggle chat visibility

## Scenes in OBS

### Scene 1: Stream Palestra
- Primary webcam (1280x720)
- MTM overlay with your branding
- Chat browser source (optional)
- **Use for:** Live lectures, Q&A, direct engagement

### Scene 2: Screen Share + Chat
- Screen sharing (monitor capture)
- Chat on the right side
- **Use for:** Presentations, showing materials, demonstrations

## Support

For issues or questions:
- Email: support@morethanmoney.pt
- Telegram: [community-link]
- Documentation: [docs-link]

## Password Reset

You received a temporary password in your welcome email. Reset it:
1. Go to https://morethanmoney.pt/lms/educator/login
2. Click "Forgot Password"
3. Enter your email: adilson@morethanmoney.pt
4. Follow reset link
5. Set a secure password

---

**Status:** Ready for First Stream
**Created:** 2024-06-23
