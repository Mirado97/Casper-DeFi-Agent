# MCP x402 Testing

**Date:** June 25, 2026  
**Status:** ✅ WORKING

---

## What was tested

An external client connects to the `safety-mcp.ts` MCP server and calls the `check_token_safety` tool through x402 payments (without the app's built-in context).

## Results

### Test 1: sCSPR token check

```
[1] First call WITHOUT payment:
    status: 402 (Payment Required)
    price: 0.002 USDC

[2] Second call WITH a signed payment:
    receipt: 0.002 USDC settled
    transaction: local-1c4e2ae7c6ca4071
    
    report:
      token: sCSPR
      level: SAFE
      score: 100
      factors: No major risk signals detected from DEX-side checks
```

### Test 2: CSPR token check

```
[1] First call WITHOUT payment:
    status: 402 (Payment Required)
    price: 0.002 USDC

[2] Second call WITH a signed payment:
    receipt: 0.002 USDC settled
    transaction: local-853066a31ca772be
    
    report:
      token: CSPR
      level: DANGER
      score: 30
      factors: Cannot sell the token back — likely honeypot or transfers blocked
```

---

## Running the tests

```bash
# Run the MCP demo (spawns the server + client automatically)
npm run mcp:demo -w backend -- [TOKEN_SYMBOL]

# Examples:
npm run mcp:demo -w backend -- sCSPR
npm run mcp:demo -w backend -- CSPR
npm run mcp:demo -w backend -- WCSPR
```

---

## What was verified

✅ **The MCP server starts** — `Casper Token Safety MCP server ready`

✅ **x402 requirements work** — the first call returns 402 + requirements

✅ **x402 payments work** — the client signs a TransferAuthorization and sends it

✅ **Payments are processed** — the server verifies the signature and performs the operation

✅ **Reports are generated** — every payment returns a detailed token analysis

✅ **Distinct tx IDs** — each transaction gets a unique ID

✅ **Distinct results** — the system returns different risk levels for different tokens

---

## Conclusion

**The MCP x402 system works end to end through an external client.**

The system is ready for:
- Selling the Token Safety Oracle to other AI agents
- Use in Claude Desktop via the MCP config
- Use in other applications via MCP + x402
