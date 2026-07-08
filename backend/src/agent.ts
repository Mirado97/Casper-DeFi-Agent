import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { CsprTradeMcp, type McpTool } from "./mcpClient.js";
import { Wallet } from "./wallet.js";
import { X402Service } from "./x402/service.js";
import { SafetyOracle } from "./safety/oracle.js";
import {
  extractDeployJson,
  findPubkeyParam,
  mcpText,
  summaryBeforeJson,
} from "./deployUtils.js";

const SYSTEM_PROMPT = `Ты — автономный non-custodial DeFi-агент для блокчейна Casper Network.
Пользователь общается с тобой на естественном языке и управляет своим портфелем на DEX CSPR.trade.

У тебя есть СВОЙ кошелёк (его публичный ключ возвращает get_my_wallet). Публичный ключ
подставляется в инструменты автоматически — не придумывай и не спрашивай его у пользователя.
Ключ кошелька всегда валиден и полный: secp256k1 — 68 hex-символов с префиксом 02,
ed25519 — 66 hex-символов с префиксом 01. НИКОГДА не проверяй его длину, не считай байты
и не отказывайся из-за формата ключа — подстановка в build_*-инструменты делается на сервере.
Твоя задача после подтверждения — просто вызвать build_swap, не рассуждая о ключе.

Рабочий цикл сделки:
1. Сначала анализ: get_quote / analyze_trade / estimate_price_impact. Покажи пользователю
   ожидаемый результат, price impact и slippage.
2. Спроси явное подтверждение перед исполнением.
3. После подтверждения вызови build_swap — он вернёт tx_id (транзакция кэшируется на сервере).
4. Затем sign_and_submit с этим tx_id — агент подпишет транзакцию своим ключом и отправит в сеть.

Принципы:
- Это non-custodial: приватный ключ остаётся локально, ты никогда его не показываешь и не просишь.
- Никогда не подписывай и не отправляй транзакцию без подтверждения пользователя.
- Не выдумывай числа — бери их из инструментов.`;

const LANG_DIRECTIVE: Record<string, string> = {
  ru: "Отвечай на русском языке, кратко и по делу.",
  en: "Always respond in English, concise and to the point.",
};

// Тулы, которые строят unsigned-транзакцию (её JSON кэшируем на сервере).
const BUILD_TOOLS = new Set([
  "build_swap",
  "build_approve_token",
  "build_add_liquidity",
  "build_remove_liquidity",
]);

type ChatMessage = { role: "user" | "assistant"; content: string };

export type ToolEvent = { name: string; input: unknown; output: unknown };

