# Estrategista de Quadros

Ferramenta web que recebe o material de uma marca e do seu Cliente Ideal
(documento PDF/DOCX + campos de texto) e devolve, na tela, um mapa de
matéria-prima e uma grade de quadros recorrentes para Instagram — gerados
pela API da Anthropic a partir do prompt do Estrategista de Quadros.

Ao contrário da versão em Claude Artifact, esta versão **não exige login**
em nenhuma conta Claude: qualquer pessoa com o link acessa e usa. Em troca,
quem hospeda (você) paga o uso da API da Anthropic diretamente — por isso
o servidor já vem com um limite de gerações por hora por IP, configurável.

## Como funciona

- `public/index.html` — front-end único (HTML+CSS+JS), sem framework. A
  extração de texto de PDF/DOCX acontece **no navegador** (pdf.js e
  mammoth.js, carregados via CDN) — nenhum arquivo binário chega a ser
  enviado ao servidor.
- `server.js` — servidor Express minimalista com uma única rota,
  `POST /api/generate`, que recebe o material já em texto, monta o prompt
  e chama a API da Anthropic com sua `ANTHROPIC_API_KEY`.
- `prompts.js` — o prompt do Estrategista de Quadros (praticamente na
  íntegra) + a adaptação para o modo "envio único" + o parser tolerante
  do JSON de resposta.

## Rodando localmente

```bash
npm install
cp .env.example .env
# edite o .env e preencha ANTHROPIC_API_KEY com sua chave de
# console.anthropic.com
npm start
```

Abra `http://localhost:3000`.

## Variáveis de ambiente

Veja `.env.example` para a lista completa. As mais importantes:

- `ANTHROPIC_API_KEY` (obrigatória) — sua chave da API.
- `ANTHROPIC_MODEL` (padrão `claude-sonnet-5`) — troque para
  `claude-opus-5` se quiser priorizar qualidade sobre custo/velocidade.
- `RATE_LIMIT_PER_HOUR` (padrão `20`) — quantas gerações por hora cada IP
  pode fazer. Como a ferramenta é pública e sem login, esse número é o que
  protege sua conta da Anthropic de uso abusivo — ajuste com cuidado antes
  de divulgar o link.

## Deploy no seu servidor (via GitHub)

Isto é um app Node comum — sobe do mesmo jeito que qualquer outro serviço
Node que você já rode no seu servidor:

1. No seu servidor, clone o repositório (ou faça `git pull` se já estiver
   lá) e rode `npm install --omit=dev`.
2. Crie o arquivo `.env` **direto no servidor** (nunca comite `.env` no
   GitHub — ele já está no `.gitignore`) com sua `ANTHROPIC_API_KEY` real.
3. Suba o processo com o gerenciador que você já usa para o Codirect (por
   exemplo `pm2 start server.js --name quadros` ou um serviço `systemd`) —
   por padrão ele escuta na porta 3000 (configurável via `PORT`).
4. Aponte seu proxy reverso (Nginx/Caddy, o mesmo que já serve o Codirect)
   para essa porta, no domínio ou subdomínio que você quiser usar (ex:
   `quadros.seudominio.com.br`).

Não há build step, não há banco de dados e não há arquivos enviados ao
servidor — é um Express servindo um HTML estático e um único endpoint de
API, então cabe em praticamente qualquer VPS pequeno.

## Segurança e custo — pontos de atenção

- A chave da API fica **só no servidor** (variável de ambiente), nunca no
  navegador — o front-end nunca vê sua `ANTHROPIC_API_KEY`.
- Como não há login, qualquer pessoa com o link pode gerar quadros e cada
  geração é uma chamada paga à API. O `RATE_LIMIT_PER_HOUR` é a única
  proteção embutida; se for divulgar o link amplamente, considere baixar
  esse limite ou adicionar autenticação simples na frente.
- O prompt em `prompts.js` é o mesmo usado na versão Claude Artifact —
  para ajustá-lo, edite esse arquivo (não precisa mexer no front-end).
