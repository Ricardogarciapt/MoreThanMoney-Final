-- Create table for AI events tracking
CREATE TABLE IF NOT EXISTS ai_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  context JSONB DEFAULT '{}',
  ai_feature TEXT,
  response_time INTEGER,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_ai_events_user_id ON ai_events(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_events_event_type ON ai_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ai_events_created_at ON ai_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_events_ai_feature ON ai_events(ai_feature);

-- Enable RLS
ALTER TABLE ai_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own events
CREATE POLICY "Users can view own AI events" ON ai_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own events
CREATE POLICY "Users can insert own AI events" ON ai_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Admins can view all events
CREATE POLICY "Admins can view all AI events" ON ai_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'admin'
    )
  );




