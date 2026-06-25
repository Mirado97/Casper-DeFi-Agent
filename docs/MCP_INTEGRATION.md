# Подключение Token Safety Oracle MCP к различным сервисам

Casper Token Safety Oracle опубликован как МCP сервер. Вы можете подключить его к различным приложениям и сервисам для использования инструмента `check_token_safety` с x402 платежами.

---

## 1. Claude Desktop

**Где находится конфиг:**
- **macOS:** `~/.config/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

**Инструкция:**

1. Откройте файл конфигурации Claude Desktop
2. Добавьте или обновите раздел `mcpServers`:

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

**Для локального запуска с полным путём:**

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

**Или через npx (если проект установлен глобально):**

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

3. Перезагрузите Claude Desktop (закройте и откройте заново)
4. В Claude Desktop должны появиться инструменты MCP сервера
5. Используйте инструмент `check_token_safety` в разговоре:
   - Сначала вызовите без `x_payment` параметра
   - Claude получит 402 требование
   - Claude автоматически подпишет платёж
   - Повторный вызов вернёт отчёт

**Пример запроса в Claude Desktop:**
```
Проверь безопасность токена sCSPR
```

---

## 2. Cursor (IDE)

**Где находится конфиг:**
- **macOS:** `~/.cursor/mcp_server_config.json` или `~/.config/Cursor/mcp_server_config.json`
- **Windows:** `%APPDATA%\Cursor\mcp_server_config.json`
- **Linux:** `~/.config/Cursor/mcp_server_config.json`

**Инструкция:**

1. Откройте файл конфигурации Cursor
2. Добавьте сервер:

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

3. Перезагрузите Cursor
4. Откройте Cursor Composer или используйте MCP в диалоге
5. Используйте `check_token_safety` в код-генерации:

```
Напиши скрипт, который проверяет безопасность токена sCSPR через MCP
```

**Важно:** Убедитесь, что в Cursor включена поддержка MCP (Settings → Features → MCP)

---

## 3. Другие MCP-клиенты

### 3.1. Команда стандартного MCP клиента (для разработчиков)

Если у вас есть свой MCP клиент, подключитесь к серверу через stdio:

```bash
# Запустить сервер в одном терминале
npm run mcp -w backend

# В другом терминале, ваш клиент подключится через stdio
node your-mcp-client.ts
```

### 3.2. Anthropic Claude SDK (для собственных приложений)

Если вы разрабатываете приложение на Node.js/TypeScript:

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

// Вызвать инструмент без оплаты (получить требование 402)
const result1 = await client.callTool({
  name: "check_token_safety",
  arguments: { token: "sCSPR" },
});

console.log("402 Requirement:", result1.content[0].text);

// Подписать платёж и повторить вызов
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

### 3.3. Python клиент (через subprocess)

```python
import subprocess
import json

# Запустить MCP сервер
process = subprocess.Popen(
    ["npm", "run", "mcp", "-w", "backend"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    cwd="/path/to/CasperHakaton"
)

# Отправить JSON-RPC запрос (MCP использует JSON-RPC по stdio)
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

## 4. Как самостоятельный сервис через HTTP

**Текущее состояние:** Сервер работает через stdio (Standard Input/Output), что безопасно для локального использования.

**Для HTTP доступа, нужно добавить HTTP обёртку:**

### 4.1. HTTP обёртка (рекомендуется)

Создайте файл `backend/src/mcp-http-server.ts`:

```typescript
/**
 * HTTP обёртка для MCP сервера Token Safety Oracle
 * Экспортирует check_token_safety как REST API с x402
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
    // Первый запрос — требуем оплату
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

**Добавьте скрипт в `backend/package.json`:**

```json
{
  "scripts": {
    "mcp:http": "tsx src/mcp-http-server.ts"
  }
}
```

**Запуск:**

```bash
npm run mcp:http -w backend
```

### 4.2. Использование HTTP API

**Первый запрос (получить требование):**

```bash
curl -X POST http://localhost:9000/mcp/check_token_safety \
  -H "Content-Type: application/json" \
  -d '{"token": "sCSPR"}'

# Ответ (402):
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

**Второй запрос (с подписанным платежом):**

```bash
curl -X POST http://localhost:9000/mcp/check_token_safety \
  -H "Content-Type: application/json" \
  -d '{
    "token": "sCSPR",
    "x_payment": "base64-encoded-payment-payload"
  }'

# Ответ (200):
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

### 4.3. Использование из JavaScript

```javascript
async function checkTokenSafety(token) {
  const API = "http://localhost:9000/mcp/check_token_safety";

  // 1. Получить требование
  const response1 = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  if (response1.status === 402) {
    const data = await response1.json();
    const requirements = data.accepts[0];

    // 2. Подписать платёж (псевдокод)
    const X402Wallet = require("./x402/wallet.js").X402Wallet;
    const { createPayment, encodePaymentHeader } = require("./x402/client.js");

    const wallet = new X402Wallet();
    const payment = createPayment(requirements, wallet);

    // 3. Повторить с подписью
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

## Сравнение способов подключения

| Способ | Плюсы | Минусы | Когда использовать |
|--------|-------|--------|-------------------|
| **Claude Desktop** | Простая интеграция, фронтенд для Claude | Только для Claude Desktop | Для юзеров Claude Desktop |
| **Cursor** | Встроено в IDE, удобно для разработки | Только для Cursor | Для разработчиков в Cursor |
| **MCP SDK клиент** | Полный контроль, легко встраивать | Нужно писать код | Для собственных приложений |
| **HTTP API** | Языко-независимый, легко масштабировать | Нужна HTTP обёртка | Для веб-сервисов, микросервисов |

---

## Troubleshooting

**Проблема:** "MCP сервер не подключается"
- Убедитесь, что `npm install` выполнен в `backend/`
- Проверьте путь `cwd` в конфигурации
- Посмотрите логи в консоли

**Проблема:** "402 требование не приходит"
- Убедитесь, что `X402_FACILITATOR_MODE=local` в `backend/.env`
- Проверьте конфиг x402 в `backend/.env`

**Проблема:** "Платёж отклоняется"
- Проверьте формат `x_payment` (должен быть base64)
- Убедитесь, что подпись верна (используйте `X402Wallet`)
- Посмотрите логи сервера для деталей ошибки

---

## Примеры интеграции

### Пример 1: Chatbot на Node.js (использует MCP)

```typescript
import { Anthropic } from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Подключить MCP
const transport = new StdioClientTransport({
  command: "npm",
  args: ["run", "mcp", "-w", "backend"],
});
const mcpClient = new Client({ name: "chatbot" });
await mcpClient.connect(transport);

// Использовать Claude с MCP инструментами
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

### Пример 2: REST API с х402 (Express)

См. раздел 4.1 выше.

---

## Ссылки

- [MCP Specification](https://modelcontextprotocol.io)
- [Anthropic SDK Docs](https://docs.anthropic.com)
- [Casper Network Docs](https://docs.casper.network)
- [x402 Specification](https://github.com/make-software/casper-x402)
