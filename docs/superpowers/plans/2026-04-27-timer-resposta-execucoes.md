# Timer de resposta nas execuções — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar limite de tempo por pergunta nas execuções ao vivo, com countdown sincronizado entre admin e clientes via timestamp do servidor, bloqueando respostas após expiração.

**Architecture:** Coluna `time_per_question` em `surveys` define o limite. Tabela `execution_question_states` registra `started_at` por (execução, pergunta), persistido entre navegações. RPCs `set_current_question` (auto-inicia timer) e `restart_current_question_timer` (admin reseta) mantêm a fonte da verdade no servidor. Cliente computa `restantes` localmente via `setInterval` de 200ms. Validação server-side em todas as RPCs de resposta via helper `_check_response_time`.

**Tech Stack:** Next.js 15 (App Router, static export), TypeScript, Supabase (Postgres + Realtime), CSS puro.

**Spec:** [docs/superpowers/specs/2026-04-27-timer-resposta-execucoes-design.md](../specs/2026-04-27-timer-resposta-execucoes-design.md)

---

## Estrutura de arquivos

**Criados:**
- `supabase/migrations/007_question_timer.sql` — DDL + RPCs + grants
- `components/Timer.tsx` — componente reutilizável de countdown

**Modificados:**
- `lib/types.ts` — `Survey.time_per_question`, `ExecutionQuestionState`
- `lib/store.ts` — normalize/update `time_per_question` em Survey
- `lib/executions.ts` — RPC `set_current_question`, `restart_current_question_timer`, `add_multi_response`, `remove_multi_response`; subscribe/list de `execution_question_states`
- `components/SurveyEditor.tsx` — input "Tempo de resposta"
- `components/RunPanel.tsx` — Timer + botão "Reiniciar timer" + subscription
- `components/JoinFlow.tsx` — Timer (small) + bloqueio de inputs + mapeamento de erros
- `app/globals.css` — estilos do Timer (cores, animações)

**Sem alterações:**
- Rotas legadas (`/vote`, `/track`, `/qr`)
- Tabelas/colunas existentes (apenas adições)

---

## Notas para o implementador

- O projeto **não tem suite de testes** — a verificação de cada task é via `npx tsc --noEmit` (typecheck) e `npm run build` quando relevante. Validação funcional ao final do plano (Task 12).
- Migrations precisam ser **aplicadas manualmente** no SQL Editor do Supabase. A criação do arquivo é feita por mim; aplicar é passo do usuário antes do smoke test.
- Cada task termina com **um commit**. Mensagens em português curtas, sem emojis, com `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` no rodapé.
- Sempre rodar typecheck antes de commitar; se quebrar, corrigir antes.

---

## Task 1: Migration SQL

**Files:**
- Create: `supabase/migrations/007_question_timer.sql`

- [ ] **Step 1: Criar a migration**

Conteúdo do arquivo:

