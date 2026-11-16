#!/usr/bin/env node

/**
 * Nomos Vault — Mint genesis NFT to contract address (chipnet)
 *
 * Creates a mutable CashTokens NFT with 16-byte zero commitment
 * (spentTodaySats=0, dayMarker=0) and sends it to the vault contract.
 *
 * Usage:
 *   cd contracts
 *   npm install mainnet-js
 *   PRIVATE_KEY=<chipnet-wif> node test/mint-nft.mjs
 */

import { compileFile } from 'cashc';
import { Contract, ElectrumNetworkProvider, SignatureTemplate } from 'cashscript';
import { hexToBin, binToHex } from '@bitauth/libauth';
import { TestNetWallet } from 'mainnet-js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PRIVATE_KEY_WIF = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY_WIF) {
  console.error('Set PRIVATE_KEY env var to a chipnet WIF key');
  process.exit(1);
}

const NETWORK = 'chipnet';
const DAILY_LIMIT_SATS = 10_000;
const ZERO_HASH20 = '0000000000000000000000000000000000000000';
const VAULT_SEED_SATS = 10_000; // sats to send with NFT to vault

// 16 zero bytes hex: spentToday=0, dayMarker=0
const ZERO_COMMITMENT = '00000000000000000000000000000000';

function log(label, msg) {
  console.log(`\n[=== ${label} ===]`);
  console.log(msg);
}

async function main() {
  // 1. Set up mainnet-js wallet on chipnet
  const wallet = await TestNetWallet.fromWIF(PRIVATE_KEY_WIF);

  // Force chipnet network
  wallet.network = 'chipnet';

  const walletAddr = wallet.cashaddr;
  const balance = await wallet.getBalance('sat');
  log('WALLET', `Address: ${walletAddr}`);
  log('WALLET', `Balance: ${balance} sats`);

  if (balance < VAULT_SEED_SATS + 1000) {
    log('ERROR', `Need at least ${VAULT_SEED_SATS + 1000} sats. Fund via faucet.`);
    process.exit(1);
  }

  // 2. Compile contract to get its token address
  const artifact = compileFile(resolve(__dirname, '..', 'NomosVault.cash'));
  const provider = new ElectrumNetworkProvider(NETWORK);
  const sigTemplate = new SignatureTemplate(PRIVATE_KEY_WIF);
  const ownerPk = sigTemplate.getPublicKey();

  const contractParams = [
    ownerPk,
    ownerPk,                          // agentPk = owner for testing
    BigInt(DAILY_LIMIT_SATS),
    false,                            // allowlistEnabled
    hexToBin(ZERO_HASH20),
    hexToBin(ZERO_HASH20),
    hexToBin(ZERO_HASH20),
    hexToBin(ZERO_HASH20),
    hexToBin(ZERO_HASH20),
    ownerPk,                          // rescuePk = owner for testing
  ];

  const contract = new Contract(artifact, contractParams, { provider });
  log('CONTRACT', `Contract address: ${contract.address}`);
  log('CONTRACT', `Token address:    ${contract.tokenAddress}`);

  // 3. Mint genesis NFT via mainnet-js
  log('MINT', 'Creating mutable NFT with 16-byte zero commitment...');
  log('MINT', `Commitment: ${ZERO_COMMITMENT}`);
  log('MINT', `Destination: ${contract.tokenAddress}`);
  log('MINT', `Seed amount: ${VAULT_SEED_SATS} sats`);

  try {
    const mintResult = await wallet.tokenGenesis({
      cashaddr: contract.tokenAddress,
      amount: 0,                        // no fungible tokens
      value: VAULT_SEED_SATS,           // sats to send with NFT
      capability: 'mutable',
      commitment: ZERO_COMMITMENT,
    });

    log('SUCCESS', `NFT minted!`);
    log('TXID', mintResult.txId);
    log('CATEGORY', `Token category: ${mintResult.tokenIds?.[0] || 'check explorer'}`);
    log('EXPLORER', `https://chipnet.chaingraph.cash/tx/${mintResult.txId}`);
    log('NEXT', `\nWait ~1 min for confirmation, then run:\n  PRIVATE_KEY=... node test/vault.test.mjs`);
  } catch (err) {
    log('MINT FAILED', err.message);
    if (err.message.includes('insufficient')) {
      log('HINT', 'Not enough sats. Get more from faucet: https://tbch.googol.cash/');
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
