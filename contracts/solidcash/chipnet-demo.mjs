#!/usr/bin/env node
// Nomos (SolidCash edition) on chipnet: deploy a vault, pay under the daily
// limit, then try to pay over it.
//
//   npm run build
//   PRIVATE_KEY=<funded chipnet WIF> node chipnet-demo.mjs
//   (Windows: set PRIVATE_KEY=<WIF>  then  node chipnet-demo.mjs)
//
// The wallet needs about 30,000 chipnet sats. It is owner, agent and rescue
// co-signer here, and receives the payments, so almost nothing is spent.

import { readFileSync } from 'node:fs';
import { Signer, SignatureTemplate } from '@solidcash/solidcash';
import { ContractFactory } from '@solidcash/solidcash/contract-factory';
import { ElectrumNetworkProvider } from '@solidcash/solidcash/network/electrum';
import { decodePrivateKeyWif, hash160 } from '@bitauth/libauth';

const wif = process.env.PRIVATE_KEY;
if (!wif) { console.error('Set PRIVATE_KEY to a funded chipnet WIF'); process.exit(1); }
const decoded = decodePrivateKeyWif(wif);
if (typeof decoded === 'string') { console.error(`Bad WIF: ${decoded}`); process.exit(1); }

const artifact = JSON.parse(readFileSync(new URL('./build/NomosVault.json', import.meta.url)));
const provider = new ElectrumNetworkProvider('chipnet');
const signer = new Signer(decoded.privateKey, provider);
const sig = new SignatureTemplate(decoded.privateKey);
const me = signer.publicKey;
const myPkh = hash160(me);
const Z = new Uint8Array(20);
const LIMIT = 10_000n;
const lock = new Uint8Array([0x76, 0xa9, 0x14, ...myPkh, 0x88, 0xac]);
const locktime = Math.floor(Date.now() / 1000) - 3 * 3600; // nodes need locktime < median time past
const tx = (id) => `https://chipnet.chaingraph.cash/tx/${id}`;

console.log('Wallet:', signer.address);
console.log('Deploying NomosVault (daily limit 10,000 sats, 20,000 deposited)…');
const vault = await new ContractFactory(artifact, signer).deploy(
  me, me, LIMIT, false, Z, Z, Z, Z, Z, me,
  { initialBalance: 20_000n },
);
await vault.waitForDeployment();
console.log('  category:', vault.categoryId);
console.log('  deploy:  ', tx(vault.deploymentTransaction().txid));

console.log('\nPay 3,000 sats (under the limit)…');
const paid = await vault.call.pay(myPkh, 3_000n, me, sig).setLocktime(locktime).transfer(lock, 3_000n).send();
console.log('  PAID:', tx(paid.txid));
console.log('  spentToday on-chain:', await vault.state.spentToday());

console.log('\nPay 8,000 more the same day (11,000 > 10,000)…');
try {
  const r = await vault.call.pay(myPkh, 8_000n, me, sig).setLocktime(locktime).transfer(lock, 8_000n).send();
  console.log('  NOT REFUSED (unexpected):', tx(r.txid));
  process.exit(1);
} catch (e) {
  const m = String(e.message ?? e);
  console.log('  REFUSED by Nomos:', m.match(/failing require[^\n]*/)?.[0] ?? m.split('\n')[0]);
}
process.exit(0);
