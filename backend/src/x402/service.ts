import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { X402Wallet } from "./wallet.js";
import { createPayment } from "./client.js";
import { settlePayment, verifyPayment } from "./facilitator.js";
import type { PaymentPayload, PaymentRequirements } from "./types.js";

export type PaymentRecord = {
  id: string;
  resource: string;
  amount: string;
  priceLabel: string;
  payer: string;
  payee: string;
  network: string;
  status: "settled" | "failed";
  transaction: string;
  reason?: string;
  ts: number;
};

export type PurchaseResult = {
  ok: boolean;
  receipt: PaymentRecord;
  data?: unknown;
};

/** Сервис x402: кошелёк агента, requirements, покупка ресурса, журнал платежей. */
export class X402Service {
  readonly wallet: X402Wallet;
  private payments: PaymentRecord[] = [];

  constructor() {
    this.wallet = new X402Wallet(config.x402.paymentKeyHex || undefined);
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

  /** Требования оплаты для защищённого ресурса. */
  requirementsFor(resource: string, description?: string): PaymentRequirements {
    return {
      scheme: "exact",
      network: config.x402.network,
      payTo: config.x402.payee,
      amount: config.x402.price,
      asset: config.x402.assetPackage,
      extra: {
        name: config.x402.assetName,
        version: config.x402.assetVersion,
        decimals: config.x402.assetDecimals,
      },
      maxTimeoutSeconds: 900,
      resource,
      description,
      priceLabel: config.x402.priceLabel,
    };
  }

  /** Проверка готового payload (для HTTP-эндпоинта). */
  async verify(payload: PaymentPayload, req: PaymentRequirements) {
    return verifyPayment(payload, req);
  }

  /**
   * Обработка платежа от ВНЕШНЕГО клиента (HTTP 402-цикл): verify → settle → producer.
   * В отличие от purchase, payload приходит готовым в заголовке запроса.
   */
  async fulfill(
    resource: string,
    payload: PaymentPayload,
    producer: () => Promise<unknown>
  ): Promise<PurchaseResult> {
    const req = this.requirementsFor(resource);
    const verify = await verifyPayment(payload, req);
    if (!verify.isValid)
      return this.fail(req, payload, verify.invalidReason + ": " + verify.invalidMessage);
    const settle = await settlePayment(payload, req);
    if (!settle.success)
      return this.fail(req, payload, settle.errorReason + ": " + settle.errorMessage);

    const record: PaymentRecord = {
      id: randomUUID().slice(0, 8),
      resource,
      amount: req.amount,
      priceLabel: req.priceLabel ?? req.amount,
      payer: verify.payer,
      payee: req.payTo,
      network: req.network,
      status: "settled",
      transaction: settle.transaction,
      ts: Date.now(),
    };
    this.payments.push(record);
    return { ok: true, receipt: record, data: await producer() };
  }

  /**
   * Полный цикл оплаты ресурса агентом (in-process): подписать → verify → settle.
   * При успехе вызывает producer() и возвращает gated-данные + чек платежа.
   */
  async purchase(
    resource: string,
    producer: () => Promise<unknown>,
    description?: string
  ): Promise<PurchaseResult> {
    const req = this.requirementsFor(resource, description);
    const payment = createPayment(req, this.wallet);

    const verify = await verifyPayment(payment, req);
    if (!verify.isValid) {
      return this.fail(req, payment, verify.invalidReason + ": " + verify.invalidMessage);
    }
    const settle = await settlePayment(payment, req);
    if (!settle.success) {
      return this.fail(req, payment, settle.errorReason + ": " + settle.errorMessage);
    }

    const record: PaymentRecord = {
      id: randomUUID().slice(0, 8),
      resource,
      amount: req.amount,
      priceLabel: req.priceLabel ?? req.amount,
      payer: payment.payload.authorization.from,
      payee: req.payTo,
      network: req.network,
      status: "settled",
      transaction: settle.transaction,
      ts: Date.now(),
    };
    this.payments.push(record);
    const data = await producer();
    return { ok: true, receipt: record, data };
  }

  private fail(
    req: PaymentRequirements,
    payment: PaymentPayload,
    reason: string
  ): PurchaseResult {
    const record: PaymentRecord = {
      id: randomUUID().slice(0, 8),
      resource: req.resource ?? "",
      amount: req.amount,
      priceLabel: req.priceLabel ?? req.amount,
      payer: payment.payload.authorization.from,
      payee: req.payTo,
      network: req.network,
      status: "failed",
      transaction: "",
      reason,
      ts: Date.now(),
    };
    this.payments.push(record);
    return { ok: false, receipt: record };
  }
}
