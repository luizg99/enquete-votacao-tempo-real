# Login administrativo com senha

**Data:** 2026-04-28
**Status:** Aprovado para implementação

## Problema

Hoje a rota raiz (`/`) redireciona automaticamente para `/admin` ([app/page.tsx:9](../../../app/page.tsx)). Qualquer pessoa que abra o site público cai direto na área de administração — pode criar/editar enquetes, iniciar execuções, alterar logo etc.

Precisamos:

1. Remover esse redirecionamento automático.
2. Proteger as rotas administrativas com senha.
3. Garantir que o hash da senha **não fique exposto no repositório** — quem clonar o repo não deve conseguir descobrir nem reaproveitar o hash para entrar no site público.

## Restrições do ambiente

- App estático (`output: 'export'` em [next.config.mjs](../../../next.config.mjs)), publicado em GitHub Pages.
- Sem backend: toda a verificação de senha roda no navegador.
- Já existe pipeline GitHub Actions ([.github/workflows/deploy.yml](../../../.github/workflows/deploy.yml)) que injeta secrets na build (Supabase URL/Key).

**Limitação fundamental aceita:** quem clonar o repo pode editar o código localmente para remover a verificação. Não há como impedir isso sem backend. O design protege:

- O hash da senha (não fica no repo).
- O acesso ao site público publicado em GitHub Pages.

## Escopo de rotas

### Protegidas (exigem login)

- `/`
- `/admin`
- `/executions`
- `/executions/run/*`
- `/qr/*`
- `/track/*`
- `/EditarLogoSecreta`

### Livres (participantes)

- `/vote/*`
- `/join/*`

## Decisões

### Algoritmo de hash

**PBKDF2-SHA256, 200.000 iterações, salt aleatório de 16 bytes.**

- Usa Web Crypto API (built-in no navegador, sem dependência extra).
- Key-stretching torna força bruta inviável mesmo se o hash vazar.
- Comparação final em tempo constante para evitar timing attacks (mesmo que improváveis em frontend).

Formato canônico do hash (string única):

```
pbkdf2-sha256$200000$<saltBase64>$<hashBase64>
```

### Onde o hash vive

- **GitHub Secret** `ADMIN_AUTH_HASH`.
- O workflow [deploy.yml](../../../.github/workflows/deploy.yml) repassa como `NEXT_PUBLIC_ADMIN_AUTH_HASH` durante a build.
- O hash entra no JS final publicado no GitHub Pages.
- Para desenvolvimento local: cada desenvolvedor define seu próprio hash em `.env.local`.

### Como o hash é gerado

Novo script `scripts/gen-hash.mjs` (Node, sem dependências externas).

Comportamento:

1. Solicita a senha via prompt (sem ecoar no terminal — usa `readline` com `output: process.stderr` ou similar; senha não vai pro histórico do shell).
2. Confirma a senha (digita duas vezes).
3. Gera salt aleatório de 16 bytes (`crypto.randomBytes`).
4. Calcula PBKDF2-SHA256 com 200.000 iterações, 32 bytes de saída.
5. Imprime a string `pbkdf2-sha256$200000$<saltBase64>$<hashBase64>` no stdout.

O usuário roda **uma vez**, copia o output para o GitHub Secret e (opcionalmente) para `.env.local`.

### Persistência da sessão

- `localStorage["tq_auth"] = "1"` após login bem-sucedido.
- Sem expiração — fica logado para sempre nesse navegador, até logout explícito.
- Logout: remove a chave e redireciona para `/`.

### Tela de login

- Renderizada em `/` quando não autenticado.
- Campo único: senha (`type="password"`).
- Botão **Entrar**.
- Mensagem de erro inline em caso de senha incorreta: "Senha incorreta".
- Mensagem de aviso quando `NEXT_PUBLIC_ADMIN_AUTH_HASH` não está definida: "Autenticação não configurada — defina `ADMIN_AUTH_HASH` no GitHub Secrets (produção) ou em `.env.local` (desenvolvimento)."
- Após login bem-sucedido: `router.replace('/admin')`.

### Logout

- Botão "Sair" no [Topbar](../../../components/Topbar.tsx), à direita da nav.
- Visível apenas quando autenticado e fora de rotas de cliente (`/vote`, `/join`).
- Ao clicar: chama `logout()` e redireciona para `/`.

## Arquitetura

### Novos arquivos

- **`lib/auth.ts`** — núcleo da auth.
  - `parseHashString(s: string): { salt: Uint8Array; hash: Uint8Array; iterations: number } | null` — parser do formato canônico.
  - `derivePbkdf2(plain: string, salt: Uint8Array, iterations: number): Promise<Uint8Array>` — usa `crypto.subtle.importKey` + `deriveBits`.
  - `constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean` — comparação resistente a timing.
  - `verifyPassword(plain: string): Promise<boolean>` — lê `NEXT_PUBLIC_ADMIN_AUTH_HASH`, deriva, compara.
  - `login(plain: string): Promise<boolean>` — chama `verifyPassword`, em caso de sucesso grava no localStorage.
  - `isAuthenticated(): boolean` — checa flag (com guard para SSR/hidratação: retorna `false` se `typeof window === 'undefined'`).
  - `logout(): void` — remove flag.
  - `isAuthConfigured(): boolean` — true se `NEXT_PUBLIC_ADMIN_AUTH_HASH` existe e tem formato válido.

