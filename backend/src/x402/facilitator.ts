import { secp256k1 } from "@noble/curves/secp256k1";
import pkg from "casper-js-sdk";
import { config } from "../config.js";
import { buildDigest } from "./client.js";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResult,
  VerifyResult,
} from "./types.js";

const { PublicKey } = pkg as any;

function strip(addr: string): string {
  const h = addr.replace(/^0x/, "");
  return h.length === 66 ? h.slice(2) : h;
}

/** Локальная верификация: реальная EIP-712/secp256k1 проверка без on-chain расчёта. */
function verifyLocal(
  payload: PaymentPayload,
  req: PaymentRequirements
): VerifyResult {
  try {
    const a = payload.payload.authorization;
    const now = Math.floor(Date.now() / 1000);
    if (Number(a.validBefore) < now)
      return { isValid: false, invalidReason: "expired", invalidMessage: "Авторизация истекла" };
    if (Number(a.validAfter) > now)
      return { isValid: false, invalidReason: "not_yet_valid", invalidMessage: "Ещё не активна" };
    if (BigInt(a.value) < BigInt(req.amount))
      return { isValid: false, invalidReason: "insufficient_value", invalidMessage: "Сумма меньше требуемой" };
    if (payload.network !== req.network)
      return { isValid: false, invalidReason: "network_mismatch", invalidMessage: "Сеть не совпадает" };

    const digest = buildDigest(
      req,
      strip(a.from),
      Number(a.validAfter),
      Number(a.validBefore),
      a.nonce
    );
    const sig = Buffer.from(payload.payload.signature.replace(/^0x/, ""), "hex");
    const pubCompressed = Buffer.from(payload.payload.publicKey.slice(2), "hex"); // снять "02"-тег
    const okSig = secp256k1.verify(sig.subarray(0, 64), digest, pubCompressed);
    if (!okSig)
      return { isValid: false, invalidReason: "bad_signature", invalidMessage: "Подпись неверна" };

    const derived = PublicKey.fromHex(payload.payload.publicKey)
      .accountHash()
      .toHex()
      .replace(/^account-hash-/, "");
    if (derived !== strip(a.from))
      return { isValid: false, invalidReason: "from_mismatch", invalidMessage: "from не соответствует ключу" };

    return { isValid: true, payer: a.from };
  } catch (e) {
    return { isValid: false, invalidReason: "error", invalidMessage: String(e) };
  }
}

async function callFacilitator(
  path: string,
  payload: PaymentPayload,
  req: PaymentRequirements
): Promise<any> {
  const res = await fetch(config.x402.facilitatorUrl + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.x402.facilitatorToken
        ? { Authorization: `Bearer ${config.x402.facilitatorToken}` }
        : {}),
    },
    body: JSON.stringify({ paymentPayload: payload, paymentRequirements: req }),
  });
  if (!res.ok) throw new Error(`facilitator ${path} → HTTP ${res.status}`);
  return res.json();
}

export async function verifyPayment(
  payload: PaymentPayload,
  req: PaymentRequirements
): Promise<VerifyResult> {
  if (config.x402.mode === "remote") return callFacilitator("/verify", payload, req);
  return verifyLocal(payload, req);
}

/** Расчёт платежа. В local-режиме on-chain расчёта нет — возвращаем симуляцию. */
export async function settlePayment(
  payload: PaymentPayload,
  req: PaymentRequirements
): Promise<SettleResult> {
  if (config.x402.mode === "remote") return callFacilitator("/settle", payload, req);
  const v = verifyLocal(payload, req);
  if (!v.isValid)
    return {
      success: false,
      errorReason: v.invalidReason,
      errorMessage: v.invalidMessage,
      transaction: "",
      network: req.network,
      payer: payload.payload.authorization.from,
    };
  // Симулированный «хэш» расчёта для демо (local mode без on-chain перевода).
  return {
    success: true,
    transaction: "local-" + payload.payload.authorization.nonce.slice(0, 16),
    network: req.network,
    payer: v.payer,
  };
}
