-- Termer account-owned data model.
-- Run this in the Supabase SQL editor for the project used by VITE_SUPABASE_URL.

create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  first_name text,
  family_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users add column if not exists university_id text;
alter table public.users add column if not exists email_domain text;
alter table public.users add column if not exists needs_manual_review boolean not null default false;
alter table public.users add column if not exists full_name text;
alter table public.users add column if not exists first_name text;
alter table public.users add column if not exists family_name text;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  first_name text,
  family_name text,
  university_id text,
  email_domain text,
  needs_manual_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists family_name text;

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  university_id text not null default 'aub',
  term_id text not null,
  slot integer not null default 1,
  courses jsonb not null default '[]'::jsonb,
  colors jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.schedules add column if not exists university_id text not null default 'aub';
alter table public.schedules add column if not exists colors jsonb not null default '{}'::jsonb;
create unique index if not exists schedules_user_university_slot_term_idx
  on public.schedules(user_id, university_id, slot, term_id);
create index if not exists schedules_user_updated_idx
  on public.schedules(user_id, updated_at desc);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null,
  course jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists favorites_user_course_idx
  on public.favorites(user_id, course_id);
create index if not exists favorites_user_created_idx
  on public.favorites(user_id, created_at desc);

create table if not exists public.planner_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  university_id text not null,
  term_id text not null,
  blocked_times jsonb not null default '[]'::jsonb,
  locked_course_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists planner_settings_user_university_term_idx
  on public.planner_settings(user_id, university_id, term_id);

create table if not exists public.schedule_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  university_id text not null,
  term_id text not null,
  title text not null default 'Shared schedule',
  courses jsonb not null default '[]'::jsonb,
  visibility text not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_shares_visibility_check check (visibility in ('private', 'link'))
);

create table if not exists public.course_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  department text not null,
  course_number text not null,
  rating integer not null,
  difficulty integer not null default 0,
  review text not null default '',
  created_at timestamptz not null default now(),
  constraint course_ratings_rating_check check (rating between 1 and 5),
  constraint course_ratings_difficulty_check check (difficulty between 0 and 5)
);

alter table public.course_ratings add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.course_ratings add column if not exists difficulty integer not null default 0;
alter table public.course_ratings add column if not exists review text not null default '';

create table if not exists public.professor_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  professor_id text not null default '',
  professor_name text not null default '',
  department text not null default '',
  course_number text not null default '',
  rating integer not null,
  difficulty integer not null default 0,
  review text not null default '',
  created_at timestamptz not null default now(),
  constraint professor_ratings_rating_check check (rating between 1 and 5),
  constraint professor_ratings_difficulty_check check (difficulty between 0 and 5)
);

alter table public.professor_ratings add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.professor_ratings add column if not exists professor_id text not null default '';
alter table public.professor_ratings add column if not exists professor_name text not null default '';
alter table public.professor_ratings add column if not exists department text not null default '';
alter table public.professor_ratings add column if not exists course_number text not null default '';
alter table public.professor_ratings add column if not exists difficulty integer not null default 0;
alter table public.professor_ratings add column if not exists review text not null default '';

create unique index if not exists course_ratings_user_course_idx
  on public.course_ratings(user_id, department, course_number);
create index if not exists course_ratings_lookup_idx
  on public.course_ratings(department, course_number, created_at desc);

create unique index if not exists professor_ratings_user_prof_course_idx
  on public.professor_ratings(user_id, professor_id, department, course_number);
create index if not exists professor_ratings_lookup_idx
  on public.professor_ratings(professor_id, created_at desc);
create index if not exists professor_ratings_course_lookup_idx
  on public.professor_ratings(department, course_number, created_at desc);

create table if not exists public.syllabi (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  course_code text not null,
  file_url text not null,
  file_name text not null,
  uploaded_by text not null,
  status text not null default 'pending',
  ai_reason text,
  ai_confidence numeric,
  extracted_text_preview text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint syllabi_status_check check (status in ('pending', 'approved', 'rejected'))
);

