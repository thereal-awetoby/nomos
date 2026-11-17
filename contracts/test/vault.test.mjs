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
const MINER_FEE = 1000;
const DUST_SATS = 1000;

const ZERO_HASH20 = '0000000000000000000000000000000000000000';

// ── Helpers ─────────────────────────────────────────────────

/** Encode vault state as NFT commitment (16 bytes) */
function encodeCommitment(spentTodaySats, dayMarker) {
  const buf = Buffer.alloc(16);
  buf.writeBigInt64LE(BigInt(spentTodaySats), 0);
  buf.writeBigInt64LE(BigInt(dayMarker), 8);
  return buf;
}

/** Decode the 16-byte state commitment (hex) */
function decodeCommitment(hex) {
  const buf = Buffer.from(hex, 'hex');
  return { spentTodaySats: Number(buf.readBigInt64LE(0)), dayMarker: Number(buf.readBigInt64LE(8)) };
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
  // CashScript 0.11 returns the commitment as a hex string already
  log('NFT FOUND', `Category: ${nftUtxo.token.category}, commitment: ${nftUtxo.token.nft.commitment}`);

  // Nodes reject a tx whose locktime is later than the chain's median time past
  // (non-final), so back-date it. The contract derives "today" from tx.locktime,
  // so the commitment's day marker must be computed from the same value.
  const locktime = Math.floor(Date.now() / 1000) - 3 * 3600;
  const day = Math.floor(locktime / 86400);

  const state = decodeCommitment(nftUtxo.token.nft.commitment);
  const effectiveSpent = state.dayMarker === day ? state.spentTodaySats : 0;
  log('STATE', `spentToday=${state.spentTodaySats}, dayMarker=${state.dayMarker}, counted today=${effectiveSpent}`);

  // 4. TEST: Spend UNDER limit → should be PAID
  log('TEST 1', `Spend ${SPEND_UNDER} sats (under limit of ${DAILY_LIMIT_SATS})...`);
  const test1Change = nftUtxo.satoshis - BigInt(SPEND_UNDER) - BigInt(MINER_FEE);
  if (effectiveSpent + SPEND_UNDER > DAILY_LIMIT_SATS) {
    log('TEST 1 –', `Skipped: ${effectiveSpent} already spent today, another ${SPEND_UNDER} would break the limit. Rerun tomorrow.`);
  } else if (test1Change < BigInt(DUST_SATS)) {
    log('TEST 1 –', `Skipped: vault holds ${nftUtxo.satoshis} sats, too little for a ${SPEND_UNDER}-sat spend + fee. Top up ${contract.tokenAddress}`);
  } else {
    try {
      const tx = await contract.functions
        .spend(sigTemplate, ownerPk, BigInt(SPEND_UNDER))
        .from(nftUtxo)
        // Output 0: covenant continuation carrying the updated state NFT
        .to(contract.tokenAddress, test1Change, {
          category: nftUtxo.token.category,
          amount: 0n,
          nft: { capability: 'mutable', commitment: binToHex(encodeCommitment(effectiveSpent + SPEND_UNDER, day)) },
        })
        // Output 1: the payment
        .to(destAddress, BigInt(SPEND_UNDER))
        .withTime(locktime)
        .send();

      log('TEST 1 ✓', `PAID under mandate — tx: ${tx.txid}`);
      log('EXPLORER', `https://chipnet.chaingraph.cash/tx/${tx.txid}`);
    } catch (err) {
      log('TEST 1 ✗', `Unexpected failure: ${err.message}`);
    }
  }

  // 5. TEST: Spend OVER limit → chain must REFUSE
  // The vault alone can't fund an over-limit payment, so the owner's wallet adds
  // a second input. Every other rule is satisfied, so the only thing the
  // covenant can object to is the daily limit.
  log('TEST 2', 'Spend over the daily limit — broadcast to chipnet, expect the network to reject it...');
  try {
    const freshNft = (await contract.getUtxos()).find((u) => u.token);
    if (!freshNft) throw new Error('No NFT UTXO on the contract');

    const fresh = decodeCommitment(freshNft.token.nft.commitment);
    const spentNow = fresh.dayMarker === day ? fresh.spentTodaySats : 0;
    const overAmount = DAILY_LIMIT_SATS - spentNow + 1; // 1 sat past the limit
    log('TEST 2', `Already spent today: ${spentNow}. Attempting ${overAmount} → total ${spentNow + overAmount} > ${DAILY_LIMIT_SATS}`);

    const walletUtxos = (await provider.getUtxos(destAddress))
      .filter((u) => !u.token)
      .sort((a, b) => (b.satoshis > a.satoshis ? 1 : -1));
    const funding = walletUtxos[0];
    const walletChange = funding ? funding.satoshis - BigInt(overAmount) - BigInt(MINER_FEE) : -1n;

    if (!funding || walletChange < BigInt(DUST_SATS)) {
      log('TEST 2 –', `Skipped: wallet needs at least ${overAmount + MINER_FEE + DUST_SATS} sats in one coin to fund the attempt.`);
    } else {
      const overTx = contract.functions
        .spend(sigTemplate, ownerPk, BigInt(overAmount))
        .from(freshNft)
        .fromP2PKH(funding, sigTemplate)
        .to(contract.tokenAddress, freshNft.satoshis, {
          category: freshNft.token.category,
          amount: 0n,
          nft: { capability: 'mutable', commitment: binToHex(encodeCommitment(spentNow + overAmount, day)) },
        })
        .to(destAddress, BigInt(overAmount))
        .to(destAddress, walletChange)
        .withoutChange()
        .withTime(locktime);

      // Local evaluation: shows which rule in NomosVault.cash fails
      try {
        await overTx.debug();
        log('TEST 2', 'Local evaluation unexpectedly passed');
      } catch (err) {
        log('TEST 2', `Local evaluation fails: ${String(err.message).split('\n')[0]}`);
      }

      // Real broadcast: the chipnet node is the judge
      const raw = await overTx.build();
      try {
        const txid = await provider.sendRawTransaction(raw);
        log('TEST 2 ✗', `NOT REFUSED — chain accepted over-limit tx: ${txid}`);
      } catch (err) {
        log('TEST 2 ✓', `REFUSED on-chain by the network: ${err.message ?? err}`);
      }
    }
  } catch (err) {
    log('TEST 2 ✗', `Test error (not a chain refusal): ${err.message}`);
  }

  log('DONE', 'All tests complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
