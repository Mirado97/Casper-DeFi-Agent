import { CsprTradeMcp } from "../mcpClient.js";
import { mcpText } from "../deployUtils.js";

export type SafetyReport = {
  token: string;
  listed: boolean;
  metadata?: { symbol: string; name: string; decimals: number; packageHash: string };
  checks: {
    honeypot: { sellable: boolean; retentionPct: number | null; flag: "ok" | "warn" | "danger" };
    liquidity: { priceImpactPct: number | null; flag: "ok" | "warn" | "danger" };
  };
  score: number; // 0..100
  level: "SAFE" | "CAUTION" | "DANGER";
  factors: string[];
  generated_at: string;
};

const PROBE_CSPR = "1000"; // стандартный объём пробной сделки

function parseQuote(text: string): { out: number | null; impact: number | null } {
  try {
    const q = JSON.parse(text);
    return {
      out: q.amountOutFormatted != null ? Number(q.amountOutFormatted) : null,
      impact: q.priceImpact != null ? Number(q.priceImpact) : null,
    };
  } catch {
    return { out: null, impact: null };
  }
}

/**
 * Token Safety Oracle для Casper: оценивает риск токена по реальным данным
 * CSPR.trade — honeypot/налог на продажу (round-trip котировок) и ликвидность
 * (price impact на фиксированном объёме). Продаётся по x402 как платный сервис.
 */
export class SafetyOracle {
  constructor(private mcp: CsprTradeMcp) {}

  async check(token: string): Promise<SafetyReport> {
    const factors: string[] = [];

    // 1. Листинг и метаданные
    const meta = await this.findToken(token);
    if (!meta) {
      return {
        token,
        listed: false,
        checks: {
          honeypot: { sellable: false, retentionPct: null, flag: "danger" },
          liquidity: { priceImpactPct: null, flag: "danger" },
        },
        score: 5,
        level: "DANGER",
        factors: ["Token is not listed / tradable on CSPR.trade — cannot be traded safely"],
        generated_at: new Date().toISOString(),
      };
    }

    // 2. Honeypot / налог на продажу: купить CSPR→TOKEN, затем продать TOKEN→CSPR
    let sellable = true;
    let retentionPct: number | null = null;
    let priceImpactPct: number | null = null;
    try {
      const buy = parseQuote(
        mcpText(
          await this.mcp.callTool("get_quote", {
            token_in: "CSPR",
            token_out: meta.symbol,
            amount: PROBE_CSPR,
            type: "exact_in",
          })
        )
      );
      priceImpactPct = buy.impact;

      if (buy.out && buy.out > 0) {
        const sell = parseQuote(
          mcpText(
            await this.mcp.callTool("get_quote", {
              token_in: meta.symbol,
              token_out: "CSPR",
              amount: String(buy.out),
              type: "exact_in",
            })
          )
        );
        if (!sell.out || sell.out <= 0) sellable = false;
        else retentionPct = Number(((sell.out / Number(PROBE_CSPR)) * 100).toFixed(2));
      } else {
        sellable = false;
      }
    } catch {
      sellable = false;
    }

    // --- Скоринг ---
    let score = 100;
    let honeypotFlag: "ok" | "warn" | "danger" = "ok";
    if (!sellable) {
      honeypotFlag = "danger";
      score -= 70;
      factors.push("Cannot sell the token back — likely honeypot or transfers blocked");
    } else if (retentionPct != null) {
      if (retentionPct < 50) {
        honeypotFlag = "danger";
        score -= 50;
        factors.push(`Severe round-trip loss (${retentionPct}% retained) — high sell tax / honeypot`);
      } else if (retentionPct < 85) {
        honeypotFlag = "warn";
        score -= 20;
        factors.push(`Elevated round-trip loss (${retentionPct}% retained) — possible fee/tax or thin liquidity`);
      }
    }

    let liqFlag: "ok" | "warn" | "danger" = "ok";
    if (priceImpactPct != null) {
      if (priceImpactPct >= 15) {
        liqFlag = "danger";
        score -= 35;
        factors.push(`Very high price impact (${priceImpactPct}%) on a ${PROBE_CSPR} CSPR trade — shallow liquidity`);
      } else if (priceImpactPct >= 5) {
        liqFlag = "warn";
        score -= 15;
        factors.push(`High price impact (${priceImpactPct}%) — limited liquidity`);
      }
    }

    score = Math.max(0, Math.min(100, score));
    const level: SafetyReport["level"] =
      score >= 75 ? "SAFE" : score >= 45 ? "CAUTION" : "DANGER";
    if (factors.length === 0) factors.push("No major risk signals detected from DEX-side checks");

    return {
      token,
      listed: true,
      metadata: meta,
      checks: {
        honeypot: { sellable, retentionPct, flag: honeypotFlag },
        liquidity: { priceImpactPct, flag: liqFlag },
      },
      score,
      level,
      factors,
      generated_at: new Date().toISOString(),
    };
  }

  private async findToken(
    token: string
  ): Promise<SafetyReport["metadata"] | null> {
    try {
      const list = JSON.parse(mcpText(await this.mcp.callTool("get_tokens", {})));
      const q = token.toLowerCase().replace(/^hash-/, "");
      const hit = (list as any[]).find(
        (t) =>
          t.symbol?.toLowerCase() === q ||
          t.name?.toLowerCase() === q ||
          t.packageHash?.toLowerCase() === q ||
          t.id?.toLowerCase() === q
      );
      if (!hit) return null;
      return {
        symbol: hit.symbol,
        name: hit.name,
        decimals: hit.decimals,
        packageHash: hit.packageHash,
      };
    } catch {
      return null;
    }
  }
}
