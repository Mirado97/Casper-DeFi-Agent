# Connecting the Token Safety Oracle MCP to various services

The Casper Token Safety Oracle is published as an MCP server. You can connect it to a range of applications and services to use the `check_token_safety` tool with x402 payments.

---

## 1. Claude Desktop

**Where the config lives:**
- **macOS:** `~/.config/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

**Instructions:**

1. Open the Claude Desktop configuration file
2. Add or update the `mcpServers` section:

```json
{
  "mcpServers": {
    "casper-token-safety": {
      "command": "npm",
      "args": ["run", "mcp", "-w", "backend"]
    }
  }
}
```

**To run locally with a full path:**

```json
{
  "mcpServers": {
    "casper-token-safety": {
      "command": "npm",
      "args": [
        "run",
        "mcp",
        "-w",
        "backend"
      ],
      "cwd": "/path/to/CasperHakaton"
    }
  }
}
```

**Or via npx (if the project is installed globally):**

```json
{
  "mcpServers": {
    "casper-token-safety": {
      "command": "npx",
      "args": [
        "tsx",
        "/path/to/CasperHakaton/backend/src/safety-mcp.ts"
      ]
    }
  }
}
```

3. Restart Claude Desktop (close it and open it again)
4. The MCP server's tools should now appear in Claude Desktop
5. Use the `check_token_safety` tool in conversation:
   - Call it first without the `x_payment` parameter
   - Claude receives a 402 requirement
   - Claude signs the payment automatically
   - The repeat call returns the report

**Example prompt in Claude Desktop:**
```
Check whether the sCSPR token is safe
```

---

## 2. Cursor (IDE)

**Where the config lives:**
- **macOS:** `~/.cursor/mcp_server_config.json` or `~/.config/Cursor/mcp_server_config.json`
- **Windows:** `%APPDATA%\Cursor\mcp_server_config.json`
- **Linux:** `~/.config/Cursor/mcp_server_config.json`

**Instructions:**

1. Open the Cursor configuration file
2. Add the server:

```json
{
  "mcpServers": {
    "casper-token-safety": {
      "command": "npm",
      "args": ["run", "mcp", "-w", "backend"],
      "cwd": "/path/to/CasperHakaton"
    }
  }
}
```

3. Restart Cursor
4. Open Cursor Composer or use MCP in a chat
5. Use `check_token_safety` in code generation:

```
Write a script that checks the safety of the sCSPR token via MCP
```

**Important:** make sure MCP support is enabled in Cursor (Settings → Features → MCP)

---

## 3. Other MCP clients

### 3.1. Standard MCP client command (for developers)

If you have your own MCP client, connect to the server over stdio:

```bash
# Start the server in one terminal
npm run mcp -w backend

# In another terminal, your client connects over stdio
node your-mcp-client.ts
```

### 3.2. Anthropic Claude SDK (for your own applications)

If you are building a Node.js/TypeScript application:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "npm",
  args: ["run", "mcp", "-w", "backend"],
});

const client = new Client({
  name: "my-agent",
  version: "1.0.0",
});

await client.connect(transport);

// Call the tool without payment (get the 402 requirement)
const result1 = await client.callTool({
  name: "check_token_safety",
  arguments: { token: "sCSPR" },
});

console.log("402 Requirement:", result1.content[0].text);

// Sign the payment and repeat the call
const X402Wallet = require("./x402/wallet.js").X402Wallet;
const { createPayment, encodePaymentHeader } = require("./x402/client.js");

const buyer = new X402Wallet();
const requirements = JSON.parse(result1.content[0].text).accepts[0];
const payment = createPayment(requirements, buyer);

const result2 = await client.callTool({
  name: "check_token_safety",
  arguments: {
    token: "sCSPR",
    x_payment: encodePaymentHeader(payment),
  },
});

console.log("Report:", result2.content[0].text);
await client.close();
```

### 3.3. Python client (via subprocess)

```python
import subprocess
import json

# Start the MCP server
process = subprocess.Popen(
    ["npm", "run", "mcp", "-w", "backend"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    cwd="/path/to/CasperHakaton"
)

# Send a JSON-RPC request (MCP speaks JSON-RPC over stdio)
request = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
        "name": "check_token_safety",
        "arguments": {"token": "sCSPR"}
    }
}

process.stdin.write(json.dumps(request).encode() + b'\n')
response = process.stdout.readline()
print(json.loads(response))
```

---

## 4. As a standalone service over HTTP

**Current state:** the server runs over stdio (Standard Input/Output), which is safe for local use.

**For HTTP access you need to add an HTTP wrapper:**

### 4.1. HTTP wrapper (recommended)

Create the file `backend/src/mcp-http-server.ts`:

