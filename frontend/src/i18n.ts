export type Lang = "en" | "ru";

export const TOOL_ICONS: Record<string, string> = {
  get_quote: "💱",
  analyze_trade: "🔬",
  estimate_price_impact: "📉",
  estimate_slippage: "📊",
  get_tokens: "🪙",
  get_pairs: "🔗",
  get_portfolio_value: "💼",
  get_native_cspr_balance: "💰",
  get_token_balance: "💰",
  build_swap: "🛠️",
  sign_and_submit: "✍️",
  get_my_wallet: "🔑",
  get_market_intel: "💸",
  get_safety_signal: "🛡️",
  check_token_safety: "🛡️",
};

type Dict = {
  brandTag: string;
  online: string;
  offline: string;
  connecting: string;
  net: string;
  copy: string;
  copied: string;
  warnTest: string;
  warnFund: string;
  x402Title: string;
  modeSuffix: string;
  x402Empty: string;
  earned: string;
  spent: string;
  ledgerNet: string;
  simBuyer: string;
  capsTitle: string;
  caps: string[];
  heroBadge: string;
  heroH1: [string, string];
  heroSub: string;
  suggestions: { icon: string; text: string }[];
  placeholder: string;
  send: string;
  actions: string;
  inputLabel: string;
  resultLabel: string;
  errorPrefix: string;
  netError: string;
  demoText: string;
  demoLink: string;
  toolLabels: Record<string, string>;
};

export const I18N: Record<Lang, Dict> = {
  en: {
    brandTag: "autonomous · non-custodial",
    online: "● online",
    offline: "offline",
    connecting: "connecting…",
    net: "Casper Mainnet",
    copy: "⧉",
    copied: "✓ copied",
    warnTest: "test key — no funds",
    warnFund: "top up address with CSPR for gas",
    x402Title: "x402 · agent micropayments",
    modeSuffix: " mode",
    x402Empty: "No activity yet. Ask for a safety signal, run a trade, or simulate a buyer.",
    earned: "Earned",
    spent: "Spent",
    ledgerNet: "Net",
    simBuyer: "▶ Simulate external buyer",
    capsTitle: "Capabilities",
    caps: [
      "Trade analysis: price impact, slippage",
      "Swaps & liquidity on CSPR.trade",
      "Local non-custodial signing",
      "Token Safety Oracle — sold to agents via x402 + MCP",
    ],
    heroBadge: "⚡ AI × Casper",
    heroH1: ["Trade on-chain", "in plain language"],
    heroSub: "The agent analyzes the market, assesses risk, builds and signs the trade.",
    suggestions: [
      { icon: "📈", text: "What's the CSPR to sCSPR price now?" },
      { icon: "💼", text: "Show my balance and portfolio" },
      { icon: "🔍", text: "Analyze swapping 100 CSPR to sCSPR" },
      { icon: "🔄", text: "Swap 10 CSPR to sCSPR" },
    ],
    placeholder: "Ask the agent: “swap 50 CSPR to sCSPR”…",
    send: "Send",
    actions: "Agent actions",
    inputLabel: "input",
    resultLabel: "result",
    errorPrefix: "⚠ Error: ",
    netError: "⚠ Network unavailable: ",
    demoText: "Static preview — the live agent runs on the backend. Clone & run locally to chat for real.",
    demoLink: "View on GitHub",
    toolLabels: {
      get_quote: "Quote",
      analyze_trade: "Trade analysis",
      estimate_price_impact: "Price impact",
      estimate_slippage: "Slippage",
      get_tokens: "Tokens",
      get_pairs: "Pairs",
      get_portfolio_value: "Portfolio",
      get_native_cspr_balance: "CSPR balance",
      get_token_balance: "Token balance",
      build_swap: "Build swap",
      sign_and_submit: "Sign + submit",
      get_my_wallet: "Agent wallet",
      get_market_intel: "Premium intel (x402)",
      get_safety_signal: "Safety signal (x402)",
      check_token_safety: "Token safety check",
    },
  },
  ru: {
    brandTag: "autonomous · non-custodial",
    online: "● онлайн",
    offline: "офлайн",
    connecting: "подключение…",
    net: "Casper Mainnet",
    copy: "⧉",
    copied: "✓ скопировано",
    warnTest: "тестовый ключ — без средств",
    warnFund: "пополни адрес CSPR для оплаты газа",
    x402Title: "x402 · микроплатежи агента",
    modeSuffix: " mode",
    x402Empty: "Активности нет. Запроси сигнал безопасности, сделай сделку или симулируй покупателя.",
    earned: "Заработано",
    spent: "Потрачено",
    ledgerNet: "Итого",
    simBuyer: "▶ Симулировать покупателя",
    capsTitle: "Возможности",
    caps: [
      "Анализ сделок: price impact, slippage",
      "Свопы и ликвидность на CSPR.trade",
      "Локальная подпись транзакций",
      "Token Safety Oracle — продаём агентам через x402 + MCP",
    ],
    heroBadge: "⚡ AI × Casper",
    heroH1: ["Торгуй на блокчейне", "обычным языком"],
    heroSub: "Агент сам анализирует рынок, оценивает риск, готовит и подписывает сделку.",
    suggestions: [
      { icon: "📈", text: "Какая сейчас цена CSPR в sCSPR?" },
      { icon: "💼", text: "Покажи мой баланс и портфель" },
      { icon: "🔍", text: "Проанализируй обмен 100 CSPR на sCSPR" },
      { icon: "🔄", text: "Обменяй 10 CSPR на sCSPR" },
    ],
    placeholder: "Спроси агента: «обменяй 50 CSPR на sCSPR»…",
    send: "Отправить",
    actions: "Действия агента",
    inputLabel: "вход",
    resultLabel: "результат",
    errorPrefix: "⚠ Ошибка: ",
    netError: "⚠ Сеть недоступна: ",
    demoText: "Статичное превью — живой агент работает на бэкенде. Клонируй и запусти локально, чтобы общаться по-настоящему.",
    demoLink: "Открыть на GitHub",
    toolLabels: {
      get_quote: "Котировка",
      analyze_trade: "Анализ сделки",
      estimate_price_impact: "Price impact",
      estimate_slippage: "Slippage",
      get_tokens: "Токены",
      get_pairs: "Пары",
      get_portfolio_value: "Портфель",
      get_native_cspr_balance: "Баланс CSPR",
      get_token_balance: "Баланс токена",
      build_swap: "Сборка свопа",
      sign_and_submit: "Подпись + отправка",
      get_my_wallet: "Кошелёк агента",
      get_market_intel: "Премиум-аналитика (x402)",
      get_safety_signal: "Сигнал безопасности (x402)",
      check_token_safety: "Проверка токена",
    },
  },
};
