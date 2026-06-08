/** Типы протокола x402 (Casper «exact» scheme). */

export type PaymentRequirements = {
  scheme: "exact";
  network: string; // CAIP-2, напр. "casper:casper"
  payTo: string; // "00" + 64 hex (account hash с тегом)
  amount: string; // в наименьших единицах CEP-18
  asset: string; // package hash CEP-18 (64 hex)
  extra: { name: string; version: string; decimals: string };
  maxTimeoutSeconds: number;
  // не часть спеки, для UI:
  resource?: string;
  description?: string;
  priceLabel?: string;
};

export type Authorization = {
  from: string; // "00" + 64 hex
  to: string; // "00" + 64 hex
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string; // 64 hex (32 bytes)
};

export type PaymentPayload = {
  x402Version: 2;
  scheme: "exact";
  network: string;
  payload: {
    signature: string; // 130 hex (65 bytes r||s||v)
    publicKey: string; // Casper hex (02… secp256k1)
    authorization: Authorization;
  };
};

export type VerifyResult =
  | { isValid: true; payer: string }
  | { isValid: false; invalidReason: string; invalidMessage: string };

export type SettleResult =
  | { success: true; transaction: string; network: string; payer: string }
  | {
      success: false;
      errorReason: string;
      errorMessage: string;
      transaction: string;
      network: string;
      payer: string;
    };
