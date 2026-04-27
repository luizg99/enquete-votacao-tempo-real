# Timer de resposta nas execuções — Design

**Status:** aprovado para implementação
**Data:** 2026-04-27

## Objetivo

Adicionar um limite de tempo por pergunta nas **execuções ao vivo** (rotas `/executions/*`). Quando o admin "carrega" uma pergunta no palco, dispara um countdown sincronizado entre o painel do admin e todos os clientes conectados. Ao expirar, o cliente fica bloqueado de responder/alterar — o objetivo final do timer.

A funcionalidade **não afeta** os fluxos legados (`/vote`, `/track`, `/qr`).

## Regras de negócio

1. O tempo é **único por enquete** (campo no cabeçalho do `surveys`), aplicado igualmente a todas as perguntas. Default 60s. Mínimo 5s, máximo 3600s.
2. O tempo é **obrigatório** — não há modo "sem timer".
3. Vale para **todos os tipos de pergunta** (múltipla escolha e dissertativa).
4. **Carregar uma pergunta pela primeira vez** (Iniciar execução, Próxima pergunta) inicia o timer dela.
5. **Voltar para uma pergunta já mostrada** mantém o `started_at` antigo — se o tempo já expirou, continua expirado.
6. **Botão "Reiniciar timer"** atualiza o `started_at` da pergunta atual para `now()`, dando nova chance ao cliente.
7. **Quando o timer chega a 0**, o cliente fica bloqueado de responder. **Não há auto-avanço**: o admin avança manualmente quando quiser.
8. O cliente que entra **depois** do timer começar vê o tempo restante correto (sincronizado com o `started_at`).

## Sincronização — abordagem técnica

**Timestamp absoluto do servidor.** Quando o admin troca/carrega uma pergunta, o Postgres grava `started_at = now()` na tabela de estados. Realtime entrega esse timestamp aos clientes, que computam localmente:

```
restantes = max(0, started_at + time_per_question - now_cliente)
```

Drift entre relógio do cliente e do servidor é tolerável (±1-2s tipicamente em celulares modernos com NTP). Sem broadcast periódico — economiza orçamento de Realtime.

**Validação server-side é a fonte da verdade.** Cliente bloquear é UX; o servidor rejeita respostas após expiração via verificação dentro das RPCs.

## Modelo de dados

### Migration 007

```sql
-- Tempo limite de cada pergunta na enquete (em segundos)
alter table public.surveys
  add column if not exists time_per_question int not null default 60
  check (time_per_question >= 5 and time_per_question <= 3600);

-- Estado do timer por pergunta dentro de cada execução
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
```

### Por que tabela separada e não coluna na `executions`

Uma única `executions.current_question_started_at` falharia ao voltar pergunta — qualquer update reescreveria. A tabela `execution_question_states` registra o `started_at` **por (execução, pergunta)**, persistido entre navegações. Voltar não toca em nada; só "primeira vez mostrando" e "reiniciar timer" gravam.

### Tipos TypeScript

```ts
// lib/types.ts — adicionar campo a Survey e novo tipo
// (Question não muda)

// Em Survey:
//   time_per_question: number;

export type ExecutionQuestionState = {
  execution_id: string;
  question_id: string;
  started_at: string;
};
```

## RPCs

### `set_current_question(p_exec, p_q)`

Atualiza pergunta atual. Insere em `execution_question_states` se for a primeira vez (idempotente).

```sql
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
```

### `restart_current_question_timer(p_exec)`

Atualiza `started_at` da pergunta atual para `now()`.

```sql
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
```

### `_check_response_time(p_exec, p_q)`

Helper interno chamado pelas RPCs de resposta.

```sql
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
```

### Atualizações nas RPCs existentes

`set_single_response` e `set_text_response` ganham `perform _check_response_time(p_exec, p_q);` como primeira instrução.

### Novas RPCs para multi-choice

```sql
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
```

Grants: todas as RPCs ganham `grant execute ... to anon, authenticated`.

## Componentes do frontend