```sql
-- =============================================================================
-- Migração 007 — Timer de resposta nas execuções
-- =============================================================================

-- 1) Tempo limite por pergunta na enquete (segundos)
alter table public.surveys
  add column if not exists time_per_question int not null default 60
  check (time_per_question >= 5 and time_per_question <= 3600);

-- 2) Estado do timer por pergunta dentro da execução
create table if not exists public.execution_question_states (
  execution_id text not null references public.executions(id) on delete cascade,
  question_id  text not null references public.questions(id) on delete cascade,
  started_at   timestamptz not null default now(),
  primary key (execution_id, question_id)
);

create index if not exists idx_eqs_exec on public.execution_question_states(execution_id);

alter table public.execution_question_states enable row level security;
drop policy if exists "anon_all" on public.execution_question_states;
create policy "anon_all" on public.execution_question_states
  for all using (true) with check (true);

alter publication supabase_realtime add table public.execution_question_states;

-- 3) RPC: set_current_question — atualiza pergunta atual e inicia timer (idempotente)
create or replace function public.set_current_question(
  p_exec text,
  p_q text
) returns void as $$
begin
  update public.executions set current_question_id = p_q where id = p_exec;
  if p_q is not null then
    insert into public.execution_question_states (execution_id, question_id)
      values (p_exec, p_q)
      on conflict (execution_id, question_id) do nothing;
  end if;
end;
$$ language plpgsql security definer;

grant execute on function public.set_current_question(text, text) to anon, authenticated;

-- 4) RPC: restart_current_question_timer
create or replace function public.restart_current_question_timer(
  p_exec text
) returns void as $$
declare
  q_id text;
begin
  select current_question_id into q_id from public.executions where id = p_exec;
  if q_id is null then return; end if;
  insert into public.execution_question_states (execution_id, question_id, started_at)
    values (p_exec, q_id, now())
  on conflict (execution_id, question_id)
    do update set started_at = now();
end;
$$ language plpgsql security definer;

grant execute on function public.restart_current_question_timer(text) to anon, authenticated;

-- 5) Helper: _check_response_time
create or replace function public._check_response_time(
  p_exec text,
  p_q text
) returns void as $$
declare
  v_started     timestamptz;
  v_time_limit  int;
  v_current_q   text;
begin
  select current_question_id into v_current_q from public.executions where id = p_exec;
  if v_current_q is null or v_current_q != p_q then
    raise exception 'Esta pergunta não está ativa';
  end if;

  select s.started_at, sv.time_per_question
    into v_started, v_time_limit
    from public.execution_question_states s
    join public.executions e on e.id = s.execution_id
    join public.surveys    sv on sv.id = e.survey_id
   where s.execution_id = p_exec and s.question_id = p_q;

  if v_started is null then
    raise exception 'Timer não iniciado para esta pergunta';
  end if;

  if now() > v_started + (v_time_limit || ' seconds')::interval then
    raise exception 'Tempo esgotado para esta pergunta';
  end if;
end;
$$ language plpgsql security definer;

-- 6) Atualizar set_single_response — adicionar validação no início
create or replace function public.set_single_response(
  p_exec text,
  p_part text,
  p_q text,
  p_a text
) returns void as $$
begin
  perform public._check_response_time(p_exec, p_q);

  delete from public.execution_responses
   where execution_id = p_exec
     and participant_id = p_part
     and question_id = p_q;

  insert into public.execution_responses (execution_id, participant_id, question_id, answer_id)
  values (p_exec, p_part, p_q, p_a);
end;
$$ language plpgsql security definer;

-- 7) Atualizar set_text_response — adicionar validação no início
create or replace function public.set_text_response(
  p_exec text,
  p_part text,
  p_q text,
  p_text text
) returns void as $$
begin
  perform public._check_response_time(p_exec, p_q);

  delete from public.execution_responses
   where execution_id = p_exec
     and participant_id = p_part
     and question_id = p_q
     and answer_id is null;

  if coalesce(trim(p_text), '') <> '' then
    insert into public.execution_responses
      (execution_id, participant_id, question_id, answer_id, text)
    values (p_exec, p_part, p_q, null, p_text);
  end if;
end;
$$ language plpgsql security definer;

-- 8) Novas RPCs para múltipla escolha (substituem INSERT/DELETE direto do cliente)
create or replace function public.add_multi_response(
  p_exec text, p_part text, p_q text, p_a text
) returns void as $$
begin
  perform public._check_response_time(p_exec, p_q);
  insert into public.execution_responses (execution_id, participant_id, question_id, answer_id)
    values (p_exec, p_part, p_q, p_a)
    on conflict do nothing;
end;
$$ language plpgsql security definer;

grant execute on function public.add_multi_response(text, text, text, text) to anon, authenticated;

create or replace function public.remove_multi_response(
  p_exec text, p_part text, p_q text, p_a text
) returns void as $$
begin
  perform public._check_response_time(p_exec, p_q);
  delete from public.execution_responses
   where execution_id = p_exec and participant_id = p_part
     and question_id = p_q and answer_id = p_a;
end;
$$ language plpgsql security definer;

grant execute on function public.remove_multi_response(text, text, text, text) to anon, authenticated;
```

- [ ] **Step 2: Verificar arquivo gravado**

Run: `ls -la supabase/migrations/007_question_timer.sql`
Expected: arquivo presente, ~5KB

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/007_question_timer.sql
git commit -m "$(cat <<'EOF'
db: migration 007 - timer de resposta nas execuções

Adiciona surveys.time_per_question, tabela
execution_question_states, e RPCs set_current_question,
restart_current_question_timer, add_multi_response,
remove_multi_response. Atualiza set_single_response e
set_text_response para validar tempo via _check_response_time.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Tipos TypeScript

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Adicionar `time_per_question` ao tipo `Survey`**

No arquivo `lib/types.ts`, alterar o tipo `Survey` para incluir o novo campo:

```ts
export type Survey = {
  id: string;
  title: string;
  single_vote_per_device: boolean;
  allow_multiple_choices: boolean;
  time_per_question: number;
  created_at: string;
  questions: Question[];
};
```

- [ ] **Step 2: Adicionar tipo `ExecutionQuestionState`**

Adicionar no final do arquivo, depois de `Branding`:

```ts
export type ExecutionQuestionState = {
  execution_id: string;
  question_id: string;
  started_at: string;
};
```

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: vai dar erro em `lib/store.ts` (normalizeSurvey não popula time_per_question) — esperado, será corrigido na Task 3. Mas não em `lib/types.ts` em si. Outros arquivos podem reclamar; ignore por enquanto.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts
git commit -m "$(cat <<'EOF'
types: adicionar time_per_question e ExecutionQuestionState

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Store — leitura/escrita de `time_per_question`

**Files:**
- Modify: `lib/store.ts`

- [ ] **Step 1: Aceitar `time_per_question` no `updateSurvey`**

Localizar a função `updateSurvey` em `lib/store.ts`. A assinatura atual é:

