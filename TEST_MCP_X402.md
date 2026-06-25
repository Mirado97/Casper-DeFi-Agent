# MCP x402 Тестирование

**Дата:** 25 июня 2026  
**Статус:** ✅ РАБОТАЕТ

---

## Что тестировали

Внешний клиент подключается к MCP серверу `safety-mcp.ts` и вызывает инструмент `check_token_safety` через x402 платежи (без встроенного в приложение контекста).

## Результаты

### Тест 1: Проверка токена sCSPR

```
[1] Первый вызов БЕЗ оплаты:
    status: 402 (Payment Required)
    price: 0.002 USDC

[2] Второй вызов С подписанным платежом:
    receipt: 0.002 USDC settled
    transaction: local-1c4e2ae7c6ca4071
    
    report:
      token: sCSPR
      level: SAFE
      score: 100
      factors: No major risk signals detected from DEX-side checks
```

### Тест 2: Проверка токена CSPR

```
[1] Первый вызов БЕЗ оплаты:
    status: 402 (Payment Required)
    price: 0.002 USDC

[2] Второй вызов С подписанным платежом:
    receipt: 0.002 USDC settled
    transaction: local-853066a31ca772be
    
    report:
      token: CSPR
      level: DANGER
      score: 30
      factors: Cannot sell the token back — likely honeypot or transfers blocked
```

---

## Запуск тестов

```bash
# Запустить MCP demo (автоматически спавнит сервер + клиент)
npm run mcp:demo -w backend -- [TOKEN_SYMBOL]

# Примеры:
npm run mcp:demo -w backend -- sCSPR
npm run mcp:demo -w backend -- CSPR
npm run mcp:demo -w backend -- WCSPR
```

---

## Что проверили

✅ **MCP сервер запускается** — `Casper Token Safety MCP server ready`

✅ **x402 требования работают** — первый вызов возвращает 402 + requirements

✅ **x402 платежи работают** — клиент подписывает TransferAuthorization и отправляет

✅ **Платежи обрабатываются** — сервер проверяет подпись и выполняет операцию

✅ **Отчёты генерируются** — каждый платёж возвращает детальный анализ токена

✅ **Разные tx ID** — каждая транзакция получает уникальный ID

✅ **Разные результаты** — система выдаёт разные уровни риска для разных токенов

---

## Заключение

**MCP x402 система полностью работает через внешний клиент.**

Система готова для:
- Продажи Token Safety Oracle другим AI-агентам
- Использования в Claude Desktop через конфиг MCP
- Использования в других приложениях через MCP + x402
