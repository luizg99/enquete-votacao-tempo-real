-- =============================================================================
-- Task Question — Schema Supabase
-- =============================================================================
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em "Run".
-- Cria tabelas, índices, policies e habilita Realtime para os votos.
-- =============================================================================

-- --------------------------------------------------------------
-- Tabelas
-- --------------------------------------------------------------
create table if not exists public.surveys (
  id text primary key,
  title text not null default '',
  single_vote_per_device boolean not null default true,
  allow_multiple_choices boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.questions (
  id text primary key,
  survey_id text not null references public.surveys(id) on delete cascade,
  text text not null default '',
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.answers (
  id text primary key,
  question_id text not null references public.questions(id) on delete cascade,
  text text not null default '',
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.votes (
  id bigserial primary key,
  survey_id text not null references public.surveys(id) on delete cascade,
  question_id text not null references public.questions(id) on delete cascade,
  answer_id text not null references public.answers(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_questions_survey on public.questions(survey_id);
create index if not exists idx_answers_question on public.answers(question_id);
create index if not exists idx_votes_survey on public.votes(survey_id);
create index if not exists idx_votes_answer on public.votes(answer_id);

-- --------------------------------------------------------------
-- Row Level Security: liberado para o anon (MVP público)
-- Se precisar restringir admin no futuro, troque por policies
-- baseadas em auth.uid() e adicione tabela de owners.
-- --------------------------------------------------------------
alter table public.surveys   enable row level security;
alter table public.questions enable row level security;
alter table public.answers   enable row level security;
alter table public.votes     enable row level security;

drop policy if exists "anon_all" on public.surveys;
drop policy if exists "anon_all" on public.questions;
drop policy if exists "anon_all" on public.answers;
drop policy if exists "anon_all" on public.votes;

create policy "anon_all" on public.surveys   for all using (true) with check (true);
create policy "anon_all" on public.questions for all using (true) with check (true);
create policy "anon_all" on public.answers   for all using (true) with check (true);
create policy "anon_all" on public.votes     for all using (true) with check (true);

-- --------------------------------------------------------------
-- Realtime: habilita notificação para o cliente se inscrever
-- --------------------------------------------------------------
alter publication supabase_realtime add table public.votes;
alter publication supabase_realtime add table public.surveys;
alter publication supabase_realtime add table public.questions;
alter publication supabase_realtime add table public.answers;

-- --------------------------------------------------------------
-- View auxiliar: contagem agregada por resposta
-- --------------------------------------------------------------
create or replace view public.answer_tally as
select
  a.id        as answer_id,
  a.question_id,
  q.survey_id,
  count(v.id) as votes
from public.answers a
left join public.votes v on v.answer_id = a.id
left join public.questions q on q.id = a.question_id
group by a.id, a.question_id, q.survey_id;

grant select on public.answer_tally to anon, authenticated;
