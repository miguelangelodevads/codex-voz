# Codex Voz

PWA para mandar pedidos de voz/texto pelo celular ao agente (opencode) que roda
dentro do ambiente AWS do c2code, criando e modificando projetos.

## Rodar

1. No terminal do ambiente, inicie a API do opencode:

       opencode serve --port 4096

2. Em outro terminal, nesta pasta:

       npm install
       npm start

   O servidor sobe na porta 3000 e serve o PWA + proxy para a API.

3. Instale o PWA no celular: abra o endereço no Chrome/Safari e use
   "Adicionar à tela de início". Precisa ser acessível por HTTPS
   (o próprio domínio `*.c2code.ia.br` do ambiente serve; aponte um proxy
   do domínio para a porta 3000) — service worker e microfone exigem HTTPS
   (ou localhost).

## Endereços usados

- API do opencode: `OPENCODE_URL` (padrao `http://localhost:4096`)
- Porta do proxy/PWA: `PORT` (padrao 3000)

## Endpoints do proxy

- `GET  /api/sessions` — lista sessões
- `POST /api/sessions` — cria sessão
- `POST /api/sessions/:id/message` — envia prompt (SSE ou JSON)
- `GET  /api/sessions/:id/files` — lista arquivos tocados na sessão

## Segurança

O proxy não tem autenticação. Exponha só atrás de TLS/credencial
(ex.: o mesmo mecanismo que já protege o VS Code web do ambiente).
Não abra a porta 3000 direto na internet.
