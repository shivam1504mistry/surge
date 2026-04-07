-- =============================================================================
-- Surge — Supabase Database Schema
-- Run this in the Supabase SQL editor to set up all tables.
-- RLS is enabled on every table: users can only access their own data.
-- =============================================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- =============================================================================
-- USERS
-- =============================================================================
create table if not exists public.users (
  id                    uuid primary key references auth.users(id) on delete cascade,
  phone                 text unique not null,
  name                  text,
  age                   int,
  sex                   text check (sex in ('male','female','other')),
  weight_kg             numeric,
  height_cm             numeric,
  body_fat_pct          numeric,
  goal                  text check (goal in ('fat_loss','muscle_gain','recomp','maintain','performance')),
  unit_pref             text not null default 'kg' check (unit_pref in ('kg','lbs')),
  calorie_target        int,
  protein_target_g      int,
  carbs_target_g        int,
  fat_target_g          int,
  tier                  text not null default 'free' check (tier in ('free','pro')),
  accountability_name   text,
  accountability_phone  text,
  accountability_freq   text check (accountability_freq in ('daily','weekly','after_each')),
  created_at            timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "Users can view own profile"
  on public.users for select using (auth.uid() = id);

create policy "Users can update own profile"
  on public.users for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.users for insert with check (auth.uid() = id);

-- =============================================================================
-- WORKOUT SESSIONS
-- =============================================================================
create table if not exists public.workout_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  name              text not null,
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  duration_seconds  int,
  calories_burned   int,
  source            text not null default 'manual' check (source in ('manual','health_auto','voice')),
  health_workout_id text,
  notes             text,
  created_at        timestamptz not null default now()
);

alter table public.workout_sessions enable row level security;

create policy "Users can manage own sessions"
  on public.workout_sessions for all using (auth.uid() = user_id);

-- =============================================================================
-- WORKOUT SETS
-- =============================================================================
create table if not exists public.workout_sets (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id    text not null,
  exercise_name  text not null,
  set_number     int not null,
  reps           int not null,
  weight_kg      numeric not null,
  rpe            int check (rpe between 1 and 10),
  is_pr          boolean not null default false,
  input_source   text not null default 'tap' check (input_source in ('tap','voice','template')),
  logged_at      timestamptz not null default now()
);

alter table public.workout_sets enable row level security;

create policy "Users can manage own sets"
  on public.workout_sets for all
  using (
    auth.uid() = (
      select user_id from public.workout_sessions where id = session_id
    )
  );

-- =============================================================================
-- FOOD ENTRIES
-- =============================================================================
create table if not exists public.food_entries (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  logged_date    date not null,
  meal_slot      text not null check (meal_slot in ('breakfast','lunch','dinner','snacks')),
  food_name      text not null,
  calories       int not null,
  protein_g      numeric not null,
  carbs_g        numeric not null,
  fat_g          numeric not null,
  serving_size   numeric not null default 1,
  serving_unit   text not null default 'g',
  source         text not null default 'search' check (source in ('search','barcode','voice','image_ai')),
  ai_confidence  text check (ai_confidence in ('high','medium','low')),
  off_food_id    text,
  logged_at      timestamptz not null default now()
);

alter table public.food_entries enable row level security;

create policy "Users can manage own food entries"
  on public.food_entries for all using (auth.uid() = user_id);

-- =============================================================================
-- WORKOUT TEMPLATES
-- =============================================================================
create table if not exists public.workout_templates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  name       text not null,
  exercises  jsonb not null default '[]',
  created_at timestamptz not null default now()
);

alter table public.workout_templates enable row level security;

create policy "Users can manage own templates"
  on public.workout_templates for all using (auth.uid() = user_id);

-- =============================================================================
-- CUSTOM EXERCISES
-- =============================================================================
create table if not exists public.custom_exercises (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  name         text not null,
  muscle_group text,
  equipment    text,
  created_at   timestamptz not null default now()
);

alter table public.custom_exercises enable row level security;

create policy "Users can manage own custom exercises"
  on public.custom_exercises for all using (auth.uid() = user_id);

-- =============================================================================
-- USEFUL INDEXES
-- =============================================================================
create index if not exists idx_workout_sessions_user_date
  on public.workout_sessions(user_id, started_at desc);

create index if not exists idx_food_entries_user_date
  on public.food_entries(user_id, logged_date desc);

create index if not exists idx_workout_sets_session
  on public.workout_sets(session_id);
