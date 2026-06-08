/**
 * Генератор кошелька Casper для агента.
 * Запуск:  npm run keygen -w backend          (ed25519 по умолчанию)
 *          npm run keygen -w backend secp256k1
 *
 * Печатает публичный ключ / account hash / приватный ключ (hex) и сохраняет PEM.
 * ВНИМАНИЕ: приватный ключ — секрет. Не публикуй, не коммить .pem (он в .gitignore).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "casper-js-sdk";

const { PrivateKey, KeyAlgorithm } = pkg as any;

const algoArg = (process.argv[2] ?? "ed25519").toLowerCase();
const algo =
  algoArg === "secp256k1" ? KeyAlgorithm.SECP256K1 : KeyAlgorithm.ED25519;

const pk = await PrivateKey.generate(algo);
const publicKeyHex: string = pk.publicKey.toHex();
const secretHex: string = Buffer.from(pk.toBytes()).toString("hex");
const accountHash: string = pk.publicKey.accountHash().toHex();

const outDir = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const pemPath = path.join(outDir, "secret_key.pem");
fs.writeFileSync(pemPath, pk.toPem(), { mode: 0o600 });

console.log("\n=== Casper кошелёк создан (" + algoArg + ") ===\n");
console.log("Публичный ключ (адрес):", publicKeyHex);
console.log("Account hash         :", accountHash);
console.log("Приватный ключ (hex) :", secretHex);
console.log("PEM сохранён в        :", pemPath);
console.log("\n--- Вставь в backend/.env ОДИН из вариантов ---");
console.log("CASPER_SECRET_KEY_HEX=" + secretHex);
console.log("CASPER_KEY_ALGO=" + algoArg);
console.log("# или:");
console.log("CASPER_SECRET_KEY_PEM=" + pemPath);
console.log(
  "\nДальше: переведи немного CSPR на адрес выше (публичный ключ), чтобы агент мог платить газ.\n"
);