export class DefiAgent {
  private anthropic: Anthropic;
  private mcp: CsprTradeMcp;
  private wallet!: Wallet;
  private x402 = new X402Service();
  private oracle!: SafetyOracle;
  private toolsCache: McpTool[] | null = null;
  private pubkeyParamByTool = new Map<string, string | null>();
  // Кэш unsigned-транзакций: tx_id -> deploy JSON (не гоняем 100КБ через модель).
  private pending = new Map<string, Record<string, unknown>>();

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: config.anthropicApiKey,
      ...(config.anthropicBaseUrl ? { baseURL: config.anthropicBaseUrl } : {}),
    });
    this.mcp = new CsprTradeMcp(config.csprTradeMcpUrl);
  }

  private async init(): Promise<void> {
    if (!this.wallet) this.wallet = await Wallet.create();
    if (!this.oracle) this.oracle = new SafetyOracle(this.mcp);
    if (!this.toolsCache) {
      this.toolsCache = await this.mcp.listTools();
      for (const t of this.toolsCache) {
        this.pubkeyParamByTool.set(t.name, findPubkeyParam(t.inputSchema));
      }
    }
  }

  /** Инфо о кошельке агента (инициализирует кошелёк и MCP при первом вызове). */
  async walletInfo(): Promise<{ publicKey: string; ephemeral: boolean; tools: number }> {
    await this.init();
    return {
      publicKey: this.wallet.publicKeyHex,
      ephemeral: this.wallet.ephemeral,
      tools: this.toolsCache!.length + this.localTools().length,
    };
  }

  /** Кошелёк + живой баланс CSPR (для шапки/боковой панели UI). */
  async walletDetails(): Promise<{
    publicKey: string;
    ephemeral: boolean;
    cspr: number | null;
  }> {
    await this.init();
    let cspr: number | null = null;
    try {
      const res = await this.mcp.callTool("get_native_cspr_balance", {
        account_public_key: this.wallet.publicKeyHex,
      });
      const text = mcpText(res);
      // Ответ — JSON с полем вида { cspr / balance_cspr ... } или текст с числом.
      try {
        const obj = JSON.parse(text);
        const key = Object.keys(obj).find((k) => /cspr/i.test(k) && !/motes/i.test(k));
        cspr = key ? Number(obj[key]) : null;
      } catch {
        const m = text.match(/([\d.]+)\s*CSPR/i);
        cspr = m ? Number(m[1]) : null;
      }
    } catch {
      cspr = null;
    }
    return {
      publicKey: this.wallet.publicKeyHex,
      ephemeral: this.wallet.ephemeral,
      cspr: Number.isFinite(cspr as number) ? cspr : null,
    };
  }

  /** Инфо о x402-экономике агента: кошелёк, леджер (earn/spend), платежи. */
  x402Info() {
    return {
      wallet: this.x402.walletInfo(),
      ledger: this.x402.ledger(),
      payments: this.x402.recentPayments(),
    };
  }

  /** Демо-продажа: внешний агент платит нам за аналитику (earn). */
  async simulateSale() {
    return this.x402.simulateSale(() => this.marketIntel());
  }

  /** Token Safety Oracle: проверка токена (используется в чате бесплатно). */
  async checkTokenSafety(token: string) {
    await this.init();
    return this.oracle.check(token);
  }

  /** Требования оплаты для платного safety-эндпоинта/MCP (продаём внешним агентам). */
  safetyRequirements() {
    return this.x402.requirementsFor("safety-check");
  }

  /** Оплаченный внешним клиентом запрос safety-check (x402 → earn). */
  async fulfillSafety(token: string, payload: any) {
    return this.x402.fulfill("safety-check", payload, () => this.oracle.check(token));
  }

  /** Требования оплаты для защищённого HTTP-ресурса /api/premium/intel. */
  premiumRequirements() {
    return this.x402.requirementsFor("market-intel");
  }

  /** Обработка оплаченного запроса к защищённому ресурсу (внешний x402-клиент). */
  async fulfillPremium(payload: any) {
    return this.x402.fulfill("market-intel", payload, () => this.marketIntel());
  }

  /** Локальные (не-MCP) инструменты агента. */
  private localTools(): Anthropic.Tool[] {
    return [
      {
        name: "get_my_wallet",
        description:
          "Вернуть публичный ключ кошелька агента, которым подписываются транзакции.",
        input_schema: { type: "object", properties: {} },
      },
      {
        name: "sign_and_submit",
        description:
          "Подписать ранее построенную транзакцию (по tx_id из build_*) ключом агента и отправить в сеть Casper. Вызывать только после подтверждения пользователя.",
        input_schema: {
          type: "object",
          properties: {
            tx_id: { type: "string", description: "Идентификатор транзакции из build_*" },
          },
          required: ["tx_id"],
        },
      },
      {
        name: "check_token_safety",
        description:
          "Проверить безопасность токена на Casper через наш Token Safety Oracle: honeypot/налог на продажу (round-trip котировок) и ликвидность (price impact). Возвращает risk score и уровень SAFE/CAUTION/DANGER. Используй, когда пользователь спрашивает, безопасен ли токен, или ПЕРЕД свопом в незнакомый токен.",
        input_schema: {
          type: "object",
          properties: {
            token: { type: "string", description: "Символ или package hash токена (напр. sCSPR)" },
          },
          required: ["token"],
        },
      },
    ];
  }

  private async runLocalTool(name: string, input: any): Promise<unknown> {
    if (name === "get_my_wallet") {
      return {
        public_key: this.wallet.publicKeyHex,
        ephemeral: this.wallet.ephemeral,
        note: this.wallet.ephemeral
          ? "Эфемерный ключ без средств — задай CASPER_SECRET_KEY_* для реальных сделок."
          : undefined,
      };
    }
    if (name === "sign_and_submit") {
      const txJson = this.pending.get(input?.tx_id);
      if (!txJson) return { error: `Неизвестный tx_id: ${input?.tx_id}` };
      if (this.wallet.ephemeral) {
        return {
          error:
            "Кошелёк эфемерный (без средств). Подпись возможна, но транзакция будет отклонена сетью. Настрой CASPER_SECRET_KEY_*.",
        };
      }
      const signed = await this.wallet.signTransactionJson(txJson);
      const res = await this.mcp.callTool("submit_transaction", {
        signed_deploy_json: signed,
      });
      this.pending.delete(input.tx_id);
      // Поток 3: сервис-комиссия за исполненную сделку (x402, spend).
      const fee = await this.x402.purchase("trade-fee");
      return {
        submitted: true,
        result: mcpText(res),
        trade_fee: fee.ok
          ? { amount: fee.receipt.priceLabel, transaction: fee.receipt.transaction, via: "x402" }
          : undefined,
      };
    }
    if (name === "check_token_safety") {
      const token = String(input?.token ?? "").trim();
      if (!token) return { error: "Укажи token (символ или package hash)" };
      return this.oracle.check(token);
    }
    return { error: `Неизвестный локальный инструмент: ${name}` };
  }

  /** Премиум-данные за пейволом: реальная аналитика CSPR/sCSPR с CSPR.trade. */
  private async marketIntel(): Promise<unknown> {
    let analysis = "";
    try {
      const res = await this.mcp.callTool("analyze_trade", {
        token_in: "CSPR",
        token_out: "sCSPR",
        amount: "1000",
      });
      analysis = mcpText(res);
    } catch (e) {
      analysis = "нет данных: " + String(e);
    }
    return {
      source: "CSPR.trade premium feed",
      pair: "CSPR/sCSPR",
      generated_at: new Date().toISOString(),
      analysis,
    };
  }

  /** Вызов MCP-тула с авто-подстановкой pubkey и кэшированием build_*-транзакций. */
  private async runMcpTool(name: string, input: any): Promise<unknown> {
    const args: Record<string, unknown> = { ...(input ?? {}) };

    // Подстановка публичного ключа кошелька агента.
    // Для build_* — принудительно (агент может подписать только свою транзакцию,
    // модель не должна подставлять чужой/выдуманный ключ).
    // Для read-тулов (балансы/портфель) — только если модель ключ не задала,
    // чтобы можно было запросить произвольный аккаунт.
    const pubParam = this.pubkeyParamByTool.get(name);
    if (pubParam) {
      const empty = args[pubParam] === undefined || args[pubParam] === "";
      if (BUILD_TOOLS.has(name) || empty) {
        args[pubParam] = this.wallet.publicKeyHex;
      }
    }

    const res = await this.mcp.callTool(name, args);
    const text = mcpText(res);

    // Для build_*: кэшируем unsigned-транзакцию, модели отдаём summary + tx_id.
    if (BUILD_TOOLS.has(name)) {
      const txJson = extractDeployJson(text);
      if (txJson) {
        const txId = randomUUID().slice(0, 8);
        this.pending.set(txId, txJson);
        return {
          summary: summaryBeforeJson(text),
          tx_id: txId,
          next: "Покажи summary пользователю и после подтверждения вызови sign_and_submit с этим tx_id.",
        };
      }
    }
    return text;
  }

  async chat(
    history: ChatMessage[],
    lang: string = "ru"
  ): Promise<{ reply: string; toolEvents: ToolEvent[] }> {
    await this.init();
    const system = SYSTEM_PROMPT + "\n\n" + (LANG_DIRECTIVE[lang] ?? LANG_DIRECTIVE.ru);

    const tools: Anthropic.Tool[] = [
      ...this.toolsCache!.map((t) => ({
        name: t.name,
        description: t.description ?? "",
        input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
      })),
      ...this.localTools(),
    ];
    const localNames = new Set(this.localTools().map((t) => t.name));

    const messages: Anthropic.MessageParam[] = history.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const toolEvents: ToolEvent[] = [];

    for (let step = 0; step < 12; step++) {
      const res = await this.anthropic.messages.create({
        model: config.model,
        max_tokens: 2048,
        system,
        tools,
        messages,
      });

      messages.push({ role: "assistant", content: res.content });

      if (res.stop_reason !== "tool_use") {
        const text = res.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return { reply: text || "(пустой ответ)", toolEvents };
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type !== "tool_use") continue;
        let output: unknown;
        try {
          output = localNames.has(block.name)
            ? await this.runLocalTool(block.name, block.input)
            : await this.runMcpTool(block.name, block.input);
        } catch (e) {
          output = { error: String(e) };
        }
        toolEvents.push({ name: block.name, input: block.input, output });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(output),
        });
      }
      messages.push({ role: "user", content: toolResults });
    }

    return {
      reply: "Достигнут лимит шагов агента — уточни запрос, пожалуйста.",
      toolEvents,
    };
  }
}
