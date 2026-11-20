#!/usr/bin/env node
// Nomos (SolidCash edition) on a live network: deploy a vault, pay under the
// daily limit, try to pay over it, then sweep the rest back with rescue.
//
//   npm run build
//   PRIVATE_KEY=<funded WIF> node demo.mjs chipnet
//   PRIVATE_KEY=<funded WIF> node demo.mjs mainnet
//   (Windows: set PRIVATE_KEY=<WIF>  then  node demo.mjs mainnet)
//
// The wallet is owner, agent and rescue co-signer here, and receives the
// payments and the final sweep, so a run costs only network fees.
// SolidCash also reserves two state NFTs (1,200 sats each) and a 5,000-sat
// fee estimate at deploy; unused fee comes back as change. Mainnet needs
// about 15,000 sats; chipnet about 30,000.

import { readFileSync } from 'node:fs';
import { Signer, SignatureTemplate } from '@solidcash/solidcash';
import { ContractFactory } from '@solidcash/solidcash/contract-factory';
import { ElectrumNetworkProvider } from '@solidcash/solidcash/network/electrum';
import { decodePrivateKeyWif, hash160 } from '@bitauth/libauth';

const NETWORK = process.argv[2] ?? 'chipnet';
const SETTINGS = {
  chipnet: { limit: 10_000n, deposit: 20_000n, pay: 3_000n, over: 8_000n, tx: (id) => `https://chipnet.chaingraph.cash/tx/${id}` },
  mainnet: { limit: 2_000n, deposit: 5_000n, pay: 1_000n, over: 1_500n, tx: (id) => `https://blockchair.com/bitcoin-cash/transaction/${id}` },
}[NETWORK];
if (!SETTINGS) { console.error('Network must be chipnet or mainnet'); process.exit(1); }
const { limit, deposit, pay, over, tx } = SETTINGS;

const wif = process.env.PRIVATE_KEY;
if (!wif) { console.error(`Set PRIVATE_KEY to a funded ${NETWORK} WIF`); process.exit(1); }
const decoded = decodePrivateKeyWif(wif);
if (typeof decoded === 'string') { console.error(`Bad WIF: ${decoded}`); process.exit(1); }

const artifact = JSON.parse(readFileSync(new URL('./build/NomosVault.json', import.meta.url)));
const provider = new ElectrumNetworkProvider(NETWORK);
const signer = new Signer(decoded.privateKey, provider);
const sig = new SignatureTemplate(decoded.privateKey);
const me = signer.publicKey;
const myPkh = hash160(me);
const Z = new Uint8Array(20);
const lock = new Uint8Array([0x76, 0xa9, 0x14, ...myPkh, 0x88, 0xac]);
const locktime = Math.floor(Date.now() / 1000) - 3 * 3600; // nodes need locktime < median time past
const sats = (n) => n.toLocaleString('en-US');

console.log(`Network: ${NETWORK}`);
console.log('Wallet:', signer.address);
console.log(`Deploying NomosVault (daily limit ${sats(limit)} sats, ${sats(deposit)} deposited)…`);
const vault = await new ContractFactory(artifact, signer).deploy(
  me, me, limit, false, Z, Z, Z, Z, Z, me,
  { initialBalance: deposit },
);
await vault.waitForDeployment();
console.log('  category:', vault.categoryId);
console.log('  deploy:  ', tx(vault.deploymentTransaction().txid));

console.log(`\nPay ${sats(pay)} sats (under the limit)…`);
const paid = await vault.call.pay(myPkh, pay, me, sig).setLocktime(locktime).transfer(lock, pay).send();
console.log('  PAID:', tx(paid.txid));
console.log('  spentToday on-chain:', await vault.state.spentToday());

console.log(`\nPay ${sats(over)} more the same day (${sats(pay + over)} > ${sats(limit)})…`);
try {
  const r = await vault.call.pay(myPkh, over, me, sig).setLocktime(locktime).transfer(lock, over).send();
  console.log('  NOT REFUSED (unexpected):', tx(r.txid));
  process.exit(1);
} catch (e) {
  const m = String(e.message ?? e);
  console.log('  REFUSED by the contract before broadcast:', m.match(/failing require[^\n]*/)?.[0] ?? m.split('\n')[0]);
}

const rest = deposit - pay;
console.log(`\nRescue the remaining ${sats(rest)} sats back to the wallet (owner + co-signer)…`);
try {
  const swept = await vault.call.rescue(myPkh, rest, sig, sig).transfer(lock, rest).send();
  console.log('  RESCUED:', tx(swept.txid));
} catch (e) {
  console.log('  Rescue failed; the funds stay in the vault and can be rescued again:', String(e.message ?? e).split('\n')[0]);
  process.exit(1);
}
process.exit(0);
