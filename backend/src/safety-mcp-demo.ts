/**
 * Демо «внешнего агента», который покупает проверку токена у нашего MCP-сервера
 * по x402. Спавнит safety-mcp.ts, вызывает инструмент без оплаты (получает 402),
 * подписывает платёж своим кошельком и вызывает снова — получает отчёт.
 *
 * Запуск:  npm run mcp:demo -w backend [TOKEN]
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { X402Wallet } from "./x402/wallet.js";
import { createPayment, encodePaymentHeader } from "./x402/client.js";
import type { PaymentRequirements } from "./x402/types.js";

const token = process.argv[2] ?? "sCSPR";

const transport = new StdioClientTransport({
  command: process.execPath, // node
  args: ["--import", "tsx", "src/safety-mcp.ts"],
});
const client = new Client({ name: "external-buyer-agent", version: "0.1.0" });
await client.connect(transport);

function parse(res: any) {
  return JSON.parse(res.content?.[0]?.text ?? "{}");
}

// 1) Вызов без оплаты → 402 + требования
const r1 = parse(await client.callTool({ name: "check_token_safety", arguments: { token } }));
console.log("[1] no payment → status:", r1.status, "| price:", r1.accepts?.[0]?.priceLabel);

const req = r1.accepts[0] as PaymentRequirements;

// 2) Внешний агент подписывает x402-платёж и повторяет вызов
const buyer = new X402Wallet();
const payment = createPayment(req, buyer);
const r2 = parse(
  await client.callTool({
    name: "check_token_safety",
    arguments: { token, x_payment: encodePaymentHeader(payment) },
  })
);
console.log("[2] paid → receipt:", r2.paid?.priceLabel, r2.paid?.status, "tx:", r2.paid?.transaction);
console.log("    report:", r2.report?.token, "| level:", r2.report?.level, "| score:", r2.report?.score);
console.log("    factors:", (r2.report?.factors ?? []).join(" | "));

await client.close();
process.exit(0);
