#!/usr/bin/env node

/**
 * Nomos Vault — Chipnet integration test
 *
 * Contract uses CashTokens NFT commitment for mutable state:
 *   commitment = spentTodaySats (8 bytes LE) + dayMarker (8 bytes LE)
 *
 * Tests:
 *  1. Compile NomosVault.cash
 *  2. Deploy vault with NFT + low daily limit
 *  3. Spend UNDER limit → success (covenant continues with updated NFT)
 *  4. Spend OVER limit → refuse (script failure)
 *  5. setMandate → owner migrates vault
 *  6. rescue → owner + cosigner bypass limit
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
import {
  hexToBin,
  binToHex,
  privateKeyToP2pkhCashAddress,
  decodePrivateKeyWif,
} from '@bitauth/libauth';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────────
const PRIVATE_KEY_WIF = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY_WIF) {
  console.error('Set PRIVATE_KEY env var to a chipnet WIF key');
  process.exit(1);
}

const NETWORK = 'chipnet';
const DAILY_LIMIT_SATS = 10_000;
const SPEND_UNDER = 3_000;
const SPEND_OVER = 15_000;
const MINER_FEE = 1000;

const ZERO_HASH20 = '0000000000000000000000000000000000000000';

// ── Helpers ─────────────────────────────────────────────────
function currentDay() {
  return Math.floor(Date.now() / 1000 / 86400);
}

/** Encode vault state as NFT commitment (16 bytes) */
function encodeCommitment(spentTodaySats, dayMarker) {
  const buf = Buffer.alloc(16);
  buf.writeBigInt64LE(BigInt(spentTodaySats), 0);
  buf.writeBigInt64LE(BigInt(dayMarker), 8);
  return buf;
}

/** Derive a P2PKH address from the test WIF key (used as payment destination) */
function deriveP2pkhAddress(wif) {
  const decoded = decodePrivateKeyWif(wif);
  if (typeof decoded === 'string') throw new Error(`Invalid WIF: ${decoded}`);
  const result = privateKeyToP2pkhCashAddress({
    privateKey: decoded.privateKey,
    prefix: 'bchtest', // chipnet/testnet CashAddress prefix
    throwErrors: false,
  });
  if (typeof result === 'string') throw new Error(`Address derivation failed: ${result}`);
  return result.address;
}

