/**
 * Standalone MCP server: Casper Token Safety Oracle, продаваемый по x402.
 * Любой внешний AI-агент (Claude Desktop, Cursor, чужой бот) подключает этот
 * сервер и вызывает check_token_safety. Без оплаты — возвращаются x402-требования;
 * с подписанным платежом (x_payment) — проверка выполняется и оплачивается.
 *
 * Запуск:  npm run mcp -w backend       (stdio transport)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { config } from "./config.js";
import { CsprTradeMcp } from "./mcpClient.js";
import { SafetyOracle } from "./safety/oracle.js";
import { X402Service } from "./x402/service.js";
import { decodePaymentHeader } from "./x402/client.js";

const mcp = new CsprTradeMcp(config.csprTradeMcpUrl);
const oracle = new SafetyOracle(mcp);
const x402 = new X402Service();

const server = new McpServer({ name: "casper-token-safety", version: "0.1.0" });

const text = (obj: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] });

// cast: registerTool + zod inputSchema вызывает TS2589 (глубокая инфер-цепочка) — рантайм ок.
(server.registerTool as any)(
  "check_token_safety",
  {
    title: "Casper Token Safety Oracle (x402-paid)",
    description:
      "Screen a Casper token for honeypot / sell-tax (round-trip quotes) and liquidity (price impact). " +
      "Paid per call via x402: call without x_payment to receive payment requirements, then sign a " +
      "TransferAuthorization and call again with x_payment (base64 x402 PaymentPayload).",
    inputSchema: {
      token: z.string().describe("Token symbol or package hash, e.g. sCSPR"),
      x_payment: z
        .string()
        .optional()
        .describe("Base64-encoded x402 PaymentPayload (omit to get payment requirements)"),
    },
  },
  async ({ token, x_payment }: { token: string; x_payment?: string }) => {
    const requirements = x402.requirementsFor("safety-check");
    if (!x_payment) {
      return text({
        status: 402,
        error: "payment required",
        message: "Sign the requirements as an x402 TransferAuthorization and resend with x_payment (base64).",
        accepts: [requirements],
      });
    }
    try {
      const payload = decodePaymentHeader(x_payment);
      const result = await x402.fulfill("safety-check", payload, () => oracle.check(token));
      if (!result.ok) {
        return text({ status: 402, error: "payment rejected", receipt: result.receipt });
      }
      return text({ paid: result.receipt, report: result.data });
    } catch (e) {
      return text({ status: 400, error: String(e) });
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
// stderr — чтобы не мешать stdio-протоколу в stdout
console.error("Casper Token Safety MCP server ready (stdio). Tool: check_token_safety");
