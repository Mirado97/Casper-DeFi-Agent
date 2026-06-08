import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export type McpTool = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
};

/**
 * Тонкая обёртка над MCP-клиентом для CSPR.trade.
 * Подключается к публичному эндпоинту (по умолчанию https://mcp.cspr.trade/mcp),
 * отдаёт список тулов и проксирует их вызовы.
 *
 * Сервер non-custodial: транзакции строятся удалённо, подписываются локально.
 */
export class CsprTradeMcp {
  private client: Client;
  private connected = false;

  constructor(private url: string) {
    this.client = new Client(
      { name: "casper-defi-agent", version: "0.1.0" },
      { capabilities: {} }
    );
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    const transport = new StreamableHTTPClientTransport(new URL(this.url));
    await this.client.connect(transport);
    this.connected = true;
  }

  async listTools(): Promise<McpTool[]> {
    await this.connect();
    const res = await this.client.listTools();
    return res.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.connect();
    const res = await this.client.callTool({ name, arguments: args });
    return res.content;
  }
}
