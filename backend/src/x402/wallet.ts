import { secp256k1 } from "@noble/curves/secp256k1";
import pkg from "casper-js-sdk";

const { PublicKey } = pkg as any;

/**
 * Платёжный кошелёк агента для x402 — secp256k1 (EIP-712 подпись).
 * Отдельный от Casper-кошелька DEX (тот ed25519 для подписи транзакций свопов).
 */
export class X402Wallet {
  private priv: Uint8Array;
  readonly publicKeyHex: string; // Casper-формат: "02" + сжатый ключ
  readonly accountHashHex: string; // 64 hex (без префикса)
  readonly ephemeral: boolean;

  constructor(hex?: string) {
    if (hex) {
      this.priv = Buffer.from(hex.replace(/^0x/, ""), "hex");
      this.ephemeral = false;
    } else {
      this.priv = secp256k1.utils.randomPrivateKey();
      this.ephemeral = true;
    }
    const pubC = secp256k1.getPublicKey(this.priv, true);
    this.publicKeyHex = "02" + Buffer.from(pubC).toString("hex");
    this.accountHashHex = PublicKey.fromHex(this.publicKeyHex)
      .accountHash()
      .toHex()
      .replace(/^account-hash-/, "");
  }

  /** Адрес получателя/отправителя в формате payTo: "00" + account hash. */
  get taggedAddress(): string {
    return "00" + this.accountHashHex;
  }

  /** Подписывает 32-байтный EIP-712 дайджест, возвращает 65 байт (r||s||v). */
  sign(digest: Uint8Array): Uint8Array {
    const sig = secp256k1.sign(digest, this.priv);
    const out = new Uint8Array(65);
    out.set(sig.toCompactRawBytes(), 0);
    out[64] = sig.recovery;
    return out;
  }
}
