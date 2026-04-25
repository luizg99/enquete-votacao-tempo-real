-- =============================================================================
-- Migração 003 — Módulo de Execuções + Branding (logo)
-- =============================================================================
-- Cole no SQL Editor do Supabase e clique em Run.
-- =============================================================================

-- --------------------------------------------------------------
-- Tabelas
-- --------------------------------------------------------------
create table if not exists public.executions (
  id text primary key,
  survey_id text not null references public.surveys(id) on delete restrict,
  title text not null default '',
  status text not null default 'draft' check (status in ('draft','running','finished')),
  current_question_id text references public.questions(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.participants (
  id text primary key,
  execution_id text not null references public.executions(id) on delete cascade,
  device_id text not null,
  company text not null default '',
  full_name text not null default '',
  phone text not null default '',
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (execution_id, device_id)
);

create table if not exists public.execution_responses (
  id bigserial primary key,
  execution_id text not null references public.executions(id) on delete cascade,
  participant_id text not null references public.participants(id) on delete cascade,
  question_id text not null references public.questions(id) on delete cascade,
  answer_id text not null references public.answers(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (execution_id, participant_id, question_id, answer_id)
);

create table if not exists public.branding (
  id int primary key default 1 check (id = 1),
  logo_url text,
  updated_at timestamptz not null default now()
);
insert into public.branding (id) values (1) on conflict do nothing;

create index if not exists idx_executions_survey on public.executions(survey_id);
create index if not exists idx_participants_exec on public.participants(execution_id);
create index if not exists idx_responses_exec on public.execution_responses(execution_id);
create index if not exists idx_responses_part_q on public.execution_responses(participant_id, question_id);

-- --------------------------------------------------------------
-- RLS — anon liberado (mantém padrão MVP do projeto)
-- --------------------------------------------------------------
alter table public.executions           enable row level security;
alter table public.participants         enable row level security;
alter table public.execution_responses  enable row level security;
alter table public.branding             enable row level security;

drop policy if exists "anon_all" on public.executions;
drop policy if exists "anon_all" on public.participants;
drop policy if exists "anon_all" on public.execution_responses;
drop policy if exists "anon_all" on public.branding;

create policy "anon_all" on public.executions          for all using (true) with check (true);
create policy "anon_all" on public.participants        for all using (true) with check (true);
create policy "anon_all" on public.execution_responses for all using (true) with check (true);
create policy "anon_all" on public.branding            for all using (true) with check (true);

-- --------------------------------------------------------------
-- Realtime
-- --------------------------------------------------------------
alter publication supabase_realtime add table public.executions;
alter publication supabase_realtime add table public.participants;
alter publication supabase_realtime add table public.execution_responses;
alter publication supabase_realtime add table public.branding;

-- --------------------------------------------------------------
-- View de tally por execução
-- --------------------------------------------------------------
create or replace view public.execution_tally as
select
  er.execution_id,
  a.question_id,
  a.id as answer_id,
  a.text as answer_text,
  count(er.id) as votes
from public.answers a
left join public.execution_responses er on er.answer_id = a.id
group by er.execution_id, a.question_id, a.id, a.text;

grant select on public.execution_tally to anon, authenticated;

-- --------------------------------------------------------------
-- RPC: troca atomicamente a resposta de uma pergunta (escolha única)
-- --------------------------------------------------------------
create or replace function public.set_single_response(
  p_exec text,
  p_part text,
  p_q text,
  p_a text
) returns void as $$
begin
  delete from public.execution_responses
   where execution_id = p_exec
     and participant_id = p_part
     and question_id = p_q;

  insert into public.execution_responses (execution_id, participant_id, question_id, answer_id)
  values (p_exec, p_part, p_q, p_a);
end;
$$ language plpgsql security definer;

grant execute on function public.set_single_response(text, text, text, text) to anon, authenticated;

-- --------------------------------------------------------------
-- Storage: bucket público "branding" para a logo
-- --------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do update set public = true;

drop policy if exists "branding_read"   on storage.objects;
drop policy if exists "branding_insert" on storage.objects;
drop policy if exists "branding_update" on storage.objects;
drop policy if exists "branding_delete" on storage.objects;

create policy "branding_read"   on storage.objects for select using (bucket_id = 'branding');
create policy "branding_insert" on storage.objects for insert with check (bucket_id = 'branding');
create policy "branding_update" on storage.objects for update using (bucket_id = 'branding') with check (bucket_id = 'branding');
create policy "branding_delete" on storage.objects for delete using (bucket_id = 'branding');
