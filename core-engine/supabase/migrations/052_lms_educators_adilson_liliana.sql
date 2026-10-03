-- Insert Adilson Araujo (Mindset Educator)
insert into public.lms_educators (
  email,
  display_name,
  password_hash,
  academy_id,
  bio,
  specialty,
  avatar_url,
  is_active
)
values (
  'adilson@morethanmoney.pt',
  'Adilson Araujo',
  crypt('TempPassword2024!Adilson', gen_salt('bf')),
  (select id from public.lms_academies where slug = 'mindset'),
  'Especialista em Psicologia do Trading, Mentalidade Empreendedora e Coaching de Performance. Dedico-me a ajudar traders e empreendedores a desenvolver resiliência mental, disciplina e controlo emocional para atingir resultados consistentes.',
  'Psicologia Trading',
  'https://storage.supabase.co/mtm-public/educadores/adilson-araujo/avatar.jpg',
  true
)
on conflict (email) do nothing;

-- Insert Liliana Faria (Social Media Educator)
insert into public.lms_educators (
  email,
  display_name,
  password_hash,
  academy_id,
  bio,
  specialty,
  avatar_url,
  is_active
)
values (
  'liliana@morethanmoney.pt',
  'Liliana Faria',
  crypt('TempPassword2024!Liliana', gen_salt('bf')),
  (select id from public.lms_academies where slug = 'social-media'),
  'Especialista em Construção de Audiência Autêntica, Personal Branding e Criação de Micro-Produtos Digitais. Ajudo criadores a monetizar sua audiência através de estratégias de conteúdo escaláveis e high-converting.',
  'Redes Sociais',
  'https://storage.supabase.co/mtm-public/educadores/liliana-faria/avatar.jpg',
  true
)
on conflict (email) do nothing;