### `lib/executions.ts` — mudanças

- `setCurrentQuestion(execId, questionId)` deixa de fazer update direto, passa a chamar `sb.rpc('set_current_question', ...)`.
- `startExecution(id)` continua existindo, mas internamente usa o novo RPC para definir a primeira pergunta.
- Nova função `restartCurrentQuestionTimer(execId)` chama o RPC homônimo.
- `addMultiResponse` e `removeMultiResponse` migram para os novos RPCs `add_multi_response` / `remove_multi_response`.
- Nova função `subscribeQuestionStates(execId, onChange)` para inscrever em `execution_question_states` filtrado por execução.
- Nova função `listQuestionStates(execId)` para fetch inicial.

### `lib/store.ts` — mudanças

- `updateSurvey` aceita `time_per_question` no patch.
- `normalizeSurvey` lê `time_per_question` (default 60 se ausente).

### `components/SurveyEditor.tsx`

Novo input no cabeçalho da enquete, junto com os toggles existentes:

```tsx
<label className="muted">Tempo de resposta por pergunta</label>
<div className="row">
  <input type="number" min={5} max={3600} step={1}
         value={value} onChange={...} />
  <span className="muted">segundos</span>
</div>
```

Auto-save com debounce 400ms (mesmo padrão dos outros campos). Clamp client-side para 5–3600.

### `components/Timer.tsx` (novo)

Componente reutilizável para admin e cliente.

```tsx
type Props = {
  startedAt: string | null;             // ISO timestamp
  durationSec: number;                   // time_per_question
  size: 'large' | 'small';               // large=palco, small=cliente
  onExpiredChange?: (expired: boolean) => void;  // muda quando cruza 0 ou quando reseta
};
```

Comportamento:
- Tick interno via `setInterval` de 200ms para fluidez visual
- Calcula `restantes = max(0, startedAt_ms + duration*1000 - Date.now())`
- Renderiza sempre no formato `mm:ss` (ex.: `0:05`, `1:30`)
- Classes CSS dinâmicas:
  - `timer-green` (>50% restante)
  - `timer-yellow` (25–50%)
  - `timer-red` (≤25%)
  - `timer-critical` (≤5s, adiciona pulsação CSS)
  - `timer-expired` (=0, adiciona animação shake única ao entrar nesse estado e depois fica fixo)
- Quando `restantes` cruza para 0 ou volta de 0 (admin reiniciou): notifica via `onExpiredChange(boolean)`
- Cleanup do interval no unmount
- O parent (RunPanel/JoinFlow) usa `onExpiredChange` para atualizar seu próprio estado `expired` — não duplica setInterval

### `components/RunPanel.tsx`

- Adiciona estado `questionStates: Map<questionId, started_at>`, populado pelo `subscribeQuestionStates` + `listQuestionStates` no mount
- No `run-graph-inner`, adiciona `<Timer>` no canto superior direito com `size="large"`
- No `run-footer`, adiciona botão "↻ Reiniciar timer" entre os botões de navegação e "Finalizar":
  ```tsx
  <button className="btn" onClick={async () => {
    if (!confirm('Reiniciar contagem desta pergunta?')) return;
    await restartCurrentQuestionTimer(executionId);
  }}>↻ Reiniciar timer</button>
  ```
  Habilitado quando `current_question_id` existe e `status === 'running'`.

### `components/JoinFlow.tsx` (`ParticipantVoteScreen`)

- Adiciona estado `questionStates: Map<questionId, started_at>`, mesma lógica do RunPanel
- Adiciona estado `expired: boolean`, atualizado via callback `onExpiredChange` do Timer
- Quando muda `current_question_id` ou chega novo `started_at`, o Timer recalcula e dispara `onExpiredChange(false)` automaticamente — `expired` volta a `false` sem código adicional
- `<Timer size="small" />` no topo do card da pergunta atual
- Inputs de opção: `disabled={expired}` (radio/checkbox)
- Textarea: `readOnly={expired}`
- Mensagem inline em vermelho quando expirado: *"Tempo esgotado — sua última resposta foi registrada"*
- Tratamento de erro nas chamadas otimistas: se RPC retorna mensagem contendo "Tempo esgotado" ou "Esta pergunta não está ativa", reaproveita `handleFailure` mas com texto específico