alter table public.syllabi add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.syllabi add column if not exists ai_reason text;
alter table public.syllabi add column if not exists ai_confidence numeric;
alter table public.syllabi add column if not exists extracted_text_preview text;
alter table public.syllabi add column if not exists reviewed_at timestamptz;
create index if not exists syllabi_user_created_idx
  on public.syllabi(user_id, created_at desc);
create index if not exists syllabi_course_status_idx
  on public.syllabi(course_code, status, created_at desc);
create index if not exists schedule_shares_user_created_idx
  on public.schedule_shares(user_id, created_at desc);

alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.schedules enable row level security;
alter table public.favorites enable row level security;
alter table public.planner_settings enable row level security;
alter table public.schedule_shares enable row level security;
alter table public.course_ratings enable row level security;
alter table public.professor_ratings enable row level security;
alter table public.syllabi enable row level security;

drop policy if exists "users can read own user row" on public.users;
create policy "users can read own user row" on public.users
  for select using (auth.uid() = id);

drop policy if exists "users can upsert own user row" on public.users;
create policy "users can upsert own user row" on public.users
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "users can manage own profile" on public.profiles;
create policy "users can manage own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "users can manage own schedules" on public.schedules;
create policy "users can manage own schedules" on public.schedules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users can manage own favorites" on public.favorites;
create policy "users can manage own favorites" on public.favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users can manage own planner settings" on public.planner_settings;
create policy "users can manage own planner settings" on public.planner_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users can manage own shares" on public.schedule_shares;
create policy "users can manage own shares" on public.schedule_shares
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "course ratings are readable" on public.course_ratings;
create policy "course ratings are readable" on public.course_ratings
  for select using (true);

drop policy if exists "authenticated users can insert course ratings" on public.course_ratings;
create policy "authenticated users can insert course ratings" on public.course_ratings
  for insert with check (auth.uid()::text = user_id::text);

drop policy if exists "authenticated users can update own course ratings" on public.course_ratings;
create policy "authenticated users can update own course ratings" on public.course_ratings
  for update using (auth.uid()::text = user_id::text) with check (auth.uid()::text = user_id::text);

drop policy if exists "professor ratings are readable" on public.professor_ratings;
create policy "professor ratings are readable" on public.professor_ratings
  for select using (true);

drop policy if exists "authenticated users can insert professor ratings" on public.professor_ratings;
create policy "authenticated users can insert professor ratings" on public.professor_ratings
  for insert with check (auth.uid()::text = user_id::text);

drop policy if exists "authenticated users can update own professor ratings" on public.professor_ratings;
create policy "authenticated users can update own professor ratings" on public.professor_ratings
  for update using (auth.uid()::text = user_id::text) with check (auth.uid()::text = user_id::text);

drop policy if exists "approved syllabi are readable" on public.syllabi;
create policy "approved syllabi are readable" on public.syllabi
  for select using (status = 'approved');

drop policy if exists "authenticated users can upload syllabi metadata" on public.syllabi;
create policy "authenticated users can upload syllabi metadata" on public.syllabi
  for insert with check (auth.uid() is not null and (user_id is null or auth.uid() = user_id));

insert into storage.buckets (id, name, public)
values ('syllabi', 'syllabi', true)
on conflict (id) do update set public = true;

drop policy if exists "syllabi files are publicly readable" on storage.objects;
create policy "syllabi files are publicly readable" on storage.objects
  for select using (bucket_id = 'syllabi');

drop policy if exists "authenticated users can upload syllabus pdfs" on storage.objects;
create policy "authenticated users can upload syllabus pdfs" on storage.objects
  for insert with check (bucket_id = 'syllabi' and auth.uid() is not null);

drop policy if exists "authenticated users can remove rejected syllabus pdfs" on storage.objects;
create policy "authenticated users can remove rejected syllabus pdfs" on storage.objects
  for delete using (bucket_id = 'syllabi' and auth.uid() is not null);