function log(label, msg) {
  const pad = Math.max(1, 40 - label.length);
  console.log(`\n[${'='.repeat(3)} ${label} ${'='.repeat(pad)}]`);
  if (typeof msg === 'object') console.log(JSON.stringify(msg, null, 2));
  else console.log(msg);
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  // 1. Compile
  log('COMPILE', 'Compiling NomosVault.cash...');
  const artifact = compileFile(resolve(__dirname, '..', 'NomosVault.cash'));
  log('COMPILE', `✓ Compiled — ${artifact.contractName}`);

  // 2. Provider + signer + destination address
  const provider = new ElectrumNetworkProvider(NETWORK);
  const sigTemplate = new SignatureTemplate(PRIVATE_KEY_WIF);
  const ownerPk = sigTemplate.getPublicKey();
  const destAddress = deriveP2pkhAddress(PRIVATE_KEY_WIF);

  log('WALLET', `Owner pubkey: ${binToHex(ownerPk)}`);
  log('WALLET', `Payment destination (P2PKH): ${destAddress}`);

  // 3. Build contract (immutable params only — state is in NFT)
  const contractParams = [
    ownerPk,                        // ownerPk
    ownerPk,                        // agentPk (self for testing)
    BigInt(DAILY_LIMIT_SATS),       // dailyLimitSats
    false,                          // allowlistEnabled
    hexToBin(ZERO_HASH20),          // allowedAddr1-5
    hexToBin(ZERO_HASH20),
    hexToBin(ZERO_HASH20),
    hexToBin(ZERO_HASH20),
    hexToBin(ZERO_HASH20),
    ownerPk,                        // rescuePk (self for testing)
  ];

  const contract = new Contract(artifact, contractParams, { provider });
  log('CONTRACT', `Address: ${contract.address}`);

  // Check balance
  const balance = await contract.getBalance();
  log('BALANCE', `${balance} sats`);

  if (!balance || balance <= 0n) {
    log('FUND', `Vault needs funding! Send chipnet BCH to:\n\n  ${contract.address}\n\nFaucet: https://tbch.googol.cash/`);
    log('NOTE', 'To test spend path, also mint a mutable NFT to this address.\nFor setMandate + rescue, plain BCH is enough.');
    process.exit(1);
  }

  // Check for NFT UTXOs
  const utxos = await contract.getUtxos();
  const nftUtxos = utxos.filter(u => u.token);
  const plainUtxos = utxos.filter(u => !u.token);

  log('UTXOS', `Total: ${utxos.length}, with NFT: ${nftUtxos.length}, plain: ${plainUtxos.length}`);

  if (nftUtxos.length === 0) {
    log('NFT SETUP', 'No NFT found on contract. The vault needs a mutable NFT with state commitment.');
    log('NFT SETUP', 'For now, testing setMandate + rescue (no NFT required)...');

    // ── TEST: setMandate (owner sig only, no covenant) ──
    if (plainUtxos.length > 0) {
      log('TEST: setMandate', 'Owner migrates vault (sig check only)...');
      try {
        const currentBalance = await contract.getBalance();
        const tx = await contract.functions
          .setMandate(sigTemplate)
          .to(contract.address, currentBalance - BigInt(MINER_FEE))
          .send();
        log('TEST ✓', `setMandate succeeded — tx: ${tx.txid}`);
        log('EXPLORER', `https://chipnet.chaingraph.cash/tx/${tx.txid}`);
      } catch (err) {
        log('TEST ✗', `setMandate failed: ${err.message}`);
      }
    }

    // ── TEST: rescue (owner + rescue sig) ──
    const balanceAfterMandate = await contract.getBalance();
    if (balanceAfterMandate > 0n) {
      log('TEST: rescue', 'Owner + cosigner rescue funds...');
      try {
        const tx = await contract.functions
          .rescue(sigTemplate, sigTemplate) // same key for both in test
          .to(destAddress, balanceAfterMandate - BigInt(MINER_FEE))
          .send();
        log('TEST ✓', `rescue succeeded — tx: ${tx.txid}`);
        log('EXPLORER', `https://chipnet.chaingraph.cash/tx/${tx.txid}`);
      } catch (err) {
        log('TEST ✗', `rescue failed: ${err.message}`);
      }
    }

    log('NEXT', 'To test spend (with daily limit enforcement), mint an NFT to the contract address.');
    log('NEXT', 'The NFT commitment should be 16 zero bytes (0 spent, day 0) with mutable capability.');
    process.exit(0);
  }

  // ── We have an NFT — test the spend path ──
  const nftUtxo = nftUtxos[0];
  log('NFT FOUND', `Category: ${nftUtxo.token.category}, commitment: ${binToHex(nftUtxo.token.nft.commitment)}`);

  // 4. TEST: Spend UNDER limit → should succeed
  log('TEST 1', `Spend ${SPEND_UNDER} sats (under limit of ${DAILY_LIMIT_SATS})...`);
  try {
    const locktime = Math.floor(Date.now() / 1000);
    const newCommitment = encodeCommitment(SPEND_UNDER, currentDay());
    const changeAmount = nftUtxo.satoshis - BigInt(SPEND_UNDER) - BigInt(MINER_FEE);

    const tx = await contract.functions
      .spend(sigTemplate, ownerPk, BigInt(SPEND_UNDER))
      .from(nftUtxo)
      // Output 0: covenant continuation with updated NFT
      .to(contract.tokenAddress, changeAmount, {
        category: nftUtxo.token.category,
        nft: { capability: 'mutable', commitment: binToHex(newCommitment) },
      })
      // Output 1: payment to a normal P2PKH address
      .to(destAddress, BigInt(SPEND_UNDER))
      .withTime(locktime)
      .send();

    log('TEST 1 ✓', `PAID under mandate — tx: ${tx.txid}`);
    log('EXPLORER', `https://chipnet.chaingraph.cash/tx/${tx.txid}`);
  } catch (err) {
    log('TEST 1 ✗', `Unexpected failure: ${err.message}`);
  }

  // 5. TEST: Spend OVER limit → should REFUSE
  log('TEST 2', `Spend ${SPEND_OVER} sats (OVER limit of ${DAILY_LIMIT_SATS})...`);
  try {
    const locktime = Math.floor(Date.now() / 1000);

    // Re-fetch UTXOs after test 1
    const freshUtxos = await contract.getUtxos();
    const freshNft = freshUtxos.find(u => u.token);

    if (!freshNft) {
      log('TEST 2 ✗', 'No NFT UTXO available (test 1 may have consumed it)');
    } else {
      // Read current spent from the NFT commitment after test 1
      const currentCommitment = freshNft.token.nft.commitment;
      const spentBuf = Buffer.from(currentCommitment.slice(0, 16), 'hex');
      const currentSpent = Number(spentBuf.readBigInt64LE(0));

      // The over-limit commitment would claim we spent this much
      const overCommitment = encodeCommitment(currentSpent + SPEND_OVER, currentDay());
      const overChange = freshNft.satoshis - BigInt(SPEND_OVER) - BigInt(MINER_FEE);

      const tx = await contract.functions
        .spend(sigTemplate, ownerPk, BigInt(SPEND_OVER))
        .from(freshNft)
        .to(contract.tokenAddress, overChange, {
          category: freshNft.token.category,
          nft: { capability: 'mutable', commitment: binToHex(overCommitment) },
        })
        .to(destAddress, BigInt(SPEND_OVER))
        .withTime(locktime)
        .send();

      log('TEST 2 ✗', `Should have been refused but got tx: ${tx.txid}`);
    }
  } catch (err) {
    log('TEST 2 ✓', `REFUSED by Nomos — ${err.message}`);
  }

  log('DONE', 'All tests complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
