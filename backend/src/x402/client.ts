import { randomBytes } from "node:crypto";
import * as eip from "@casper-ecosystem/casper-eip-712";
import { config } from "../config.js";
import { X402Wallet } from "./wallet.js";
import type { PaymentPayload, PaymentRequirements } from "./types.js";

/** Снимает 33-байтный тег "00"/"01" с адреса, оставляя 32-байтный hash (64 hex). */
function strip(addr: string): string {
  const h = addr.replace(/^0x/, "");
  return h.length === 66 ? h.slice(2) : h;
}

/** Строит EIP-712 дайджест TransferAuthorization для заданных параметров. */
export function buildDigest(
  req: PaymentRequirements,
  fromHash: string,
  validAfter: number,
  validBefore: number,
  nonceHex: string
): Uint8Array {
  const domain = eip.buildDomain(
    req.extra.name,
    req.extra.version,
    config.x402.chainName,
    "0x" + strip(req.asset)
  );
  const message = {
    from: "0x" + strip(fromHash),
    to: "0x" + strip(req.payTo),
    value: BigInt(req.amount),
    valid_after: validAfter,
    valid_before: validBefore,
    nonce: "0x" + nonceHex,
  };
  return eip.hashTypedData(
    domain,
    eip.TransferAuthorizationTypes,
    "TransferAuthorization",
    message
  );
}

/** Подписывает требования оплаты кошельком агента и возвращает PaymentPayload. */
export function createPayment(
  req: PaymentRequirements,
  wallet: X402Wallet
): PaymentPayload {
  const now = Math.floor(Date.now() / 1000);
  const validAfter = now - 10;
  const validBefore = now + (req.maxTimeoutSeconds || 900);
  const nonceHex = randomBytes(32).toString("hex");

  const digest = buildDigest(
    req,
    wallet.accountHashHex,
    validAfter,
    validBefore,
    nonceHex
  );
  const signature = Buffer.from(wallet.sign(digest)).toString("hex");

  return {
    x402Version: 2,
    scheme: "exact",
    network: req.network,
    payload: {
      signature,
      publicKey: wallet.publicKeyHex,
      authorization: {
        from: wallet.taggedAddress,
        to: req.payTo,
        value: req.amount,
        validAfter: String(validAfter),
        validBefore: String(validBefore),
        nonce: nonceHex,
      },
    },
  };
}

/** Кодирует payload в заголовок PAYMENT-SIGNATURE (base64 JSON, как в x402). */
export function encodePaymentHeader(payload: PaymentPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

export function decodePaymentHeader(header: string): PaymentPayload {
  return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
}
