<!-- Текст для BUIDL-страницы DoraHacks. Копируй всё, что ниже линии.
     Картинки идут по raw-ссылкам с GitHub — на DoraHacks отрендерятся сами.
     Если редактор не примет markdown-картинки, просто загрузи те же два файла
     из docs/ (ui-hero.png, ui-analysis.png) через кнопку вставки картинки. -->

---

# Casper DeFi Agent

I built a non-custodial AI agent that trades on the live CSPR.trade DEX on Casper. You just talk to it in plain language, something like "swap 50 CSPR to sCSPR" or "is this token safe", and it works out the market for you, shows the price impact and slippage, waits for your ok, then signs the transaction locally with its own key and sends it to the network. It can also pay other agents for premium data over x402, and it sells its own token-safety checks the same way.

Nothing custodial here. The private key stays on your machine, and the model never sees it, only a short summary and a transaction id.

![Casper DeFi Agent UI](https://raw.githubusercontent.com/Mirado97/Casper-DeFi-Agent/main/docs/ui-hero.png)

## What's under the hood

Three things come together in one product:

- It talks to CSPR.trade over MCP (their 23 live DEX tools), and it also ships its own MCP server, a paid Token Safety Oracle that other agents can call.
- It signs Casper 2.0 TransactionV1 locally and submits it, fully non-custodial.
- It uses x402 both ways: it earns (safety checks, analytics) and it spends (a small per-trade fee), with a running spent and earned ledger.

![Trade analysis in action](https://raw.githubusercontent.com/Mirado97/Casper-DeFi-Agent/main/docs/ui-analysis.png)

## A note on the network

It runs on Casper mainnet, because CSPR.trade is a mainnet-only DEX. So the sample transaction below is a real mainnet transaction the agent actually executed, not a testnet mockup.

## How to try it

You need Node 18+ and an Anthropic API key.

Analysis only, no funds required:

```
git clone https://github.com/Mirado97/Casper-DeFi-Agent
cd Casper-DeFi-Agent
npm install
cp backend/.env.example backend/.env      (add your ANTHROPIC_API_KEY)
npm run dev
```

Open http://localhost:5173 and ask it things like "what's the price of sCSPR", "show my portfolio", "is sCSPR safe to trade", or "analyze swapping 100 CSPR to sCSPR". None of that needs any funds.

To actually run a swap on mainnet:

1. Generate an ed25519 wallet with `npm run keygen -w backend` (it prints a 01... address and writes secret_key.pem).
2. In backend/.env, point CASPER_SECRET_KEY_PEM at that file, set CASPER_KEY_ALGO=ed25519, and CASPER_NODE_RPC_URL=https://node.mainnet.casper.network/rpc
3. Send at least 45 CSPR to the 01... address (10 for the swap, about 30 for gas).
4. Restart, then say "swap 10 CSPR to sCSPR" in the chat and confirm. It gives you back the transaction hash so you can check it on cspr.live.

ed25519 and the node RPC are needed for swaps, and the repo README explains why.

## Sample transaction (Casper mainnet)

A real swap the agent ran, 10 CSPR to sCSPR, built and signed locally and submitted straight to a node. It went through:

```
Hash:   e81fb1dbd8a95bf0460b405ec05c58cbb4b5d4fd759c0d5af160857d348e9004
Link:   https://cspr.live/transaction/e81fb1dbd8a95bf0460b405ec05c58cbb4b5d4fd759c0d5af160857d348e9004
Result: Success, block 8196137, entry point swap_exact_cspr_for_tokens
Wallet: 01cf19fdd2613c0ca21f3d87e878c25841486a82b0269231be6ea102a86264642f
```

Here it is on cspr.live:

![Mainnet swap transaction on cspr.live](https://raw.githubusercontent.com/Mirado97/Casper-DeFi-Agent/main/docs/tx-mainnet.png)

## Contract package hashes

```
CSPR.trade swap router:       1dbac65585475fec53e5b1f9110923c8d232921702097e83105b36751d682186
x402 payment token (CEP-18):  0128f81ca57b94a40650c23d314f5d7b363e7dd4acccb714d1d2365d27a41843
```

## Links

- Demo video: https://youtu.be/eYiGvR0-xXI
- GitHub: https://github.com/Mirado97/Casper-DeFi-Agent
- Live preview: https://mirado97.github.io/Casper-DeFi-Agent
- Telegram (Casper devs): https://t.me/CSPRDevelopers
- Discord (Casper): https://discord.com/invite/caspernetwork
