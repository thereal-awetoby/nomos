# Mainnet proof checklist

## Current status

**No StableSwap mainnet deployment or mainnet swap is claimed by this
repository.** The StableSwap implementation is an experimental contract with
mock-network coverage only. Do not treat the fields below as evidence until
filled with independently verifiable links and artifacts.

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
