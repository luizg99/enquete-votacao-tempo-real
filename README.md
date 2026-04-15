# Task Question — Enquete/Votação em Tempo Real

App de enquetes e votação com resultados em tempo real. Stack:

- **Next.js 15** (App Router, static export para GitHub Pages)
- **TypeScript**
- **Supabase** (Postgres + Realtime) como backend
- **qrcode** (client-side) para gerar os QR codes

---

## Pré-requisitos

- Node.js 20+
- Uma conta gratuita em https://supabase.com

---

## 1. Configurar o Supabase

1. Em https://app.supabase.com → **New project**. Escolha nome, região (São Paulo) e senha.
2. No painel do projeto → **SQL Editor** → **New query** → cole o conteúdo de [supabase/schema.sql](supabase/schema.sql) → **Run**. Isso cria tabelas, RLS e habilita Realtime.
3. Em **Project Settings → API**, copie:
   - `Project URL`
   - `anon public key`

## 2. Rodar localmente

```bash
cp .env.example .env.local
# edite .env.local com a URL e a anon key do Supabase
npm install
npm run dev
```

Abra http://localhost:3000 — a home redireciona para `/admin`.

## 3. Deploy no GitHub Pages

Em **Settings → Secrets and variables → Actions** do repositório, adicione:

| Nome | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do seu projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |

Em **Settings → Pages → Source**, selecione **GitHub Actions**.

Faça push para `main` — o workflow `.github/workflows/deploy.yml` builda (`next build` com `output: 'export'`) e publica em:

https://luizg99.github.io/enquete-votacao-tempo-real/

---

## Rotas

| Rota | Propósito |
|---|---|
| `/admin` | CRUD de enquetes, Lista enquetes, botões QR e Acompanhar|
| `/vote?id=<srv>` | Usuário responde (alvo do QR) |
| `/qr?id=<srv>` | QR em tela cheia |
| `/track?id=<srv>` | Dashboard com gráficos em tempo real |

IDs vão em query string em vez de path param porque static export não pré-gera rotas dinâmicas criadas em runtime.

---

## Arquitetura

```
app/            # páginas (App Router)
components/     # componentes React client
lib/
  supabase.ts   # cliente Supabase (singleton)
  store.ts      # CRUD + subscriptions realtime
  types.ts      # tipos compartilhados
supabase/
  schema.sql    # SQL completo: tabelas, RLS, realtime, view tally
```

### Tempo real

O dashboard se inscreve em `postgres_changes` da tabela `votes` (e `surveys/questions/answers` para refletir edições). A atualização é instantânea, sem polling.

### Segurança

Para MVP, RLS permite CRUD anônimo em todas as tabelas — é um app público de enquete. Para restringir o admin depois, adicione autenticação Supabase e troque as policies por `using (auth.uid() = owner_id)`.

---

## Limitações conhecidas

- Não há controle de voto duplicado: o mesmo usuário pode votar várias vezes (não há fingerprinting nem auth). Para evitar, adicione um cookie/localStorage check + constraint única em `(survey_id, question_id, voter_fingerprint)`.
- Admin sem autenticação: qualquer visitante pode criar/editar/excluir enquetes.