```ts
export async function updateSurvey(
  id: string,
  patch: Partial<Pick<Survey, 'title' | 'single_vote_per_device' | 'allow_multiple_choices'>>
) {
  // ...
}
```

Trocar por:

```ts
export async function updateSurvey(
  id: string,
  patch: Partial<Pick<Survey, 'title' | 'single_vote_per_device' | 'allow_multiple_choices' | 'time_per_question'>>
) {
  const sb = getSupabase();
  const { error } = await sb.from('surveys').update(patch).eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 2: Popular `time_per_question` em `normalizeSurvey`**

Localizar `normalizeSurvey`. Acrescentar a linha ao objeto retornado:

```ts
return {
  id: row.id,
  title: row.title ?? '',
  single_vote_per_device: row.single_vote_per_device ?? true,
  allow_multiple_choices: row.allow_multiple_choices ?? false,
  time_per_question: row.time_per_question ?? 60,
  created_at: row.created_at,
  questions,
};
```

- [ ] **Step 3: Atualizar `createSurvey` para devolver objeto completo**

Localizar `createSurvey`. A função atual faz:

```ts
return { ...(data as any), questions: [] } as Survey;
```

Trocar por:

```ts
return {
  ...(data as any),
  time_per_question: (data as any).time_per_question ?? 60,
  questions: [],
} as Survey;
```

- [ ] **Step 4: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: zero erros relacionados a Survey/time_per_question.

- [ ] **Step 5: Commit**

```bash
git add lib/store.ts
git commit -m "$(cat <<'EOF'
store: ler e atualizar time_per_question em Survey

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Executions — subscribe/list de `execution_question_states`

**Files:**
- Modify: `lib/executions.ts`

- [ ] **Step 1: Importar tipo**

No topo de `lib/executions.ts`, adicionar `ExecutionQuestionState` ao import existente de `./types`:

```ts
import type {
  Execution,
  ExecutionStatus,
  Participant,
  ExecutionResponse,
  ExecutionQuestionState,
  TallyQuestion,
  Survey,
} from './types';
```

- [ ] **Step 2: Adicionar `listQuestionStates` e `subscribeQuestionStates`**

Adicionar essas duas funções no final do arquivo, junto com as outras subscriptions:

```ts
export async function listQuestionStates(
  executionId: string
): Promise<ExecutionQuestionState[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('execution_question_states')
    .select('*')
    .eq('execution_id', executionId);
  if (error) throw error;
  return (data ?? []) as ExecutionQuestionState[];
}

export function subscribeQuestionStates(executionId: string, onChange: () => void) {
  const sb = getSupabase();
  const channel = sb
    .channel(`exec-qstates-${executionId}-${rand()}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'execution_question_states',
        filter: `execution_id=eq.${executionId}`,
      },
      () => onChange()
    )
    .subscribe();
  return () => { sb.removeChannel(channel); };
}
```

`rand()` já existe no arquivo (criada na correção do bug do channel cache).

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: zero erros.

- [ ] **Step 4: Commit**

```bash
git add lib/executions.ts
git commit -m "$(cat <<'EOF'
executions: subscribe/list de execution_question_states

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Executions — `setCurrentQuestion` via RPC + `restartCurrentQuestionTimer`

**Files:**
- Modify: `lib/executions.ts`

- [ ] **Step 1: Trocar `setCurrentQuestion` para usar RPC**

Localizar a função `setCurrentQuestion`. Atual:

```ts
export async function setCurrentQuestion(id: string, questionId: string | null) {
  await updateExecution(id, { current_question_id: questionId });
}
```

Trocar por:

```ts
export async function setCurrentQuestion(id: string, questionId: string | null) {
  const sb = getSupabase();
  const { error } = await sb.rpc('set_current_question', {
    p_exec: id,
    p_q: questionId,
  });
  if (error) throw error;
}
```

- [ ] **Step 2: Ajustar `startExecution` para usar `setCurrentQuestion`**

Localizar `startExecution`. Atual:

```ts
export async function startExecution(id: string): Promise<Execution> {
  const exec = await getExecution(id);
  if (!exec) throw new Error('Execução não encontrada');
  const firstQuestion = exec.survey?.questions?.[0]?.id ?? null;
  const patch: any = { status: 'running' as ExecutionStatus };
  if (!exec.started_at) patch.started_at = new Date().toISOString();
  if (!exec.current_question_id && firstQuestion) patch.current_question_id = firstQuestion;
  await updateExecution(id, patch);
  return { ...exec, ...patch };
}
```

Trocar por:

```ts
export async function startExecution(id: string): Promise<Execution> {
  const exec = await getExecution(id);
  if (!exec) throw new Error('Execução não encontrada');
  const firstQuestion = exec.survey?.questions?.[0]?.id ?? null;

  const patch: any = { status: 'running' as ExecutionStatus };
  if (!exec.started_at) patch.started_at = new Date().toISOString();
  await updateExecution(id, patch);

  if (!exec.current_question_id && firstQuestion) {
    await setCurrentQuestion(id, firstQuestion);
  }

  return { ...exec, ...patch, current_question_id: exec.current_question_id ?? firstQuestion };
}
```

