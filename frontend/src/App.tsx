import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { I18N, TOOL_ICONS, type Lang } from "./i18n";

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
  direction: "spend" | "earn";
  description?: string;
};
type X402Info = {
  wallet: { address: string; ephemeral: boolean; mode: string; network: string };
  ledger: { earned: number; spent: number; net: number };
  payments: Payment[];
};

const short = (k: string) => (k.length > 16 ? `${k.slice(0, 9)}…${k.slice(-5)}` : k);

export default function App() {
  const [lang, setLang] = useState<Lang>(
    () => (localStorage.getItem("lang") as Lang) || "en"
  );
  const t = I18N[lang];

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
  async function simulateBuyer() {
    try {
      await fetch("/api/x402/demo-sale", { method: "POST" });
    } catch {}
    refreshWallet();
  }
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((h) => { setOnline(!!h.ok); setModel(h.model ?? ""); })
      .catch(() => setOnline(false));
    refreshWallet();
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => { localStorage.setItem("lang", lang); }, [lang]);

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
        body: JSON.stringify({
          messages: next.map(({ role, content }) => ({ role, content })),
          lang,
        }),
      });
      const data = await res.json();
      setMessages([
        ...next,
        data.error
          ? { role: "assistant", content: t.errorPrefix + data.error }
          : { role: "assistant", content: data.reply, tools: data.toolEvents ?? [] },
      ]);
      refreshWallet();
    } catch (e) {
      setMessages([...next, { role: "assistant", content: t.netError + String(e) }]);
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

      <div className="lang-toggle">
        {(["en", "ru"] as Lang[]).map((l) => (
          <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">⚡</div>
          <div>
            <div className="brand-name">Casper DeFi Agent</div>
            <div className="brand-tag">{t.brandTag}</div>
          </div>
        </div>

        <div className="wallet-card">
          <div className="wallet-top">
            <span className="net"><span className="dot" />{t.net}</span>
            <span className={`agent-state ${online ? "up" : "down"}`}>
              {online == null ? "…" : online ? t.online : t.offline}
            </span>
          </div>
          <div className="wallet-balance">
            {wallet?.cspr != null ? wallet.cspr.toLocaleString() : "—"}
            <span className="cspr">CSPR</span>
          </div>
          <button className="wallet-addr" onClick={copyAddr}>
            <span className="mono">{wallet ? short(wallet.publicKey) : "…"}</span>
            <span className="copy">{copied ? t.copied : t.copy}</span>
          </button>
          {wallet?.ephemeral && <div className="wallet-warn">{t.warnTest}</div>}
          {!wallet?.ephemeral && wallet?.cspr === 0 && (
            <div className="wallet-warn">{t.warnFund}</div>
          )}
        </div>

        <div className="cap-title">{t.x402Title}</div>
        <div className="x402-card">
          <div className="x402-top">
            <span className="x402-mode">{(x402?.wallet.mode ?? "—") + t.modeSuffix}</span>
            <span className="x402-net">{x402?.wallet.network ?? ""}</span>
          </div>

          <div className="x402-ledger">
            <div className="led earn">
              <span>{t.earned}</span><b>+{(x402?.ledger.earned ?? 0).toFixed(4)}</b>
            </div>
            <div className="led spend">
              <span>{t.spent}</span><b>−{(x402?.ledger.spent ?? 0).toFixed(4)}</b>
            </div>
            <div className="led net">
              <span>{t.ledgerNet}</span>
              <b className={(x402?.ledger.net ?? 0) >= 0 ? "pos" : "neg"}>
                {(x402?.ledger.net ?? 0).toFixed(4)}
              </b>
            </div>
          </div>

          {(!x402 || x402.payments.length === 0) && (
            <div className="x402-empty">{t.x402Empty}</div>
          )}
          {x402?.payments.slice(0, 4).map((p) => (
            <div key={p.id} className={`x402-row ${p.direction} ${p.status}`}>
              <span className="x402-dir">{p.direction === "earn" ? "▲" : "▼"}</span>
              <span className="x402-res">{p.resource}</span>
              <span className="x402-amt">
                {p.direction === "earn" ? "+" : "−"}{p.priceLabel.replace(/ .*/, "")}
              </span>
            </div>
          ))}

          <button className="x402-sim" onClick={simulateBuyer}>{t.simBuyer}</button>
        </div>

        <div className="cap-title">{t.capsTitle}</div>
        <ul className="caps">
          {["🔬", "💱", "✍️", "💸"].map((ic, i) => (
            <li key={i}><span>{ic}</span> {t.caps[i]}</li>
          ))}
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
              <div className="hero-badge">{t.heroBadge}</div>
              <h1>{t.heroH1[0]}<br />{t.heroH1[1]}</h1>
              <p>{t.heroSub}</p>
              <div className="suggestions">
                {t.suggestions.map((s) => (
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
                {m.tools && m.tools.length > 0 && <Pipeline tools={m.tools} t={t} />}
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
            placeholder={t.placeholder}
            disabled={loading}
          />
          <button onClick={() => send()} disabled={loading || !input.trim()}>
            <span>{t.send}</span> →
          </button>
        </div>
      </main>
    </div>
  );
}

function Pipeline({ tools, t }: { tools: ToolEvent[]; t: (typeof I18N)["en"] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const label = (n: string) => t.toolLabels[n] ?? n;
  const icon = (n: string) => TOOL_ICONS[n] ?? "⚙️";
  return (
    <div className="pipeline">
      <div className="pipe-row">
        {tools.map((tool, i) => (
          <button
            key={i}
            className={`pipe-chip ${openIdx === i ? "active" : ""}`}
            onClick={() => setOpenIdx(openIdx === i ? null : i)}
          >
            <span>{icon(tool.name)}</span>
            {label(tool.name)}
            {i < tools.length - 1 && <span className="arrow">→</span>}
          </button>
        ))}
      </div>
      {openIdx != null && (
        <div className="pipe-detail">
          <div className="kv">{t.inputLabel}</div>
          <pre>{JSON.stringify(tools[openIdx].input, null, 2)}</pre>
          <div className="kv">{t.resultLabel}</div>
          <pre className="out">{JSON.stringify(tools[openIdx].output, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
