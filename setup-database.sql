-- EduTech Software House Bot - Supabase Database Setup
-- Run this in: Supabase Dashboard > SQL Editor > New Query

-- ─────────────────────────── TABLES ───────────────────────────

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    customer_name TEXT DEFAULT 'Unknown',
    status TEXT DEFAULT 'bot' CHECK (status IN ('bot', 'human')),
    last_message TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
    sender TEXT NOT NULL CHECK (sender IN ('customer', 'bot', 'agent')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────── INDEXES ───────────────────────────

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at);

-- ─────────────────────────── ROW LEVEL SECURITY ───────────────────────────

-- Enable RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Allow anon (webpage) to READ conversations
CREATE POLICY "Allow anon read conversations"
    ON conversations FOR SELECT
    TO anon
    USING (true);

-- Allow anon (webpage) to READ messages
CREATE POLICY "Allow anon read messages"
    ON messages FOR SELECT
    TO anon
    USING (true);

-- Allow anon (webpage) to UPDATE conversations (for handoff toggle)
CREATE POLICY "Allow anon update conversations"
    ON conversations FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true);

-- Allow anon (webpage) to INSERT messages (agent messages from dashboard)
CREATE POLICY "Allow anon insert messages"
    ON messages FOR INSERT
    TO anon
    WITH CHECK (true);

-- Allow anon (webpage) to DELETE messages
CREATE POLICY "Allow anon delete messages"
    ON messages FOR DELETE
    TO anon
    USING (true);

-- Allow anon (webpage) to DELETE conversations
CREATE POLICY "Allow anon delete conversations"
    ON conversations FOR DELETE
    TO anon
    USING (true);

-- Allow authenticated full access
CREATE POLICY "Authenticated full access conversations"
    ON conversations FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Authenticated full access messages"
    ON messages FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- service_role bypasses RLS by default, no policies needed

-- ─────────────────────────── REALTIME ───────────────────────────

-- Enable realtime for live updates on the dashboard
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;

-- ─────────────────────────── DONE ───────────────────────────
-- After running this SQL:
-- 1. Go to Table Editor and verify conversations + messages tables exist
-- 2. Check that Realtime is enabled for both tables (Database > Replication)
-- 3. Your bot should now save data and webpage should display it

-- ─────────────────────────── ADDITIONS ───────────────────────────
-- Run these separately if tables already exist:

-- Add requested_human column for Option 9 tracking
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS requested_human BOOLEAN DEFAULT false;

-- Add message_type and media_url for future voice/media support
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url TEXT DEFAULT NULL;

-- ─────────────────────────── STORAGE BUCKET ───────────────────────────
-- Run this in Supabase SQL Editor to create the storage bucket:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('chat-media', 'chat-media', true)
-- ON CONFLICT (id) DO NOTHING;

-- Allow anon to read from chat-media bucket
CREATE POLICY "Allow anon read chat-media"
    ON storage.objects FOR SELECT
    TO anon
    USING (bucket_id = 'chat-media');

-- Allow anon to upload to chat-media bucket
CREATE POLICY "Allow anon upload chat-media"
    ON storage.objects FOR INSERT
    TO anon
    WITH CHECK (bucket_id = 'chat-media');