- [ ] **Step 3: Adicionar `restartCurrentQuestionTimer`**

Adicionar no arquivo, ao lado de `setCurrentQuestion`:

```ts
export async function restartCurrentQuestionTimer(executionId: string) {
  const sb = getSupabase();
  const { error } = await sb.rpc('restart_current_question_timer', {
    p_exec: executionId,
  });
  if (error) throw error;
}
```

- [ ] **Step 4: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: zero erros.

- [ ] **Step 5: Commit**

```bash
git add lib/executions.ts
git commit -m "$(cat <<'EOF'
executions: setCurrentQuestion via RPC + restartCurrentQuestionTimer

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Executions — multi-choice via RPC

**Files:**
- Modify: `lib/executions.ts`

- [ ] **Step 1: Trocar `addMultiResponse` para RPC**

Localizar `addMultiResponse`. Atual:

```ts
export async function addMultiResponse(
  executionId: string,
  participantId: string,
  questionId: string,
  answerId: string
) {
  return withRetry(async () => {
    const sb = getSupabase();
    const { error } = await sb.from('execution_responses').insert({
      execution_id: executionId,
      participant_id: participantId,
      question_id: questionId,
      answer_id: answerId,
    });
    if (error && (error as any).code !== '23505') throw error;
  });
}
```

Trocar por:

```ts
export async function addMultiResponse(
  executionId: string,
  participantId: string,
  questionId: string,
  answerId: string
) {
  return withRetry(async () => {
    const sb = getSupabase();
    const { error } = await sb.rpc('add_multi_response', {
      p_exec: executionId,
      p_part: participantId,
      p_q: questionId,
      p_a: answerId,
    });
    if (error) throw error;
  });
}
```

- [ ] **Step 2: Trocar `removeMultiResponse` para RPC**

Localizar `removeMultiResponse`. Atual:

```ts
export async function removeMultiResponse(
  executionId: string,
  participantId: string,
  questionId: string,
  answerId: string
) {
  return withRetry(async () => {
    const sb = getSupabase();
    const { error } = await sb
      .from('execution_responses')
      .delete()
      .eq('execution_id', executionId)
      .eq('participant_id', participantId)
      .eq('question_id', questionId)
      .eq('answer_id', answerId);
    if (error) throw error;
  });
}
```

Trocar por:

```ts
export async function removeMultiResponse(
  executionId: string,
  participantId: string,
  questionId: string,
  answerId: string
) {
  return withRetry(async () => {
    const sb = getSupabase();
    const { error } = await sb.rpc('remove_multi_response', {
      p_exec: executionId,
      p_part: participantId,
      p_q: questionId,
      p_a: answerId,
    });
    if (error) throw error;
  });
}
```

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: zero erros.

- [ ] **Step 4: Commit**

```bash
git add lib/executions.ts
git commit -m "$(cat <<'EOF'
executions: multi-choice via RPC com validação de tempo

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: SurveyEditor — input "Tempo de resposta"

**Files:**
- Modify: `components/SurveyEditor.tsx`

- [ ] **Step 1: Adicionar input no cabeçalho da enquete**

Localizar o bloco de toggles `single_vote_per_device` / `allow_multiple_choices` em `SurveyEditor`. Logo antes do primeiro toggle, adicionar:

```tsx
<div style={{ marginTop: 12 }}>
  <label className="muted">Tempo de resposta por pergunta</label>
  <TimePerQuestionInput survey={survey} />
</div>
```

- [ ] **Step 2: Implementar componente `TimePerQuestionInput`**

Adicionar no final do arquivo, junto com os outros inputs auxiliares (após `AnswerTextInput`):

```tsx
function TimePerQuestionInput({ survey }: { survey: Survey }) {
  const [value, setValue] = useState(String(survey.time_per_question ?? 60));
  const save = useDebouncedCallback((v: string) => {
    const n = Math.max(5, Math.min(3600, parseInt(v, 10) || 60));
    updateSurvey(survey.id, { time_per_question: n });
  }, 400);

  useEffect(() => {
    setValue(String(survey.time_per_question ?? 60));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [survey.id]);

  return (
    <div className="row" style={{ gap: 8, marginTop: 4 }}>
      <input
        type="number"
        min={5}
        max={3600}
        step={1}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          save(e.target.value);
        }}
        style={{ maxWidth: 120 }}
      />
      <span className="muted">segundos (5–3600)</span>
    </div>
  );
}
```

- [ ] **Step 3: Verificar typecheck e build**

Run: `npx tsc --noEmit && npm run build`
Expected: build limpo, todas as rotas geradas.

- [ ] **Step 4: Commit**

