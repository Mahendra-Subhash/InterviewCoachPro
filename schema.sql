-- Interview Coach Pro Database Architecture Setup
-- Run this in your Supabase SQL Editor to initialize or repair your tables.

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. Create users table
-- ==========================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================
-- 2. Create interviews table
-- ==========================================
CREATE TABLE IF NOT EXISTS interviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT,
    difficulty TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================
-- 3. Create chat_sessions table
-- ==========================================
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================
-- 4. Create chat_messages table
-- ==========================================
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'model', 'assistant')),
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================
-- 5. Create feedback table (with nullable FK to interviews)
-- ==========================================
CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id UUID REFERENCES interviews(id) ON DELETE SET NULL, -- nullable to permit generic feedback
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    feedback TEXT,
    score INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================
-- 6. Indexes for Optimization
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at ON chat_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interviews_user_id ON interviews(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_interview_id ON feedback(interview_id);

-- ==========================================
-- 7. Row Level Security (RLS) Configuration
-- ==========================================

-- Enable Row Level Security on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to prevent conflicts on rerun
DROP POLICY IF EXISTS "Allow public select users" ON users;
DROP POLICY IF EXISTS "Allow public insert users" ON users;
DROP POLICY IF EXISTS "Allow public select interviews" ON interviews;
DROP POLICY IF EXISTS "Allow public insert interviews" ON interviews;
DROP POLICY IF EXISTS "Allow public select chat_sessions" ON chat_sessions;
DROP POLICY IF EXISTS "Allow public insert chat_sessions" ON chat_sessions;
DROP POLICY IF EXISTS "Allow public update chat_sessions" ON chat_sessions;
DROP POLICY IF EXISTS "Allow public delete chat_sessions" ON chat_sessions;
DROP POLICY IF EXISTS "Allow public select chat_messages" ON chat_messages;
DROP POLICY IF EXISTS "Allow public insert chat_messages" ON chat_messages;
DROP POLICY IF EXISTS "Allow public delete chat_messages" ON chat_messages;
DROP POLICY IF EXISTS "Allow public select feedback" ON feedback;
DROP POLICY IF EXISTS "Allow public insert feedback" ON feedback;

-- 7.1 Policies for users table
CREATE POLICY "Allow public select users" ON users FOR SELECT USING (true);
CREATE POLICY "Allow public insert users" ON users FOR INSERT WITH CHECK (true);

-- 7.2 Policies for interviews table
CREATE POLICY "Allow public select interviews" ON interviews FOR SELECT USING (true);
CREATE POLICY "Allow public insert interviews" ON interviews FOR INSERT WITH CHECK (true);

-- 7.3 Policies for chat_sessions table
CREATE POLICY "Allow public select chat_sessions" ON chat_sessions FOR SELECT USING (true);
CREATE POLICY "Allow public insert chat_sessions" ON chat_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update chat_sessions" ON chat_sessions FOR UPDATE USING (true);
CREATE POLICY "Allow public delete chat_sessions" ON chat_sessions FOR DELETE USING (true);

-- 7.4 Policies for chat_messages table
CREATE POLICY "Allow public select chat_messages" ON chat_messages FOR SELECT USING (true);
CREATE POLICY "Allow public insert chat_messages" ON chat_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete chat_messages" ON chat_messages FOR DELETE USING (true);

-- 7.5 Policies for feedback table
CREATE POLICY "Allow public select feedback" ON feedback FOR SELECT USING (true);
CREATE POLICY "Allow public insert feedback" ON feedback FOR INSERT WITH CHECK (true);
