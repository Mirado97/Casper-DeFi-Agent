import fs from "node:fs";
import pkg from "casper-js-sdk";
import { config } from "./config.js";

const { PrivateKey, KeyAlgorithm, TransactionV1 } = pkg as any;

function algoEnum(): number {
  return config.casperKeyAlgo === "secp256k1"
    ? KeyAlgorithm.SECP256K1
    : KeyAlgorithm.ED25519;
}

async function loadKey(): Promise<{ key: any; ephemeral: boolean }> {
  const algo = algoEnum();
  if (config.casperSecretKeyPem) {
    const pem = fs.readFileSync(config.casperSecretKeyPem, "utf8");
    return { key: await PrivateKey.fromPem(pem, algo), ephemeral: false };
  }
  if (config.casperSecretKeyHex) {
    return { key: await PrivateKey.fromHex(config.casperSecretKeyHex, algo), ephemeral: false };
  }
  // Нет ключа — генерим эфемерный: подписывать можно, но средств на нём нет.
  return { key: await PrivateKey.generate(algo), ephemeral: true };
}

/**
 * Локальный кошелёк агента. Хранит приватный ключ на стороне оператора
 * (non-custodial), отдаёт публичный ключ и подписывает Casper-транзакции.
 */
export class Wallet {
  private constructor(
    private pk: any,
    readonly publicKeyHex: string,
    readonly ephemeral: boolean
  ) {}

  static async create(): Promise<Wallet> {
    const { key, ephemeral } = await loadKey();
    return new Wallet(key, key.publicKey.toHex(), ephemeral);
  }

  /** Подписывает unsigned TransactionV1 JSON, возвращает подписанную JSON-строку. */
  async signTransactionJson(txJson: Record<string, unknown>): Promise<string> {
    // casper-js-sdk 5.x: fromJSON/toJSON — статические, sign — синхронный (void).
    const tx = TransactionV1.fromJSON(txJson);
    tx.sign(this.pk);
    return JSON.stringify(TransactionV1.toJSON(tx));
  }
}
