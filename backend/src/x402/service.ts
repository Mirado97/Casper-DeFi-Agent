import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { X402Wallet } from "./wallet.js";
import { createPayment } from "./client.js";
import { settlePayment, verifyPayment } from "./facilitator.js";
import type { PaymentPayload, PaymentRequirements } from "./types.js";

type Direction = "spend" | "earn";

type ResourceDef = {
  amount: string; // наименьшие единицы CEP-18
  priceLabel: string;
  direction: Direction; // с точки зрения нашего агента
  payTo: string; // получатель ("00" + 64 hex)
  description: string;
};

// Казна платформы (мы получаем продажи аналитики и сервис-комиссии).
const TREASURY = config.x402.payee;
// Внешний провайдер данных (агент платит ему за то, чего у него нет).
const PROVIDER = "00" + "0".repeat(62) + "02";

// Каталог x402-ресурсов двусторонней экономики агента.
const RESOURCES: Record<string, ResourceDef> = {
  // ПРОДАЁМ: внешние агенты платят НАМ за премиум-аналитику → earn.
  "market-intel": {
    amount: "1000000",
    priceLabel: "0.001 USDC",
    direction: "earn",
    payTo: TREASURY,
    description: "Premium market analytics (sold to external agents)",
  },
  // ПОКУПАЕМ: агент платит внешнему провайдеру за оценку безопасности сделки → spend.
  "safety-signal": {
    amount: "1000000",
    priceLabel: "0.001 USDC",
    direction: "spend",
    payTo: PROVIDER,
    description: "External trade-safety score",
  },
  // ПОКУПАЕМ: сервис-комиссия за каждую исполненную сделку → spend.
  "trade-fee": {
    amount: "500000",
    priceLabel: "0.0005 USDC",
    direction: "spend",
    payTo: TREASURY,
    description: "Per-trade service fee",
  },
};

export type PaymentRecord = {
  id: string;
  resource: string;
  direction: Direction;
  amount: string;
  priceLabel: string;
  description: string;
  payer: string;
  payee: string;
  network: string;
  status: "settled" | "failed";
  transaction: string;
  reason?: string;
  ts: number;
};

export type PurchaseResult = { ok: boolean; receipt: PaymentRecord; data?: unknown };

const DECIMALS = Number(config.x402.assetDecimals || "9");
const toUsdc = (amount: string) => Number(amount) / 10 ** DECIMALS;

/**
 * Двусторонняя x402-экономика агента:
 *  • spend  — агент платит за внешние сигналы (safety-signal) и сервис-комиссии (trade-fee)
 *  • earn   — внешние агенты платят нам за аналитику (market-intel)
 */
export class X402Service {
  readonly wallet: X402Wallet; // платёжный кошелёк нашего агента
  private buyer: X402Wallet; // симулированный внешний агент-покупатель
  private payments: PaymentRecord[] = [];

  constructor() {
    this.wallet = new X402Wallet(config.x402.paymentKeyHex || undefined);
    this.buyer = new X402Wallet(); // эфемерный «внешний» агент для демо-продаж
  }

  walletInfo() {
    return {
      publicKey: this.wallet.publicKeyHex,
      address: this.wallet.taggedAddress,
      ephemeral: this.wallet.ephemeral,
      mode: config.x402.mode,
      network: config.x402.network,
    };
  }

  recentPayments(limit = 20): PaymentRecord[] {
    return this.payments.slice(-limit).reverse();
  }

  /** Сводный леджер: сколько заработали, потратили, чистыми (в USDC). */
  ledger() {
    let earned = 0;
    let spent = 0;
    for (const p of this.payments) {
      if (p.status !== "settled") continue;
      if (p.direction === "earn") earned += toUsdc(p.amount);
      else spent += toUsdc(p.amount);
    }
    return {
      earned: Number(earned.toFixed(6)),
      spent: Number(spent.toFixed(6)),
      net: Number((earned - spent).toFixed(6)),
    };
  }

  /** Требования оплаты для ресурса каталога. */
  requirementsFor(resource: string): PaymentRequirements {
    const r = RESOURCES[resource] ?? RESOURCES["market-intel"];
    return {
      scheme: "exact",
      network: config.x402.network,
      payTo: r.payTo,
      amount: r.amount,
      asset: config.x402.assetPackage,
      extra: {
        name: config.x402.assetName,
        version: config.x402.assetVersion,
        decimals: config.x402.assetDecimals,
      },
      maxTimeoutSeconds: 900,
      resource,
      description: r.description,
      priceLabel: r.priceLabel,
    };
  }

  async verify(payload: PaymentPayload, req: PaymentRequirements) {
    return verifyPayment(payload, req);
  }

  /**
   * Агент ПОКУПАЕТ ресурс (in-process): подписать → verify → settle → producer.
   * Используется для safety-signal и trade-fee (direction = spend).
   */
  async purchase(
    resource: string,
    producer?: () => Promise<unknown>
  ): Promise<PurchaseResult> {
    const req = this.requirementsFor(resource);
    const payment = createPayment(req, this.wallet);
    return this.process(resource, payment, this.wallet.taggedAddress, producer);
  }

  /**
   * Внешний агент ПОКУПАЕТ у нас (HTTP 402): payload приходит готовым.
   * Используется для market-intel (direction = earn).
   */
  async fulfill(
    resource: string,
    payload: PaymentPayload,
    producer?: () => Promise<unknown>
  ): Promise<PurchaseResult> {
    return this.process(resource, payload, payload.payload.authorization.from, producer);
  }

  /** Демо-продажа: симулированный внешний агент платит нам за аналитику (earn). */
  async simulateSale(producer?: () => Promise<unknown>): Promise<PurchaseResult> {
    const req = this.requirementsFor("market-intel");
    const payment = createPayment(req, this.buyer);
    return this.process("market-intel", payment, this.buyer.taggedAddress, producer);
  }

  /** Общий конвейер: verify → settle → запись в леджер → producer. */
  private async process(
    resource: string,
    payload: PaymentPayload,
    payer: string,
    producer?: () => Promise<unknown>
  ): Promise<PurchaseResult> {
    const def = RESOURCES[resource] ?? RESOURCES["market-intel"];
    const req = this.requirementsFor(resource);

    const verify = await verifyPayment(payload, req);
    if (!verify.isValid) {
      return this.record(resource, def, payer, "", "failed", verify.invalidReason + ": " + verify.invalidMessage);
    }
    const settle = await settlePayment(payload, req);
    if (!settle.success) {
      return this.record(resource, def, payer, "", "failed", settle.errorReason + ": " + settle.errorMessage);
    }
    const res = this.record(resource, def, payer, settle.transaction, "settled");
    res.data = producer ? await producer() : undefined;
    return res;
  }

  private record(
    resource: string,
    def: ResourceDef,
    payer: string,
    transaction: string,
    status: "settled" | "failed",
    reason?: string
  ): PurchaseResult {
    const rec: PaymentRecord = {
      id: randomUUID().slice(0, 8),
      resource,
      direction: def.direction,
      amount: def.amount,
      priceLabel: def.priceLabel,
      description: def.description,
      payer,
      payee: def.payTo,
      network: config.x402.network,
      status,
      transaction,
      reason,
      ts: Date.now(),
    };
    this.payments.push(rec);
    return { ok: status === "settled", receipt: rec };
  }
}
