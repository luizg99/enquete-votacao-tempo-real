-- =============================================================================
-- Migração 006 — Cadastro do votante no fluxo legacy /vote
-- =============================================================================
-- Mesma ideia da tabela `participants` (que vive em executions),
-- porém vinculada diretamente a uma survey, sem passar por execução.
-- =============================================================================

create table if not exists public.survey_voters (
  id text primary key,
  survey_id text not null references public.surveys(id) on delete cascade,
  device_id text not null,
  company text not null default '',
  full_name text not null default '',
  phone text not null default '',
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (survey_id, device_id)
);

create index if not exists idx_survey_voters_survey on public.survey_voters(survey_id);

alter table public.votes
  add column if not exists voter_id text references public.survey_voters(id) on delete set null;

create index if not exists idx_votes_voter on public.votes(voter_id);

alter table public.survey_voters enable row level security;
drop policy if exists "anon_all" on public.survey_voters;
create policy "anon_all" on public.survey_voters for all using (true) with check (true);

alter publication supabase_realtime add table public.survey_voters;
