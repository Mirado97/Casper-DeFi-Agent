import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 8787),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  // Базовый URL Anthropic API (или совместимого прокси). SDK сам добавит /v1/messages.
  // Убираем хвостовой слэш, чтобы не получить двойной // в пути.
  anthropicBaseUrl: (process.env.ANTHROPIC_BASE_URL ?? "").replace(/\/+$/, ""),
  model: process.env.AGENT_MODEL ?? "claude-sonnet-4-6",
  csprTradeMcpUrl:
    process.env.CSPR_TRADE_MCP_URL ?? "https://mcp.cspr.trade/mcp",

  // RPC-эндпоинт ноды Casper для ПРЯМОЙ отправки подписанной транзакции.
  // Нужен потому, что submit_transaction у CSPR.trade MCP режет тело >~100КБ (413),
  // а своп с session-code весит ~107КБ. Пусто = отправляем через MCP (старый путь).
  casperNodeRpcUrl: process.env.CASPER_NODE_RPC_URL ?? "",

  // Кошелёк агента для локальной подписи транзакций (non-custodial).
  // Приоритет: PEM-файл → hex-ключ → эфемерный (генерится при старте, без средств).
  casperSecretKeyPem: process.env.CASPER_SECRET_KEY_PEM ?? "",
  casperSecretKeyHex: process.env.CASPER_SECRET_KEY_HEX ?? "",
  casperKeyAlgo: (process.env.CASPER_KEY_ALGO ?? "ed25519").toLowerCase(),

  // --- x402 микроплатежи агента ---
  x402: {
    // local: реальная EIP-712 подпись + крипто-верификация без on-chain расчёта (для демо).
    // remote: проверка/расчёт через настоящий фасилитатор CSPR.cloud (нужен токен + CEP-18).
    mode: (process.env.X402_FACILITATOR_MODE ?? "local").toLowerCase(),
    facilitatorUrl:
      process.env.X402_FACILITATOR_URL ?? "https://x402-facilitator.cspr.cloud",
    facilitatorToken: process.env.X402_FACILITATOR_TOKEN ?? "",
    network: process.env.X402_NETWORK ?? "casper:casper", // mainnet; casper:casper-test для тестнета
    chainName: process.env.X402_CHAIN_NAME ?? "casper", // имя сети в EIP-712 домене
    // CEP-18 токен оплаты (на demo-токене x402 из buildathon)
    assetPackage:
      process.env.X402_ASSET_PACKAGE ??
      "0128f81ca57b94a40650c23d314f5d7b363e7dd4acccb714d1d2365d27a41843",
    assetName: process.env.X402_ASSET_NAME ?? "Cep18x402",
    assetVersion: process.env.X402_ASSET_VERSION ?? "1",
    assetDecimals: process.env.X402_ASSET_DECIMALS ?? "9",
    // Получатель платежа (merchant) — "00" + 64 hex account hash. По умолчанию demo-адрес.
    payee:
      process.env.X402_PAYEE ??
      "0000000000000000000000000000000000000000000000000000000000000001",
    // Цена премиум-вызова в наименьших единицах токена (0.001 при 9 знаках = 1_000_000).
    price: process.env.X402_PRICE ?? "1000000",
    priceLabel: process.env.X402_PRICE_LABEL ?? "0.001 USDC",
    // secp256k1 приватный ключ платёжного кошелька агента (64 hex). Иначе — эфемерный.
    paymentKeyHex: process.env.X402_PAYMENT_KEY_HEX ?? "",
  },
};