```bash
git add components/SurveyEditor.tsx
git commit -m "$(cat <<'EOF'
SurveyEditor: input tempo de resposta por pergunta

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Componente `Timer.tsx`

**Files:**
- Create: `components/Timer.tsx`

- [ ] **Step 1: Criar arquivo com o componente**

Conteúdo completo:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  startedAt: string | null;
  durationSec: number;
  size: 'large' | 'small';
  onExpiredChange?: (expired: boolean) => void;
};

export function Timer({ startedAt, durationSec, size, onExpiredChange }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [shake, setShake] = useState(false);
  const lastExpiredRef = useRef<boolean | null>(null);
  const lastStartedAtRef = useRef<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  // Reset trackers quando muda startedAt
  useEffect(() => {
    if (lastStartedAtRef.current !== startedAt) {
      lastStartedAtRef.current = startedAt;
      lastExpiredRef.current = null;
      setShake(false);
    }
  }, [startedAt]);

  const startMs = startedAt ? new Date(startedAt).getTime() : 0;
  const totalMs = durationSec * 1000;
  const remainingMs = startedAt ? Math.max(0, totalMs - (now - startMs)) : totalMs;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const expired = startedAt ? remainingMs === 0 : false;
  const pct = totalMs > 0 ? Math.max(0, remainingMs / totalMs) : 1;

  // Notifica transição de estado expirado
  useEffect(() => {
    if (lastExpiredRef.current !== expired) {
      lastExpiredRef.current = expired;
      onExpiredChange?.(expired);
      if (expired) {
        setShake(true);
        const t = setTimeout(() => setShake(false), 600);
        return () => clearTimeout(t);
      }
    }
  }, [expired, onExpiredChange]);

  if (!startedAt) {
    return (
      <div className={`timer timer-${size} timer-idle`}>
        <span className="timer-icon">⏱</span>
        <span className="timer-display">—</span>
      </div>
    );
  }

  let colorClass = 'timer-green';
  if (expired) colorClass = 'timer-expired';
  else if (pct <= 0.25) colorClass = 'timer-red';
  else if (pct <= 0.5) colorClass = 'timer-yellow';

  const criticalClass =
    !expired && remainingSec <= 5 && remainingSec > 0 ? 'timer-critical' : '';
  const shakeClass = shake ? 'timer-shake' : '';

  const mm = Math.floor(remainingSec / 60);
  const ss = remainingSec % 60;
  const display = expired
    ? 'TEMPO ESGOTADO'
    : `${mm}:${ss.toString().padStart(2, '0')}`;

  return (
    <div
      className={`timer timer-${size} ${colorClass} ${criticalClass} ${shakeClass}`}
    >
      <span className="timer-icon">⏱</span>
      <span className="timer-display">{display}</span>
    </div>
  );
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: zero erros.

- [ ] **Step 3: Commit**

```bash
git add components/Timer.tsx
git commit -m "$(cat <<'EOF'
Timer: componente reutilizável de countdown

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: CSS do Timer

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Adicionar estilos no final do arquivo**

Adicionar no final de `app/globals.css`, antes do bloco `@media (max-width: 600px)` final (ou no final mesmo se preferir):

```css
/* ----------------- Timer ----------------- */
.timer {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-radius: 8px;
  font-weight: 600; font-variant-numeric: tabular-nums;
  border: 2px solid currentColor;
  transition: color .25s, background .25s;
}
.timer-large { font-size: 22px; padding: 10px 18px; min-width: 130px; justify-content: center; }
.timer-small { font-size: 14px; padding: 4px 10px; }
.timer-idle    { color: #94a3b8; background: #f8fafc; }
.timer-green   { color: #16a34a; background: #f0fdf4; }
.timer-yellow  { color: #ca8a04; background: #fefce8; }
.timer-red     { color: #dc2626; background: #fef2f2; }
.timer-expired { color: #dc2626; background: #fee2e2; font-weight: 700; }
.timer-critical { animation: timer-pulse 1s infinite; }
.timer-shake    { animation: timer-shake 0.5s ease-in-out; }
.timer-icon { font-size: 0.85em; }

@keyframes timer-pulse {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.06); }
}
@keyframes timer-shake {
  0%, 100% { transform: translateX(0); }
  20%      { transform: translateX(-8px); }
  40%      { transform: translateX(8px); }
  60%      { transform: translateX(-6px); }
  80%      { transform: translateX(6px); }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/globals.css
git commit -m "$(cat <<'EOF'
css: estilos do Timer (cores + animações shake/pulse)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Integrar Timer no `RunPanel`

**Files:**
- Modify: `components/RunPanel.tsx`

- [ ] **Step 1: Importar Timer e novas funções**

No topo do arquivo, no import de `@/lib/executions`, adicionar:

```ts
import {
  getExecution,
  setCurrentQuestion,
  finishExecution,
  tallyExecution,
  countParticipants,
  restartCurrentQuestionTimer,
  listQuestionStates,
  subscribeQuestionStates,
  subscribeExecution,
  subscribeExecutionResponses,
  subscribeParticipants,
} from '@/lib/executions';
```

E adicionar:

```ts
import { Timer } from './Timer';
import type { ExecutionQuestionState } from '@/lib/types';
```

- [ ] **Step 2: Adicionar estado de question_states**

Logo após os useState existentes em `RunPanel`:

```ts
const [questionStates, setQuestionStates] = useState<Map<string, string>>(new Map());

