ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS member_category TEXT DEFAULT 'standard';

CREATE INDEX IF NOT EXISTS idx_profiles_member_category ON public.profiles(member_category);

