# Task Question — Enquete/Votação em Tempo Real

MVP 100% frontend (HTML/CSS/JS puro) para criar enquetes, compartilhar via QR code e acompanhar votos em tempo real.

## Funcionalidades

1. **Admin** (`#/admin`) — cria, edita e exclui enquetes, perguntas e respostas. Autosave.
2. **Usuário** (`#/vote/:id`) — responde uma pergunta por vez via radio buttons.
3. **Dashboard** (`#/dashboard`) — lista todas as enquetes com botões **QR Code Votação** e **Acompanhar Enquete**.
4. **QR Code** (`#/qr/:id`) — tela cheia com QR apontando para a rota de voto (via `qrcode.js`).
5. **Acompanhamento** (`#/track/:id`) — gráficos em barras horizontais com atualização automática (polling 1s + evento `storage`).

## Stack

- HTML5, CSS3, JavaScript ES modules (sem build)
- `qrcode.js` via CDN
- `localStorage` como único storage
- Hash routing próprio, sem frameworks

## Como rodar localmente

Como o código usa módulos ES (`import`), é necessário um servidor HTTP (não abra `index.html` direto):

```bash
# Python 3
python -m http.server 8080
# ou Node
npx serve .
```

Depois abra <http://localhost:8080>.

## Deploy no GitHub Pages

1. Faça push para a branch `main`.
2. Em **Settings → Pages**, selecione a fonte como **GitHub Actions**.
3. O workflow `.github/workflows/deploy.yml` publica automaticamente.
4. A URL pública será algo como `https://<usuario>.github.io/<repo>/`.

O QR code gerado usa `location.origin + location.pathname`, então o deploy em subpath do GitHub Pages funciona sem ajustes.

## Estrutura de dados

Documentada em [config.yml](config.yml). Resumo:

```
survey { id, title, createdAt, questions[ { id, text, answers[ { id, text, votes } ] } ] }
vote   { surveyId, questionId, answerId, ts }
```

## Limitações conhecidas do MVP

- **Sincronização apenas por navegador**: `localStorage` é local ao dispositivo. Votos feitos em celulares diferentes **não** chegam ao dashboard automaticamente. Para multi-dispositivo é necessário backend (Firebase/Supabase/etc.) — fora do escopo do MVP.
- **Sem autenticação**: qualquer visitante com a URL pode acessar o admin.
- **Sem validação contra votos múltiplos**: o mesmo usuário pode votar várias vezes.

Para uma demo controlada (ex: em projetor), abra admin/dashboard em uma aba e recolha votos em outras abas do mesmo navegador — a atualização é instantânea via evento `storage`.

## Arquivos principais

- [index.html](index.html) — shell
- [js/app.js](js/app.js) — bootstrap + registro de rotas
- [js/router.js](js/router.js) — hash router
- [js/store.js](js/store.js) — estado + persistência
- [js/views/](js/views/) — telas (admin, vote, dashboard, qr, track)
- [css/styles.css](css/styles.css)
- [config.yml](config.yml) — documentação da arquitetura de dados
