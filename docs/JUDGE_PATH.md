# Judge path

The fastest way through Nomos: the live app first, then the tests.

## 1. The live app (about 5 minutes, needs a BCH wallet)

1. Open [nomos.asgaya.org](https://nomos.asgaya.org/) and choose **Open app**.
2. Connect Paytaca with WizardConnect (or a WalletConnect wallet).
3. On **Rules**, create a vault with a small deposit and a low daily limit,
   for example 5,000 sats.
4. On **Pay**, pay 1,000 sats to any address. The receipt links to the
   transaction.
5. Try to pay more than the whole daily limit, for example 6,000 sats with a
   5,000-sat limit. The app shows **Refused** before your wallet signs.
6. Choose **Check with a node**. The proof checker has your wallet sign that
   payment and sends it to a node; the node's rejection
   (`Script failed an OP_VERIFY operation`) is saved with the receipt.
7. **Activity** lists every payment and refusal with its receipt.

## 2. Without a wallet

- **`/simulate`**: try the daily limit and allowlist with example numbers.
- **`/identity?verify=<npub or BCH address>`**: checks a BCH and Nostr link
  against relays and a BCH node in your browser. The page also creates links
  and checks signed login responses.
- **`/proof`**: send signed transaction hex to a node and see its answer.
- **`/architecture`**: the parts of the system and the contracts.

## 3. The proof on mainnet

[`docs/MAINNET_PROOFS.md`](MAINNET_PROOFS.md) lists every mainnet transaction:
the CashScript vault run from the app, the SolidCash vault run, the swap and
the identity link.

## 4. The tests (Node.js 22 or newer)

```bash
cd contracts/solidcash && npm ci && npm test   # vault, StableSwap and HTLC in the BCH VM (mock network)
cd xo && npm ci && npm test                    # 14 offline checks of the XO template against CashScript
cd frontend && npm ci && npm run build         # type check and production build
```

## 5. What to read

- `contracts/NomosVault.cash`: the vault covenant. The daily-limit check is
  `require(effectiveSpent + amount <= dailyLimitSats)`.
- `contracts/solidcash/NomosVault.scash`: the same vault in SolidCash.
- `contracts/SwapLock.cash` and `contracts/evm/SwapLock.sol`: the two sides of
  the PUSD and USDC swap.
- `frontend/src/lib/identity.ts` and `docs/IDENTITY_PROTOCOL.md`: the identity
  link and how anyone can verify it.
- `xo/nomos.template.json` and `xo/REPRODUCE.md`: the XO template and the live
  chipnet attempt.