const reloadQuestionStates = async () => {
  try {
    const list = await listQuestionStates(executionId);
    const map = new Map<string, string>();
    list.forEach((s) => map.set(s.question_id, s.started_at));
    setQuestionStates(map);
  } catch {
    // silencioso
  }
};
```

- [ ] **Step 3: Adicionar subscription**

Dentro do `useEffect` principal (que já tem `subscribeExecution` etc.), adicionar:

```ts
const unsubQS = subscribeQuestionStates(executionId, reloadQuestionStates);
```

E no `return` de cleanup desse useEffect, adicionar `unsubQS()`.

Também chamar `reloadQuestionStates()` no início do useEffect (junto do `reload()`).

- [ ] **Step 4: Renderizar Timer no card do gráfico**

Localizar no JSX o bloco que mostra `<div className="run-question-meta">`. Logo antes desse bloco, ou no canto superior direito do `run-graph-inner`, adicionar o Timer:

```tsx
<div className="run-graph-header">
  <div className="run-question-meta">
    Pergunta {currentIdx + 1} de {questions.length}
    {currentQuestion.type === 'text' && ' · dissertativa'}
  </div>
  <Timer
    size="large"
    startedAt={currentQuestion ? questionStates.get(currentQuestion.id) ?? null : null}
    durationSec={exec.survey?.time_per_question ?? 60}
  />
</div>
```

Ajustar o JSX existente para que `run-question-meta` fique dentro de `run-graph-header` (substitui a versão solta).

- [ ] **Step 5: Adicionar botão "Reiniciar timer" no rodapé**

Localizar o bloco `run-footer`. Entre o botão "Próxima pergunta →" e o botão "Finalizar execução", adicionar:

```tsx
<button
  className="btn"
  disabled={!exec.current_question_id || exec.status !== 'running'}
  onClick={async () => {
    if (!confirm('Reiniciar contagem desta pergunta?')) return;
    try {
      await restartCurrentQuestionTimer(executionId);
    } catch (e: any) {
      alert('Erro ao reiniciar: ' + (e.message ?? e));
    }
  }}
>
  ↻ Reiniciar timer
</button>
```

- [ ] **Step 6: Adicionar CSS do `run-graph-header`**

Em `app/globals.css`, adicionar (próximo aos estilos `.run-graph-inner`):

```css
.run-graph-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; margin-bottom: 8px;
}
```

- [ ] **Step 7: Verificar build**

Run: `npx tsc --noEmit && npm run build`
Expected: build limpo.

- [ ] **Step 8: Commit**

```bash
git add components/RunPanel.tsx app/globals.css
git commit -m "$(cat <<'EOF'
RunPanel: timer + botão reiniciar + subscription de states

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Integrar Timer no `JoinFlow`

**Files:**
- Modify: `components/JoinFlow.tsx`

- [ ] **Step 1: Importar Timer e funções**

No topo do arquivo, atualizar o import de `@/lib/executions` para incluir as novas funções:

```ts
import {
  getExecution,
  findParticipant,
  getParticipant,
  createParticipant,
  updateParticipant,
  listResponsesByParticipant,
  setSingleResponse,
  addMultiResponse,
  removeMultiResponse,
  setTextResponse,
  listQuestionStates,
  subscribeQuestionStates,
  subscribeExecution,
  subscribeExecutionResponses,
} from '@/lib/executions';
```

E adicionar:

```ts
import { Timer } from './Timer';
```

- [ ] **Step 2: Adicionar estado e subscription de question_states no `JoinFlow`**

No componente `JoinFlow`, adicionar estado:

```ts
const [questionStates, setQuestionStates] = useState<Map<string, string>>(new Map());
```

Dentro do `useEffect` principal, depois das outras subscriptions, adicionar:

```ts
const reloadQS = async () => {
  try {
    const list = await listQuestionStates(executionId);
    const map = new Map<string, string>();
    list.forEach((s) => map.set(s.question_id, s.started_at));
    setQuestionStates(map);
  } catch {}
};
await reloadQS();
const unsubQS = subscribeQuestionStates(executionId, reloadQS);
```

E no `return` de cleanup, adicionar `unsubQS()`.

- [ ] **Step 3: Passar `questionStates` para `ParticipantVoteScreen`**

No JSX de `JoinFlow`, na chamada de `<ParticipantVoteScreen>`, adicionar a prop:

```tsx
<ParticipantVoteScreen
  execution={exec}
  participant={participant}
  responses={responses}
  setResponses={setResponses}
  questionStates={questionStates}
  onEdit={() => setShowEdit(true)}
  onResponsesChanged={() => reloadResponses(participant.id)}
/>
```

