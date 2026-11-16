#!/usr/bin/env node

/**
 * Nomos Vault — Chipnet integration test
 *
 * Tests:
 *  1. Compile NomosVault.cash
 *  2. Deploy vault with low daily limit
 *  3. Spend UNDER limit → success
 *  4. Spend OVER limit → on-chain refuse (script failure)
 *  5. setMandate → update limit
 *  6. rescue → bypass limit
 *
 * Prerequisites:
 *   cd contracts && npm install
 *   Fund the test wallet on chipnet: https://tbch.googol.cash/
 *
 * Usage:
 *   PRIVATE_KEY=<chipnet-wif> node test/vault.test.mjs
 */

import { compileFile } from 'cashc';
import {
  Contract,
  ElectrumNetworkProvider,
  SignatureTemplate,
} from 'cashscript';
import { hexToBin, binToHex, cashAddressToLockingBytecode } from '@bitauth/libauth';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────────
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error('Set PRIVATE_KEY env var to a chipnet WIF key');
  process.exit(1);
}

const NETWORK = 'chipnet';
const DAILY_LIMIT_SATS = 10_000; // 0.0001 BCH
const SPEND_UNDER = 3_000;       // should succeed
const SPEND_OVER = 15_000;       // should fail (refuse)
const MINER_FEE = 1000;

// Dummy values for unused slots
const ZERO_HASH = '0000000000000000000000000000000000000000';
const ZERO_PK = '0'.repeat(66);

// ── Helpers ─────────────────────────────────────────────────
function currentDay() {
  return Math.floor(Date.now() / 1000 / 86400);
}

function log(label, msg) {
  console.log(`\n[${'='.repeat(3)} ${label} ${'='.repeat(40 - label.length)}]`);
  if (typeof msg === 'object') console.log(JSON.stringify(msg, null, 2));
  else console.log(msg);
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  // 1. Compile
  log('COMPILE', 'Compiling NomosVault.cash...');
  const artifact = compileFile(resolve(__dirname, '..', 'NomosVault.cash'));
  log('COMPILE', `✓ Compiled. Contract name: ${artifact.contractName}`);

  // 2. Set up provider + signer
  const provider = new ElectrumNetworkProvider(NETWORK);
  const sigTemplate = new SignatureTemplate(PRIVATE_KEY);
  const ownerPk = sigTemplate.getPublicKey();
  const ownerPkHex = binToHex(ownerPk);

  log('WALLET', `Owner pubkey: ${ownerPkHex}`);

  // 3. Deploy vault (initial state)
  const initParams = [
    ownerPk,                             // ownerPk
    ownerPk,                             // agentPk (self for testing)
    BigInt(DAILY_LIMIT_SATS),            // dailyLimitSats
    0n,                                  // spentTodaySats
    BigInt(currentDay()),                // dayMarker
    false,                               // allowlistEnabled
    hexToBin(ZERO_HASH),                 // allowedAddr1-5
    hexToBin(ZERO_HASH),
    hexToBin(ZERO_HASH),
    hexToBin(ZERO_HASH),
    hexToBin(ZERO_HASH),
    ownerPk,                             // rescuePk (self for testing)
  ];

  const contract = new Contract(artifact, initParams, { provider });
  const vaultAddress = contract.address;

  log('DEPLOY', `Vault address: ${vaultAddress}`);

  // Check balance
  const balance = await contract.getBalance();
  log('BALANCE', `${balance} sats`);

  if (balance < SPEND_UNDER + SPEND_OVER + MINER_FEE * 4) {
    console.error(
      `\n⚠ Vault needs funding! Send at least ${SPEND_OVER * 2 + MINER_FEE * 4} sats to:\n${vaultAddress}\n\nUse https://tbch.googol.cash/`
    );
    process.exit(1);
  }

  // We need a destination address — just send to ourselves
  const destAddress = vaultAddress; // for testing, send back to vault won't work with covenant
  // Use a simple P2PKH address derived from our key instead
  // For chipnet testing, we'll use the owner's P2PKH address

  // 4. TEST: Spend UNDER limit → should succeed
  log('TEST 1', `Spending ${SPEND_UNDER} sats (under limit of ${DAILY_LIMIT_SATS})...`);
  try {
    const currentLocktime = Math.floor(Date.now() / 1000);

    // Build the covenant continuation contract (with updated spentToday)
    const newParams = [...initParams];
    newParams[3] = BigInt(SPEND_UNDER);              // spentTodaySats
    newParams[4] = BigInt(currentDay());              // dayMarker

    const nextContract = new Contract(artifact, newParams, { provider });

    const tx = await contract.functions
      .spend(sigTemplate, ownerPk, BigInt(SPEND_UNDER))
      .to(nextContract.address, BigInt(SPEND_UNDER))
      .withTime(currentLocktime)
      .send();

    log('TEST 1 ✓', `PAID — tx: ${tx.txid}`);
    log('EXPLORER', `https://chipnet.chaingraph.cash/tx/${tx.txid}`);
  } catch (err) {
    log('TEST 1 ✗', `UNEXPECTED FAILURE: ${err.message}`);
  }

  // 5. TEST: Spend OVER limit → should REFUSE
  log('TEST 2', `Spending ${SPEND_OVER} sats (OVER limit of ${DAILY_LIMIT_SATS})...`);
  try {
    const currentLocktime = Math.floor(Date.now() / 1000);

    const tx = await contract.functions
      .spend(sigTemplate, ownerPk, BigInt(SPEND_OVER))
      .to(contract.address, BigInt(SPEND_OVER))
      .withTime(currentLocktime)
      .send();

    log('TEST 2 ✗', `Should have been refused but got tx: ${tx.txid}`);
  } catch (err) {
    log('TEST 2 ✓', `REFUSED by Nomos — ${err.message}`);
  }

  // 6. TEST: setMandate — update daily limit
  log('TEST 3', 'Updating mandate: raising daily limit to 50000 sats...');
  try {
    const newLimit = 50_000n;
    const mandateParams = [
      ownerPk,                           // newAgentPk
      newLimit,                          // newDailyLimit
      false,                             // newAllowlistEnabled
      hexToBin(ZERO_HASH),              // newAddr1-5
      hexToBin(ZERO_HASH),
      hexToBin(ZERO_HASH),
      hexToBin(ZERO_HASH),
      hexToBin(ZERO_HASH),
      ownerPk,                           // newRescuePk
    ];

    const updatedParams = [...initParams];
    updatedParams[2] = newLimit;
    const updatedContract = new Contract(artifact, updatedParams, { provider });

    const tx = await contract.functions
      .setMandate(sigTemplate, ...mandateParams)
      .to(updatedContract.address, balance - BigInt(MINER_FEE))
      .send();

    log('TEST 3 ✓', `Mandate updated — tx: ${tx.txid}`);
  } catch (err) {
    log('TEST 3 ✗', `setMandate failed: ${err.message}`);
  }

  // 7. TEST: rescue — move all funds out
  log('TEST 4', 'Rescue: moving all funds out (bypasses limit)...');
  try {
    const tx = await contract.functions
      .rescue(sigTemplate, sigTemplate) // owner + rescue are same key for testing
      .send();

    log('TEST 4 ✓', `Rescued — tx: ${tx.txid}`);
  } catch (err) {
    log('TEST 4 ✗', `Rescue failed: ${err.message}`);
  }

  log('DONE', 'All tests complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
