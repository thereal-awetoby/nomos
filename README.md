# Nomos

Pay or withdraw BCH only under rules the chain itself enforces.
Violate → refuse on-chain. Obey → pay + receipt.

Built at BCH BLAZE 2026.

## Do this in 90 seconds

1. Open the live demo (URL TBD)
2. Connect with WizardConnect or XO
3. Set a very low daily limit (e.g. 0.0001 BCH)
4. Attempt pay **above** limit → **Refused by Nomos**
5. Attempt pay **under** limit → Paid + receipt
6. Click explorer links for both

## Mandate rules

- **Daily limit** — max BCH per UTC day, enforced on-chain
- **Allowlist** — restrict destinations (up to 5 addresses)
- **Agent key** — delegate spend-only access under the same rules
- **Rescue** — emergency withdrawal (owner + co-signer)

## Tech stack

| Layer | Choice |
|-------|--------|
| Contracts | CashScript (primary) + SolidCash port |
| Frontend | Vite + React + TypeScript |
| Styling | Tailwind (dark theme) |
| Wallet | WizardConnect + XO |
| Network | BCH mainnet |

## Project structure

```
nomos/
├── contracts/
│   └── NomosVault.cash      # CashScript covenant
├── frontend/
│   └── src/
│       ├── pages/            # Connect, VaultHome, SetMandate, Pay, Activity
│       ├── components/       # Banner, Layout, Receipt
│       └── lib/              # types, wallet, contract helpers
├── NOMOS_BUILD_PLAN.md
└── README.md
```

## Links

- Live demo: TBD
- Widget Factory: TBD
- EMBER2026 address: `bitcoincash:TODO`

## License

MIT
