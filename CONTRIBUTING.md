# Contributing to Nomos

Nomos is a Bitcoin Cash spend-mandate covenant and browser application.
Contributions are welcome. Please keep security and deployment claims aligned
with the repository: StableSwap and the BCH-side HTLC are prototypes, and the
Bridge page is a disabled preview.

## Getting started

Use Node.js 22 or newer (the SolidCash package requires Node 22+) and npm.
Clone the repository, then run project commands from the relevant directory.

```bash
git clone https://github.com/thereal-awetoby/nomos.git
cd nomos
```

### Frontend

```bash
cd frontend
npm ci
npm run dev
```

For chipnet development, configure `VITE_BCH_NETWORK=chipnet` as described in
the root README. Do not use a mainnet wallet for testing.

### CashScript covenant

```bash
cd contracts
npm ci
npm run compile
```

`npm run compile` compiles `NomosVault.cash` to the frontend artifact path.
The integration test broadcasts to chipnet and requires a funded chipnet test
wallet; see the root README before running it.

### SolidCash prototypes

```bash
cd contracts/solidcash
npm ci
npm test
```

The test command compiles the vault, StableSwap, and HTLC, then runs mock-network
checks in the BCH VM. The optional `npm run demo:chipnet` deploys and exercises
the SolidCash vault on chipnet; use only a disposable test wallet.

### XO template checks

```bash
cd xo
npm ci
npm test
```

These checks are offline; they do not run the template in XO's live engine.

## Project structure

- `contracts/` — CashScript NomosVault covenant and chipnet integration tests
- `contracts/solidcash/` — SolidCash vault, StableSwap, and HTLC prototypes
- `frontend/` — React, Vite, TypeScript, and Tailwind frontend
- `docs/` — architecture, security, bridge design, and project walkthroughs
- `xo/` — XO template and offline validation

## Development guidelines

- Keep the frontend's strict TypeScript checks clean. Avoid introducing `any`;
  if one is necessary, document why and narrow its scope.
- Use the existing CSS theme variables and Tailwind utilities for surfaces
  and text. Keep any intentional status or decorative palette constants
  consistent with the existing accent colors; do not replace the theme system.
- Keep CashScript and SolidCash versions in their package manifests and lock
  files. CashScript is in the 0.11.x series; the SolidCash compiler is 0.51.1.
- Use the mock network for SolidCash unit tests. Chipnet tests use real testnet
  transactions and must never use mainnet funds or keys.
- Use clear commit prefixes such as `feat:`, `fix:`, `docs:`, or `test:`.
- Never commit private keys, mnemonics, recovery phrases, or API tokens.
- Update documentation when behavior, security boundaries, or deployment
  status changes. Passing mock tests is not an audit or deployment proof.

## Testing

From each package directory, run:

```bash
# Frontend type check and production build
cd frontend
npx tsc --noEmit
npm run build

# Mock-network SolidCash tests
cd ../contracts/solidcash
npm test

# Offline XO template checks
cd ../../xo
npm test
```

The CashScript integration test is separate because it requires a funded
chipnet wallet and broadcasts transactions:

```bash
cd contracts
PRIVATE_KEY=YOUR_CHIPNET_WIF npm test
```

Replace `YOUR_CHIPNET_WIF` with a funded chipnet WIF before running.

Use a disposable testnet wallet only. Never paste a private key into an issue,
pull request, or chat, and never use a mainnet key for these tests.

## Project coverage

The walkthrough in [`docs/JUDGE_PATH.md`](docs/JUDGE_PATH.md) describes the
implemented project demonstrations. It is not a claim of bounty eligibility,
award, audit, or production deployment.

## Code of conduct

Be respectful and constructive. Help keep the project safe and welcoming.

## License

This project is licensed under the MIT License; see [`LICENSE`](LICENSE).