E ajustar a assinatura do componente:

```tsx
function ParticipantVoteScreen({
  execution,
  participant,
  responses,
  setResponses,
  questionStates,
  onEdit,
  onResponsesChanged,
}: {
  execution: Execution;
  participant: Participant;
  responses: ExecutionResponse[];
  setResponses: React.Dispatch<React.SetStateAction<ExecutionResponse[]>>;
  questionStates: Map<string, string>;
  onEdit: () => void;
  onResponsesChanged: () => void;
}) {
```

- [ ] **Step 4: Adicionar estado `expired` no `ParticipantVoteScreen`**

Logo após os outros `useState` do componente:

```ts
const [expired, setExpired] = useState(false);
```

- [ ] **Step 5: Mapear erros de tempo no `handleFailure`**

Substituir o `handleFailure` existente (que só chama `setWarning('Sem conexão estável...')`) por:

```ts
const handleFailure = (e?: any) => {
  const msg = String(e?.message ?? '').toLowerCase();
  if (msg.includes('tempo esgotado')) {
    setWarning('Tempo esgotado para esta pergunta.');
  } else if (msg.includes('não está ativa')) {
    setWarning('Esta pergunta não está mais ativa.');
  } else if (msg.includes('timer não iniciado')) {
    setWarning('Aguardando o anfitrião iniciar a pergunta.');
  } else {
    setWarning('Sem conexão estável. Sua resposta não foi salva — toque novamente.');
  }
  onResponsesChanged();
};
```

Ajustar os `.catch(handleFailure)` existentes para passar o erro: já fazem isso por padrão (passa o argument), mas em `setSingleResponse(...).catch(handleFailure)` o erro chega como `e`. ✓

- [ ] **Step 6: Renderizar Timer e bloquear inputs**

Localizar o bloco que renderiza `<h2>{currentQuestion.text || ...}</h2>` no card da pergunta atual. Logo antes do `<h2>`, adicionar o Timer:

```tsx
<div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
  <Timer
    size="small"
    startedAt={questionStates.get(currentQuestion.id) ?? null}
    durationSec={execution.survey?.time_per_question ?? 60}
    onExpiredChange={setExpired}
  />
</div>
```

Localizar o `<input>` de radio/checkbox dentro do map de `currentQuestion.answers`. Adicionar `disabled={expired}`:

```tsx
<input
  type={multi ? 'checkbox' : 'radio'}
  name={`q-${currentQuestion.id}`}
  checked={isSel}
  disabled={expired}
  onChange={() => (multi ? toggleMulti(a.id) : toggleSingle(a.id))}
/>
```

Ajustar a `<label className={...}>` para também aplicar visual de disabled:

```tsx
<label key={a.id} className={`option${isSel ? ' selected' : ''}${expired ? ' disabled' : ''}`}>
```

Para perguntas tipo texto, localizar o `TextResponseField` e adicionar prop `disabled`. Ajustar a chamada:

```tsx
<TextResponseField
  execution={execution}
  participant={participant}
  currentQuestionId={currentQuestion.id}
  responses={responses}
  setResponses={setResponses}
  disabled={expired}
  onFailure={handleFailure}
/>
```

Ajustar a assinatura do `TextResponseField`:

```tsx
function TextResponseField({
  execution,
  participant,
  currentQuestionId,
  responses,
  setResponses,
  disabled,
  onFailure,
}: {
  execution: Execution;
  participant: Participant;
  currentQuestionId: string;
  responses: ExecutionResponse[];
  setResponses: React.Dispatch<React.SetStateAction<ExecutionResponse[]>>;
  disabled: boolean;
  onFailure: (e?: any) => void;
}) {
```

E no `<textarea>`:

```tsx
<textarea
  className="text-response"
  value={value}
  placeholder="Escreva sua resposta…"
  rows={6}
  readOnly={disabled}
  onChange={(e) => onChange(e.target.value)}
  onBlur={onBlur}
/>
```

Adicionar mensagem inline quando expirado, **logo após a ternária `{isTextQuestion ? <TextResponseField ... /> : <>...</>}` e ainda dentro do `<div className="card">` da pergunta**, para que apareça em ambos os tipos:

```tsx
{expired && (
  <small style={{ display: 'block', marginTop: 8, color: '#dc2626', fontWeight: 500 }}>
    Tempo esgotado — sua última resposta foi registrada
  </small>
)}
```

- [ ] **Step 7: Atualizar `handleFailure` no `TextResponseField`**

A `onFailure` agora recebe o erro. No catch do `setTextResponse(...)` dentro de `TextResponseField`:

```ts
setTextResponse(execution.id, participant.id, currentQuestionId, text)
  .then(() => {
    lastSavedRef.current = text;
    setStatus('saved');
  })
  .catch((e: any) => {
    setStatus('idle');
    onFailure(e);
  });
```