```typescript
/**
 * HTTP wrapper for the Token Safety Oracle MCP server
 * Exposes check_token_safety as a REST API with x402
 */
import express from "express";
import { CsprTradeMcp } from "./mcpClient.js";
import { SafetyOracle } from "./safety/oracle.js";
import { X402Service } from "./x402/service.js";
import { decodePaymentHeader } from "./x402/client.js";
import { config } from "./config.js";

const app = express();
app.use(express.json());

const mcp = new CsprTradeMcp(config.csprTradeMcpUrl);
const oracle = new SafetyOracle(mcp);
const x402 = new X402Service();

// POST /mcp/check_token_safety
app.post("/mcp/check_token_safety", async (req, res) => {
  const { token, x_payment } = req.body;

  if (!token) {
    return res.status(400).json({ error: "token parameter required" });
  }

  const requirements = x402.requirementsFor("safety-check");

  if (!x_payment) {
    // First request — demand payment
    return res.status(402).json({
      error: "payment required",
      message: "Sign the requirements as x402 TransferAuthorization",
      accepts: [requirements],
    });
  }

  try {
    const payload = decodePaymentHeader(x_payment);
    const result = await x402.fulfill("safety-check", payload, () =>
      oracle.check(token)
    );

    if (!result.ok) {
      return res.status(402).json({
        error: "payment rejected",
        receipt: result.receipt,
      });
    }

    return res.json({
      paid: result.receipt,
      report: result.data,
    });
  } catch (e) {
    return res.status(400).json({ error: String(e) });
  }
});

// GET /mcp/health
app.get("/mcp/health", (req, res) => {
  res.json({ status: "ok", service: "casper-token-safety-oracle" });
});

const PORT = process.env.MCP_HTTP_PORT || 9000;
app.listen(PORT, () => {
  console.log(`Token Safety Oracle HTTP API running on port ${PORT}`);
  console.log(`POST http://localhost:${PORT}/mcp/check_token_safety`);
});
```

**Add a script to `backend/package.json`:**

```json
{
  "scripts": {
    "mcp:http": "tsx src/mcp-http-server.ts"
  }
}
```

**Run it:**

```bash
npm run mcp:http -w backend
```

### 4.2. Using the HTTP API

**First request (get the requirement):**

```bash
curl -X POST http://localhost:9000/mcp/check_token_safety \
  -H "Content-Type: application/json" \
  -d '{"token": "sCSPR"}'

# Response (402):
# {
#   "error": "payment required",
#   "accepts": [{
#     "symbol": "USDC",
#     "amount": "0.002",
#     "priceLabel": "0.002 USDC",
#     "asset": "...",
#     "nonce": "...",
#     "notBefore": "...",
#     "notAfter": "..."
#   }]
# }
```

**Second request (with a signed payment):**

```bash
curl -X POST http://localhost:9000/mcp/check_token_safety \
  -H "Content-Type: application/json" \
  -d '{
    "token": "sCSPR",
    "x_payment": "base64-encoded-payment-payload"
  }'

# Response (200):
# {
#   "paid": {
#     "status": "settled",
#     "transaction": "local-abc123...",
#     "priceLabel": "0.002 USDC"
#   },
#   "report": {
#     "token": "sCSPR",
#     "level": "SAFE",
#     "score": 100,
#     "factors": [...]
#   }
# }
```

### 4.3. Using it from JavaScript

```javascript
async function checkTokenSafety(token) {
  const API = "http://localhost:9000/mcp/check_token_safety";

  // 1. Get the requirement
  const response1 = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  if (response1.status === 402) {
    const data = await response1.json();
    const requirements = data.accepts[0];

    // 2. Sign the payment (pseudocode)
    const X402Wallet = require("./x402/wallet.js").X402Wallet;
    const { createPayment, encodePaymentHeader } = require("./x402/client.js");

    const wallet = new X402Wallet();
    const payment = createPayment(requirements, wallet);

    // 3. Retry with the signature
    const response2 = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        x_payment: encodePaymentHeader(payment),
      }),
    });

    const result = await response2.json();
    console.log("Report:", result.report);
    return result.report;
  }
}

checkTokenSafety("sCSPR");
```

---

## Comparing the connection methods

| Method | Pros | Cons | When to use |
|--------|------|------|-------------|
| **Claude Desktop** | Simple integration, a frontend for Claude | Claude Desktop only | For Claude Desktop users |
| **Cursor** | Built into the IDE, convenient while developing | Cursor only | For developers working in Cursor |
| **MCP SDK client** | Full control, easy to embed | You have to write code | For your own applications |
| **HTTP API** | Language-agnostic, easy to scale | Needs an HTTP wrapper | For web services and microservices |

---

## Troubleshooting

**Problem:** "The MCP server won't connect"
- Make sure `npm install` has been run in `backend/`
- Check the `cwd` path in the configuration
- Look at the console logs

**Problem:** "The 402 requirement never arrives"
- Make sure `X402_FACILITATOR_MODE=local` is set in `backend/.env`
- Check the x402 config in `backend/.env`

**Problem:** "The payment is rejected"
- Check the format of `x_payment` (it must be base64)
- Make sure the signature is valid (use `X402Wallet`)
- Look at the server logs for error details

---

## Integration examples

### Example 1: A Node.js chatbot (using MCP)

```typescript
import { Anthropic } from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Connect MCP
const transport = new StdioClientTransport({
  command: "npm",
  args: ["run", "mcp", "-w", "backend"],
});
const mcpClient = new Client({ name: "chatbot" });
await mcpClient.connect(transport);

// Use Claude with the MCP tools
const anthropic = new Anthropic();
const tools = [
  {
    name: "check_token_safety",
    description: "Check if a Casper token is safe (requires x402 payment)",
    input_schema: {
      type: "object",
      properties: {
        token: { type: "string" },
        x_payment: { type: "string" },
      },
    },
  },
];

const response = await anthropic.messages.create({
  model: "claude-opus-4-1",
  max_tokens: 1024,
  tools,
  messages: [
    {
      role: "user",
      content: "Is sCSPR token safe?",
    },
  ],
});

console.log(response);
```

### Example 2: A REST API with x402 (Express)

See section 4.1 above.

---

## Links

- [MCP Specification](https://modelcontextprotocol.io)
- [Anthropic SDK Docs](https://docs.anthropic.com)
- [Casper Network Docs](https://docs.casper.network)
- [x402 Specification](https://github.com/make-software/casper-x402)
