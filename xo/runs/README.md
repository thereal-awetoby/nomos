# Chipnet runs

What the XO chipnet runs of 21 November 2026 saved, from GitHub Actions
(`.github/workflows/xo-chipnet.yml`, workflow runs #26 and #27): each run's
`run.json`, its log (`log.txt`) and the XO invitations it wrote, in XO's own
format (`serializeInvitation` from `@xo-cash/utils`). They hold public keys
and signatures, never private keys.

- `run-26`: paid 3,000 and 4,000 sats (the day's 10,000-sat limit reached),
  the node refused 5,000 more; both parties signed the rescue, but the
  rescuer's process crashed after signing and the run did not broadcast it.
- `run-27`: skipped the payments (the day's limit was used), the node refused
  the over-limit payment again (its full answer is in `run.json`), and the
  rescue went through.

Check them offline, with no keys and no network:

```bash
cd xo
npm ci
npm run replay
```

See [`../REPRODUCE.md`](../REPRODUCE.md#results) for the transaction IDs.