- [ ] **Step 8: Adicionar CSS para `.option.disabled`**

Em `app/globals.css`, próximo aos estilos `.option`:

```css
.option.disabled { opacity: 0.6; cursor: not-allowed; }
.option.disabled:hover { border-color: var(--border); }
```

- [ ] **Step 9: Verificar build**

Run: `npx tsc --noEmit && npm run build`
Expected: build limpo, todas as rotas geradas.

- [ ] **Step 10: Commit**

```bash
git add components/JoinFlow.tsx app/globals.css
git commit -m "$(cat <<'EOF'
JoinFlow: timer + bloqueio de inputs + mapeamento de erros

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Smoke test manual

**Files:** nenhum, validação funcional.

- [ ] **Step 1: Aplicar migration**

Abrir Supabase Dashboard → SQL Editor → New query → colar conteúdo de `supabase/migrations/007_question_timer.sql` → Run. Verificar que retornou sem erros.

- [ ] **Step 2: Iniciar servidor de dev**

Run: `npm run dev`
Expected: servidor sobe em `http://localhost:3000`.

- [ ] **Step 3: Criar enquete de teste**

Abrir `http://localhost:3000/admin` → criar enquete "Timer Test" com 3 perguntas:
- Q1: opções (4 opções)
- Q2: dissertativa (mostrar respostas no painel: ✓)
- Q3: opções com múltipla escolha

Definir tempo de resposta = `30` segundos.

- [ ] **Step 4: Criar e iniciar execução**

Em `/executions` → criar execução vinculada à enquete → clicar "Iniciar".

Em `/executions/run?id=<exec>` deve aparecer:
- Timer no canto superior direito do gráfico mostrando contagem regressiva (`0:30` descendo)
- Verificar que o timer fica verde no início, amarelo aos 15s, vermelho aos 7s, pulsando aos 5s, "TEMPO ESGOTADO" com shake aos 0s

- [ ] **Step 5: Testar cliente**

Abrir 2 abas anônimas, escanear QR (ou abrir `/join?id=<exec>`), preencher cadastros.

Verificar que:
- Timer pequeno aparece no topo do card da pergunta
- Contagem sincronizada com o palco
- Cliente pode votar normalmente enquanto timer roda
- Admin vê o voto chegar em tempo real

- [ ] **Step 6: Testar expiração**

Esperar timer zerar.

Verificar:
- Cliente: animação shake aparece uma vez, display fica em "TEMPO ESGOTADO" vermelho fixo, inputs ficam disabled (radio/checkbox), textarea readOnly, mensagem inline "Tempo esgotado — sua última resposta foi registrada"
- Admin: animação shake no timer grande, display fixo "TEMPO ESGOTADO"
- Tentar votar via DevTools Console (`(await import('@/lib/executions')).setSingleResponse(...)`): deve receber erro "Tempo esgotado para esta pergunta"

- [ ] **Step 7: Testar "Reiniciar timer"**

No painel do admin, clicar "↻ Reiniciar timer" → confirmar.

Verificar:
- Timer volta a 0:30 nas 3 telas
- Cliente: inputs reabilitam, mensagem some
- Cliente pode votar novamente

- [ ] **Step 8: Testar navegação**

Admin clica "Próxima pergunta" → cliente vê Q2 (dissertativa) com timer cheio.
Cliente digita uma resposta, espera salvar.
Timer expira.
Admin clica "← Pergunta anterior" → cliente volta a ver Q1, com timer **expirado** (porque não foi reiniciado).
Admin clica "Próxima" duas vezes para ir para Q3 (multi-choice) → timer cheio.

- [ ] **Step 9: Testar entrada tardia**

Admin clica "← Pergunta anterior" para voltar à Q3 (com algum tempo já decorrido).
Em uma 3ª aba anônima, abrir `/join?id=<exec>` → fazer cadastro.
Verificar que o timer entra rodando do segundo correto (não 0:30 cheio).

- [ ] **Step 10: Testar reload**

Cliente recarrega a página. Verificar que timer continua do segundo correto.

- [ ] **Step 11: Documentar resultado**

Confirmar que todos os 10 passos passaram. Se algum falhou, criar lista de bugs encontrados.

- [ ] **Step 12: Commit final (se houve qualquer ajuste pequeno)**

Se durante o smoke test algum ajuste pequeno foi feito (ex.: classe CSS, mensagem), commit. Senão, pular.

---

## Resumo

12 tasks, ~50 steps, ~10 commits.

**Ordem dos commits:**
1. Migration SQL
2. Tipos TS
3. Store
4. Subscribe states
5. setCurrentQuestion via RPC + restart
6. Multi-choice via RPC
7. SurveyEditor input
8. Timer component
9. CSS Timer
10. RunPanel integration
11. JoinFlow integration
12. (opcional) ajustes do smoke test

**Pré-requisito do usuário:** aplicar `007_question_timer.sql` no Supabase antes de testar.