- **`components/AuthGuard.tsx`** — envelope para rotas protegidas, espelhando o padrão de [EnvGuard](../../../components/EnvGuard.tsx).
  - Em SSR/primeiro render: renderiza placeholder vazio (evita flash).
  - No client: se `!isAuthenticated()`, `router.replace('/')` e retorna `null`.
  - Senão, renderiza `children`.

- **`components/LoginScreen.tsx`** — formulário de senha.
  - Estado local: `password`, `error`, `loading`.
  - `onSubmit`: chama `login(password)`. Sucesso → `router.replace('/admin')`. Falha → seta `error`.
  - Mostra aviso se `!isAuthConfigured()`.

- **`scripts/gen-hash.mjs`** — gerador interativo do hash.

### Arquivos alterados

- **[`app/page.tsx`](../../../app/page.tsx)** — substitui o redirect cego: se autenticado → `replace('/admin')`, senão → renderiza `<LoginScreen />`.

- **[`components/Topbar.tsx`](../../../components/Topbar.tsx)** — adiciona botão "Sair" na nav, condicional a `isAuthenticated()` e fora de rotas de cliente.

- **Páginas protegidas** — cada uma envolvida em `<AuthGuard>`:
  - [`app/admin/page.tsx`](../../../app/admin/page.tsx)
  - [`app/executions/page.tsx`](../../../app/executions/page.tsx)
  - [`app/executions/run/[id]/page.tsx`](../../../app/executions/run/)
  - [`app/qr/[id]/page.tsx`](../../../app/qr/)
  - [`app/track/[id]/page.tsx`](../../../app/track/)
  - [`app/EditarLogoSecreta/page.tsx`](../../../app/EditarLogoSecreta/page.tsx)

  Quando a página já tem `<EnvGuard>`, fica aninhado: `<AuthGuard><EnvGuard>...</EnvGuard></AuthGuard>`.

- **[`.github/workflows/deploy.yml`](../../../.github/workflows/deploy.yml)** — adiciona `NEXT_PUBLIC_ADMIN_AUTH_HASH: ${{ secrets.ADMIN_AUTH_HASH }}` ao bloco `env` da etapa de build.

- **`.env.example`** (criar/atualizar) — adiciona linha `NEXT_PUBLIC_ADMIN_AUTH_HASH=` com comentário explicando como gerar.

## Fluxo

### Primeiro acesso (sem sessão)

1. Usuário abre `https://luizg99.github.io/enquete-votacao-tempo-real/`.
2. `app/page.tsx` detecta `!isAuthenticated()` → renderiza `<LoginScreen />`.
3. Usuário digita senha e clica Entrar.
4. `login(senha)`:
   - Lê `NEXT_PUBLIC_ADMIN_AUTH_HASH`.
   - Faz parse do formato `pbkdf2-sha256$200000$<salt>$<hash>`.
   - Deriva PBKDF2 da senha digitada com o mesmo salt e iterações.
   - Compara em tempo constante.
5. Sucesso → `localStorage["tq_auth"] = "1"` → `router.replace('/admin')`.
6. Falha → mostra "Senha incorreta", limpa o campo.

### Acesso direto a rota protegida sem sessão

1. Usuário tenta `/admin` direto (link salvo, etc.).
2. `<AuthGuard>` detecta `!isAuthenticated()` → `router.replace('/')`.
3. Usuário cai na tela de login.

### Logout

1. Usuário clica "Sair" no Topbar.
2. `logout()` remove a flag.
3. Redireciona para `/` → tela de login.

### Participante votando

- `/vote/[id]` e `/join/[id]` **não usam** `<AuthGuard>` → continuam abrindo direto.

## Tratamento de erros

- **Hash não configurado** (`NEXT_PUBLIC_ADMIN_AUTH_HASH` ausente ou malformado): tela de login mostra aviso e desabilita o botão Entrar. Sem hash, nenhum login passa.
- **Senha incorreta**: mensagem inline "Senha incorreta", campo limpo. Mensagem distinta da de "hash não configurado" — não há benefício em ocultar essa diferença, já que `NEXT_PUBLIC_ADMIN_AUTH_HASH` ausente é uma situação de configuração, não um caminho de ataque.
- **Hidratação**: `AuthGuard` e `LoginScreen` renderizam de forma neutra no primeiro render (sem flash de "deslogado" para usuários já logados).

## Testes manuais (ao final da implementação)

- [ ] Sem hash configurado: tela de login mostra aviso de configuração; botão desabilitado.
- [ ] Hash configurado, senha correta: login → redireciona para `/admin`.
- [ ] Hash configurado, senha errada: mostra "Senha incorreta", campo limpo.
- [ ] Logado, recarrega página: continua logado (localStorage).
- [ ] Logado, clica "Sair": volta pra `/`, sessão limpa.
- [ ] Deslogado, abre `/admin` direto: redireciona pra `/`.
- [ ] Deslogado, abre `/executions/run/<id>` direto: redireciona pra `/`.
- [ ] `/vote/<id>` abre normalmente sem login.
- [ ] `/join/<id>` abre normalmente sem login.
- [ ] Build no GitHub Actions: hash chega no JS publicado (verificar buscando trecho do hash no bundle).

## Não-objetivos

- Múltiplos usuários ou perfis (single password compartilhada).
- Recuperação de senha (admin gera novo hash quando precisar trocar).
- Auditoria de acessos.
- Expiração automática de sessão.
- Rate limiting (sem backend, não há onde aplicar).