### CSS (`app/globals.css`)

Novos estilos para o componente Timer (cores, animação de shake, pulsação no estado crítico).

## Fluxos de erro e edge cases

### Tabela de cenários

| Cenário | Comportamento |
|---|---|
| Cliente perde conexão durante countdown | Continua contando local com `started_at` em memória; ao reconectar Realtime, se houve mudanças, sincroniza |
| Cliente ou admin recarrega a página | Re-fetch do estado, timer continua do segundo correto via `started_at` persistido |
| Admin com 2 abas e clica Próxima nas duas | RPC idempotente (`on conflict do nothing`) — sem corrupção |
| Cliente clica no último segundo, RPC chega expirado | RPC retorna erro, cliente faz rollback otimista + banner |
| Admin avança pergunta antes do RPC do cliente chegar | `_check_response_time` rejeita por `question_id != current` |
| Admin reinicia timer enquanto cliente está respondendo | Cliente recebe novo `started_at`, timer reseta, `expired` volta a `false`, inputs reabilitam |
| Admin altera `time_per_question` durante execução | Cálculo passa a usar novo valor a partir do próximo tick. Aceito como comportamento "ao vivo" |
| Pergunta atual deletada no editor durante execução | FK `on delete set null` zera `current_question_id`, cliente vê "Aguardando próxima pergunta…" |
| Execução antiga (pré-feature) sem entrada em `execution_question_states` | RPC validador rejeita com "Timer não iniciado". Admin precisa clicar "Reiniciar timer" para criar a entrada |

### Fora de escopo (YAGNI)

- Pause manual do timer
- Auto-avanço para próxima pergunta quando expira
- Sincronização explícita de offset cliente/servidor
- Tempo configurável por pergunta individual

## Plano de teste manual

Sem suite automatizada no projeto. Roteiro para validar manualmente:

1. Criar enquete com 3 perguntas (mistura tipos), tempo 30s
2. Iniciar execução, abrir 2 abas de cliente
3. Confirmar countdown sincronizado nas 3 telas
4. Cliente vota antes de expirar → admin vê em tempo real
5. Esperar expirar → cliente vê "TEMPO ESGOTADO", inputs bloqueados, animação shake aparece uma vez
6. Tentar votar após expirar via DevTools → recebe erro "Tempo esgotado"
7. Admin clica "Reiniciar timer" → cliente vê timer voltar e poder mudar resposta
8. Admin clica "Próxima" → todos veem nova pergunta com timer cheio
9. Admin clica "Anterior" → todos veem pergunta anterior expirada
10. Admin reinicia timer da anterior → reseta
11. Cliente recarrega a página → continua de onde estava
12. Cliente abre `/join` 10s após pergunta começar → entra com 20s no display

## Resumo dos arquivos afetados

**Novos:**
- `supabase/migrations/007_question_timer.sql`
- `components/Timer.tsx`

**Modificados:**
- `lib/types.ts` — `Survey.time_per_question`, `ExecutionQuestionState`
- `lib/store.ts` — normalizar/atualizar `time_per_question`
- `lib/executions.ts` — RPCs novas, mudança em `setCurrentQuestion`/`startExecution`/multi-choice, novo `subscribeQuestionStates`
- `components/SurveyEditor.tsx` — input do tempo
- `components/RunPanel.tsx` — Timer + botão Reiniciar + subscription de states
- `components/JoinFlow.tsx` — Timer + bloqueio de inputs + tratamento de erro de tempo
- `app/globals.css` — estilos do Timer

**Sem mudança:**
- Rotas legadas (`/vote`, `/track`, `/qr`) — feature exclusiva de execuções
- Schema das tabelas existentes (apenas adição de coluna em `surveys`)
