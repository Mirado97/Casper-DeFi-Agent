import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ToolEvent = { name: string; input: unknown; output: unknown };
type Msg = { role: "user" | "assistant"; content: string; tools?: ToolEvent[] };
type Wallet = { publicKey: string; ephemeral: boolean; cspr: number | null };
type Payment = {
  id: string;
  resource: string;
  priceLabel: string;
  status: "settled" | "failed";
  transaction: string;
  ts: number;
};
type X402Info = {
  wallet: { address: string; ephemeral: boolean; mode: string; network: string };
  payments: Payment[];
};

const SUGGESTIONS = [
  { icon: "📈", text: "Какая сейчас цена CSPR в sCSPR?" },
  { icon: "💼", text: "Покажи мой баланс и портфель" },
  { icon: "🔍", text: "Проанализируй обмен 100 CSPR на sCSPR" },
  { icon: "🔄", text: "Обменяй 10 CSPR на sCSPR" },
];

const TOOL_META: Record<string, { label: string; icon: string }> = {
  get_quote: { label: "Котировка", icon: "💱" },
  analyze_trade: { label: "Анализ сделки", icon: "🔬" },
  estimate_price_impact: { label: "Price impact", icon: "📉" },
  estimate_slippage: { label: "Slippage", icon: "📊" },
  get_tokens: { label: "Токены", icon: "🪙" },
  get_pairs: { label: "Пары", icon: "🔗" },
  get_portfolio_value: { label: "Портфель", icon: "💼" },
  get_native_cspr_balance: { label: "Баланс CSPR", icon: "💰" },
  get_token_balance: { label: "Баланс токена", icon: "💰" },
  build_swap: { label: "Сборка свопа", icon: "🛠️" },
  sign_and_submit: { label: "Подпись + отправка", icon: "✍️" },
  get_my_wallet: { label: "Кошелёк агента", icon: "🔑" },
  get_market_intel: { label: "Премиум-аналитика (x402)", icon: "💸" },
};
const meta = (n: string) => TOOL_META[n] ?? { label: n, icon: "⚙️" };
const short = (k: string) => (k.length > 16 ? `${k.slice(0, 9)}…${k.slice(-5)}` : k);

