"use strict";

require("dotenv").config();

const path = require("path");
const express = require("express");
const rateLimit = require("express-rate-limit");
const Anthropic = require("@anthropic-ai/sdk");
const { buildPrompt, parseJsonLoose, MAX_MATERIAL_BYTES } = require("./prompts");

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "[estrategista-de-quadros] Faltou a variável de ambiente ANTHROPIC_API_KEY. " +
      "Copie .env.example para .env e preencha sua chave antes de iniciar o servidor."
  );
  process.exit(1);
}

const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
// O claude-sonnet-5 usa "adaptive thinking" por padrão, e os tokens de
// raciocínio interno contam dentro do mesmo limite de max_tokens (junto
// com o texto de resposta). Como o prompt do Estrategista de Quadros pede
// bastante raciocínio interno antes de gerar a grade (investigação de
// contradições, mapa de matéria-prima etc.), um limite baixo faz a
// resposta ser cortada no meio do JSON antes mesmo de terminar — por isso
// o valor padrão aqui é bem mais folgado do que o mínimo necessário.
const MAX_TOKENS = Number(process.env.ANTHROPIC_MAX_TOKENS || 32000);
const RATE_LIMIT_PER_HOUR = Number(process.env.RATE_LIMIT_PER_HOUR || 20);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  // Só usado em testes/staging para apontar para um servidor falso.
  baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
});

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

// Protege sua conta da Anthropic de uso abusivo, já que este endpoint
// fica público e sem login. Ajuste RATE_LIMIT_PER_HOUR no .env conforme
// o volume esperado.
const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: RATE_LIMIT_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas gerações a partir deste endereço em pouco tempo. Tente novamente mais tarde." },
});
app.use("/api/", limiter);

app.post("/api/generate", async (req, res) => {
  const body = req.body || {};
  const material = typeof body.material === "string" ? body.material.trim() : "";
  const isRefinement = !!body.isRefinement;

  if (!material) {
    return res.status(400).json({ error: "Envie o material preenchido no formulário." });
  }
  if (material.length > MAX_MATERIAL_BYTES) {
    return res.status(400).json({ error: "O material enviado é grande demais. Reduza um pouco o texto." });
  }

  try {
    const prompt = buildPrompt(material, isRefinement);
    // Usamos streaming (em vez de messages.create simples) porque com
    // MAX_TOKENS alto (necessário pelo "raciocínio interno" do sonnet-5) a
    // API da Anthropic recusa a chamada não-streaming: "Streaming is
    // required for operations that may take longer than 10 minutes". O
    // helper .stream(...).finalMessage() consome o stream internamente e
    // devolve o mesmo formato de objeto que messages.create, então o resto
    // do código abaixo não precisa mudar.
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });
    const response = await stream.finalMessage();

    const textBlock = (response.content || []).find((b) => b.type === "text");
    const rawText = textBlock ? textBlock.text : "";
    const data = parseJsonLoose(rawText);

    if (!data || !Array.isArray(data.quadros)) {
      console.error(
        "[estrategista-de-quadros] Resposta da IA não pôde ser interpretada como JSON. stop_reason=%s tamanho_texto=%d prévia=%s",
        response.stop_reason,
        rawText.length,
        rawText.slice(0, 500)
      );
      if (response.stop_reason === "max_tokens") {
        return res.status(502).json({
          error: "A resposta foi cortada por atingir o limite de tokens antes de terminar. Aumente ANTHROPIC_MAX_TOKENS no .env do servidor, ou tente novamente com um material um pouco mais enxuto.",
        });
      }
      return res.status(502).json({ error: "A resposta veio em um formato inesperado. Tente gerar de novo." });
    }

    res.json(data);
  } catch (err) {
    const status = err && err.status;
    console.error("[estrategista-de-quadros] Erro ao chamar a API da Anthropic:", err && err.message ? err.message : err);

    if (status === 401 || status === 403) {
      return res.status(500).json({ error: "Chave de API inválida ou sem permissão. Verifique o ANTHROPIC_API_KEY no servidor." });
    }
    if (status === 429) {
      return res.status(429).json({ error: "Limite de uso da API atingido. Tente novamente em instantes." });
    }
    res.status(500).json({ error: "Falha ao gerar. Tente novamente em instantes." });
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`[estrategista-de-quadros] rodando em http://localhost:${PORT} (modelo: ${MODEL})`);
});
