# Mainnet proof checklist

## Current status

**No StableSwap mainnet deployment, mainnet swap, HTLC deployment, or
cross-chain bridge is claimed by this repository.** StableSwap and the
BCH-side HTLC have mock-network coverage only. Pool and bridge transaction
actions are deliberately disabled in the UI. Do not treat the fields below as
evidence until filled with independently verifiable links and artifacts.

## Evidence to publish before any mainnet launch

| Proof | Status | Evidence |
|---|---|---|
| PUSD CashToken category and token metadata verified | Pending | — |
| Independent contract/security review published | Pending | — |
| Exact source commit and compiler / SDK versions recorded | Pending | — |
| Compiled artifact hash and deployment constructor arguments recorded | Pending | — |
| Deployment transaction and contract/token-container addresses | Pending | — |
| Explorer links and independently observed reserve balances | Pending | — |
| Small BCH → PUSD test swap and transaction proof | Pending | — |
| Small PUSD → BCH test swap and transaction proof | Pending | — |
| Admin liquidity controls and recovery procedure documented | Pending | — |
| BCH-side HTLC source independently reviewed | Pending | — |
| BCH-side HTLC mainnet deployment transaction and contract address published | Pending | — |
| BCH-side HTLC claim/refund behavior independently verified on a public test network | Pending | — |
| Other-chain counterpart deployed with compatible hash and safe timeout ordering | Pending | — |
| End-to-end cross-chain claim/refund proof and recovery procedure published | Pending | — |

## Publication template

When evidence exists, add a dated section containing all of the following:

- Network and proof date (UTC).
- Repository commit hash and source file hashes.
- SolidCash compiler, SDK, and Node versions.
- Exact PUSD category ID, decimals, and source of token metadata.
- Deployment transaction ID, contract address, and token-container address.
- Initial and observed BCH/PUSD reserves, with explorer links.
- BCH → PUSD and PUSD → BCH transaction IDs and independently verified
  outputs.
- Audit/review link, scope, reviewer, and unresolved findings.

Never replace a pending item with a screenshot alone. Link to transaction data
or a reproducible artifact so reviewers can verify each claim independently.
