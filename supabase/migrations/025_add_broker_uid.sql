-- Add broker_uid column to profiles table
-- Stores the user's TMGM account number (UID)
-- Required to access Trade Ideas and Premium Ideas channels

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS broker_uid TEXT;

-- Index for admin queries filtering by broker presence
CREATE INDEX IF NOT EXISTS idx_profiles_broker_uid ON profiles (broker_uid)
  WHERE broker_uid IS NOT NULL;

COMMENT ON COLUMN profiles.broker_uid IS 'TMGM broker account number (UID). Required for Trade Ideas channel access.';