export default function App() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [model, setModel] = useState<string>("");
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [x402, setX402] = useState<X402Info | null>(null);
  const [copied, setCopied] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  function refreshWallet() {
    fetch("/api/wallet").then((r) => r.json()).then(setWallet).catch(() => {});
    fetch("/api/x402").then((r) => r.json()).then(setX402).catch(() => {});
  }
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((h) => { setOnline(!!h.ok); setModel(h.model ?? ""); })
      .catch(() => setOnline(false));
    refreshWallet();
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const data = await res.json();
      setMessages([
        ...next,
        data.error
          ? { role: "assistant", content: "⚠ Ошибка: " + data.error }
          : { role: "assistant", content: data.reply, tools: data.toolEvents ?? [] },
      ]);
      refreshWallet();
    } catch (e) {
      setMessages([...next, { role: "assistant", content: "⚠ Сеть недоступна: " + String(e) }]);
    } finally {
      setLoading(false);
    }
  }

  function copyAddr() {
    if (!wallet) return;
    navigator.clipboard?.writeText(wallet.publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="app">
      <div className="glow glow-1" />
      <div className="glow glow-2" />

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">⚡</div>
          <div>
            <div className="brand-name">Casper DeFi Agent</div>
            <div className="brand-tag">autonomous · non-custodial</div>
          </div>
        </div>

        <div className="wallet-card">
          <div className="wallet-top">
            <span className="net"><span className="dot" />Casper Mainnet</span>
            <span className={`agent-state ${online ? "up" : "down"}`}>
              {online == null ? "…" : online ? "agent online" : "offline"}
            </span>
          </div>
          <div className="wallet-balance">
            {wallet?.cspr != null ? wallet.cspr.toLocaleString("ru-RU") : "—"}
            <span className="cspr">CSPR</span>
          </div>
          <button className="wallet-addr" onClick={copyAddr} title="Скопировать адрес">
            <span className="mono">{wallet ? short(wallet.publicKey) : "загрузка…"}</span>
            <span className="copy">{copied ? "✓ скопировано" : "⧉"}</span>
          </button>
          {wallet?.ephemeral && (
            <div className="wallet-warn">тестовый ключ — без средств</div>
          )}
          {!wallet?.ephemeral && wallet?.cspr === 0 && (
            <div className="wallet-warn">пополни адрес CSPR для оплаты газа</div>
          )}
        </div>

        <div className="cap-title">x402 · микроплатежи агента</div>
        <div className="x402-card">
          <div className="x402-top">
            <span className="x402-mode">{x402?.wallet.mode ?? "—"} mode</span>
            <span className="x402-net">{x402?.wallet.network ?? ""}</span>
          </div>
          {(!x402 || x402.payments.length === 0) && (
            <div className="x402-empty">Платежей пока нет. Попроси у агента «премиум-аналитику».</div>
          )}
          {x402?.payments.slice(0, 4).map((p) => (
            <div key={p.id} className={`x402-row ${p.status}`}>
              <span className="x402-dot" />
              <span className="x402-res">{p.resource}</span>
              <span className="x402-amt">{p.priceLabel}</span>
            </div>
          ))}
        </div>

        <div className="cap-title">Возможности</div>
        <ul className="caps">
          <li><span>🔬</span> Анализ сделок: price impact, slippage</li>
          <li><span>💱</span> Свопы и ликвидность на CSPR.trade</li>
          <li><span>✍️</span> Локальная подпись транзакций</li>
          <li><span>💸</span> x402-микроплатежи за премиум-данные</li>
        </ul>

        <div className="side-foot">
          {model && <span className="mono">{model}</span>}
          <span>Casper Agentic Buildathon</span>
        </div>
      </aside>

      <main className="chat">
        <div className="messages">
          {messages.length === 0 && (
            <div className="hero">
              <div className="hero-badge">⚡ AI × Casper</div>
              <h1>Торгуй на блокчейне<br />обычным языком</h1>
              <p>Агент сам анализирует рынок, оценивает риск, готовит и подписывает сделку.</p>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s.text} onClick={() => send(s.text)}>
                    <span className="s-icon">{s.icon}</span>{s.text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`row ${m.role}`}>
              {m.role === "assistant" && <div className="avatar">⚡</div>}
              <div className="col">
                {m.tools && m.tools.length > 0 && <Pipeline tools={m.tools} />}
                <div className={`bubble ${m.role}`}>
                  {m.role === "assistant" ? (
                    <div className="md"><Markdown remarkPlugins={[remarkGfm]}>{m.content}</Markdown></div>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="row assistant">
              <div className="avatar pulse">⚡</div>
              <div className="bubble assistant typing"><span /><span /><span /></div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="composer">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Спроси агента: «обменяй 50 CSPR на sCSPR»…"
            disabled={loading}
          />
          <button onClick={() => send()} disabled={loading || !input.trim()}>
            <span>Отправить</span> →
          </button>
        </div>
      </main>
    </div>
  );
}

function Pipeline({ tools }: { tools: ToolEvent[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <div className="pipeline">
      <div className="pipe-row">
        {tools.map((t, i) => (
          <button
            key={i}
            className={`pipe-chip ${openIdx === i ? "active" : ""}`}
            onClick={() => setOpenIdx(openIdx === i ? null : i)}
          >
            <span>{meta(t.name).icon}</span>
            {meta(t.name).label}
            {i < tools.length - 1 && <span className="arrow">→</span>}
          </button>
        ))}
      </div>
      {openIdx != null && (
        <div className="pipe-detail">
          <div className="kv">вход</div>
          <pre>{JSON.stringify(tools[openIdx].input, null, 2)}</pre>
          <div className="kv">результат</div>
          <pre className="out">{JSON.stringify(tools[openIdx].output, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
