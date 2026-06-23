# Liliana Faria - Educator Setup

## Profile

- **Name:** Liliana Faria
- **Email:** liliana@morethanmoney.pt
- **Specialty:** Redes Sociais
- **Academy:** Social Media
- **Bio:** Especialista em Construção de Audiência Autêntica, Personal Branding e Micro-Produtos Digitais

## Assets in This Directory

```
liliana-faria/
├── avatar.jpg (500x500) - Profile picture
├── cover.jpg (1500x400) - Academy cover banner
├── thumbnail.jpg (300x300) - Small profile thumbnail
├── overlay.png (1280x720) - OBS camera overlay (PLACEHOLDER - customize)
├── intervalo-screen.png (1280x720) - Break screen for between segments
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
WHERE email = 'liliana@morethanmoney.pt';
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
| intervalo-screen.png | Placeholder | 🎨 Needs design team customization |
| obs-template.json | Ready | ✅ Can use immediately |

### 5. Avatar Generation Prompt

When creating your avatar, request:
```
Professional avatar for Liliana Faria, social media expert, personal branding coach,
confident friendly smile, modern professional attire, community-focused aesthetic,
vibrant but professional color palette (coral/teal accents), 
high quality lighting, modern minimalist background, 500x500px
```

### 6. First Stream

Pre-stream checklist:
- [ ] OBS configured with stream key
- [ ] Microphone tested (clear audio is critical for social media teaching)
- [ ] Camera positioned at eye level with good lighting
- [ ] Internet speed 5+ Mbps upload
- [ ] Slides/presentation ready
- [ ] Chat browser source working
- [ ] Break screen ready (intervalo-screen.png)

**Start streaming:**
1. Click "Start Streaming" in OBS (Alt+F9)
2. Wait for connection confirmation
3. Verify video/audio quality in dashboard
4. Engage with chat immediately
5. Use break screen between segments

## Hotkeys (OBS)

- **Alt+F9** - Start stream
- **Alt+F10** - Stop stream
- **Alt+1** - Switch to "Stream Workshop" scene (Webcam)
- **Alt+2** - Switch to "Tela de Apresentação" scene (Screen Share)
- **Alt+3** - Switch to "Intervalo" scene (Break Screen)
- **Alt+C** - Toggle chat visibility

## Scenes in OBS

### Scene 1: Stream Workshop
- Primary webcam (1280x720)
- MTM overlay with your branding
- Chat browser source
- **Use for:** Live workshops, Q&A, direct engagement with audience
- **Best for:** Teaching, demonstrations, interactive content

### Scene 2: Tela de Apresentação
- Screen sharing (monitor capture)
- Chat on the right side (240px width)
- Social media statistics overlay
- **Use for:** Presentations, sharing slides, showing real examples
- **Best for:** Case studies, content strategy walkthroughs, growth metrics

### Scene 3: Intervalo
- Static break screen (1280x720 full fill)
- "Intervalo" message with "Volte em breve"
- **Use for:** Between segments, technical breaks
- **Timing:** Use when switching between topics or taking breaks

## Social Media Integration Tips

### Engagement During Streams
- Monitor chat continuously (use scene 1 for maximum engagement)
- Respond to questions in real-time
- Ask polls and questions to audience
- Encourage viewers to comment

### Content Structuring
- 5-10 min: Hook (problem statement, trending topic)
- 15-20 min: Main content (presentation/demonstration)
- 5 min: Break (use intervalo-screen.png)
- 10-15 min: Case study or live example
- 5 min: Q&A with chat engagement

### Post-Stream
- Record automatically in OBS
- Extract clips for short-form content (TikTok, Reels)
- Promote replays on social channels
- Engage with community comments

## Hardware Recommendations

**Microphone:** Critical for clarity
- USB condenser mic (Audio-Technica AT2020, Blue Yeti)
- Avoid laptop built-in microphone
- Test for background noise

**Camera:** 1080p minimum
- Logitech C920 or better
- Mount at eye level
- Ensure good lighting (ring light or window light)

**Internet:** Stable 5+ Mbps upload
- Wired connection preferred
- Test before streaming
- Have backup mobile hotspot

**Slides:** Readable on 1280x720
- Font size 32pt minimum
- High contrast colors
- Avoid thin/light fonts

## Support

For issues or questions:
- Email: support@morethanmoney.pt
- Telegram: [community-link]
- Documentation: [docs-link]

## Password Reset

You received a temporary password in your welcome email. Reset it:
1. Go to https://morethanmoney.pt/lms/educator/login
2. Click "Forgot Password"
3. Enter your email: liliana@morethanmoney.pt
4. Follow reset link
5. Set a secure password

## Analytics

After your first few streams, check:
- Viewer count trends
- Average session duration
- Engagement rate (chat messages per viewer)
- Audience demographics
- Best performing content topics

Share insights with the community team to optimize future streams.

---

**Status:** Ready for First Stream
**Created:** 2024-06-23
