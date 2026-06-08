import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { DefiAgent } from "./agent.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const agent = new DefiAgent();

app.get("/api/health", async (_req, res) => {
  try {
    const wallet = await agent.walletInfo();
    res.json({
      ok: true,
      model: config.model,
      mcp: config.csprTradeMcpUrl,
      baseUrl: config.anthropicBaseUrl || "default (api.anthropic.com)",
      hasKey: Boolean(config.anthropicApiKey),
      wallet,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get("/api/wallet", async (_req, res) => {
  try {
    res.json(await agent.walletDetails());
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/api/x402", (_req, res) => {
  res.json(agent.x402Info());
});

// Демо: внешний агент покупает у нас аналитику (поток 2 — earn).
app.post("/api/x402/demo-sale", async (_req, res) => {
  try {
    const r = await agent.simulateSale();
    res.json({ ok: r.ok, receipt: r.receipt });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Защищённый x402-ресурс: без оплаты — HTTP 402 с требованиями, с подписью — данные.
app.get("/api/premium/intel", async (req, res) => {
  const header = req.header("PAYMENT-SIGNATURE");
  if (!header) {
    res.status(402).json({
      x402Version: 2,
      error: "payment required",
      accepts: [agent.premiumRequirements()],
    });
    return;
  }
  try {
    const { decodePaymentHeader } = await import("./x402/client.js");
    const result = await agent.fulfillPremium(decodePaymentHeader(header));
    if (!result.ok) {
      res.status(402).json({ error: "payment rejected", receipt: result.receipt });
      return;
    }
    res.setHeader("X-PAYMENT-RESPONSE", result.receipt.transaction);
    res.json({ payment: result.receipt, intel: result.data });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const { messages, lang } = req.body ?? {};
    if (!Array.isArray(messages)) {
      res.status(400).json({ error: "ожидается поле messages[]" });
      return;
    }
    const result = await agent.chat(messages, lang === "en" ? "en" : "ru");
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

app.listen(config.port, () => {
  console.log(`Backend: http://localhost:${config.port}`);
  console.log(`Model:   ${config.model}`);
  console.log(`MCP:     ${config.csprTradeMcpUrl}`);
  if (!config.anthropicApiKey) {
    console.warn("⚠  ANTHROPIC_API_KEY не задан — создай backend/.env из .env.example");
  }
});
