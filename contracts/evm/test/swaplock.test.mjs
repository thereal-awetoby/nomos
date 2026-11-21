// SwapLock.sol (the USDC side of the PUSD <-> USDC swap), checked offline.
//
// 1. frontend/src/lib/SwapLockEvm.json is exactly what solc 0.8.24 builds from
//    contracts/evm/SwapLock.sol (optimizer 200 runs, EVM paris), creation and
//    runtime code alike. The app compares a contract's on-chain code with that
//    runtime code before it trusts or approves the contract.
// 2. The function selectors and event topic hard-coded in evm.ts are right.
// 3. The shipped bytecode, run in an EVM against a mock USDC with evm.ts's
//    calldata encoding: lock, claim and refund, and every guard.
//
// Run: cd contracts/evm && npm ci && npm test

import { readFileSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import solc from 'solc'
import { keccak_256 } from '@noble/hashes/sha3'
import { bytesToHex as nobleHex, utf8ToBytes } from '@noble/hashes/utils'

// The CommonJS builds: @ethereumjs/evm 2.2.1's ESM build fails to link
// against @ethereumjs/statemanager 2.4.0.
const require = createRequire(import.meta.url)
const { VM } = require('@ethereumjs/vm')
const { Address, hexToBytes, bytesToHex } = require('@ethereumjs/util')
const { Block } = require('@ethereumjs/block')
const { Common, Chain, Hardfork } = require('@ethereumjs/common')

const here = (path) => new URL(path, import.meta.url)
const source = readFileSync(here('../SwapLock.sol'), 'utf8')
const artifact = JSON.parse(readFileSync(here('../../../frontend/src/lib/SwapLockEvm.json'), 'utf8'))
const evmTs = readFileSync(here('../../../frontend/src/lib/evm.ts'), 'utf8')

let pass = 0
let fail = 0
const check = (ok, label) => {
  if (ok) pass++
  else fail++
  console.log(`${ok ? '✓' : '✗'} ${label}`)
}

// ── 1. Artifact reproduces from source ──
const MOCK_USDC = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
contract MockUSDC {
  mapping(address => uint256) public balanceOf;
  mapping(address => mapping(address => uint256)) public allowance;
  function mint(address to, uint256 a) external { balanceOf[to] += a; }
  function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
  function transfer(address to, uint256 a) external returns (bool) { balanceOf[msg.sender] -= a; balanceOf[to] += a; return true; }
  function transferFrom(address f, address to, uint256 a) external returns (bool) {
    allowance[f][msg.sender] -= a; balanceOf[f] -= a; balanceOf[to] += a; return true;
  }
}`
const out = JSON.parse(solc.compile(JSON.stringify({
  language: 'Solidity',
  // Same source unit name as the command that built the artifact, so the metadata hash matches too.
  sources: { 'contracts/evm/SwapLock.sol': { content: source }, 'MockUSDC.sol': { content: MOCK_USDC } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'paris',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'evm.methodIdentifiers'] } },
  },
})))
const errors = (out.errors ?? []).filter((e) => e.severity === 'error')
if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join('\n'))
const compiled = out.contracts['contracts/evm/SwapLock.sol'].SwapLock
check(solc.version().startsWith('0.8.24+commit.e11b9ed9'), `compiler is solc ${solc.version()}`)
check(`0x${compiled.evm.bytecode.object}` === artifact.bytecode, 'shipped creation bytecode is byte-for-byte the compiled source')
check(`0x${compiled.evm.deployedBytecode.object}` === artifact.deployedBytecode, 'shipped runtime bytecode (used for the on-chain code check) is the compiled source')
check(JSON.stringify(compiled.abi) === JSON.stringify(artifact.abi), 'shipped ABI matches')

// ── 2. evm.ts selectors and topic ──
const selBlock = evmTs.match(/const SEL = \{([\s\S]*?)\}/)?.[1] ?? ''
const SEL = Object.fromEntries([...selBlock.matchAll(/(\w+):\s*'([0-9a-f]{8})'/g)].map((m) => [m[1], m[2]]))
const signatures = {
  approve: 'approve(address,uint256)',
  allowance: 'allowance(address,address)',
  balanceOf: 'balanceOf(address)',
  lock: 'lock(bytes32,address,address,uint256,uint64)',
  claim: 'claim(bytes32)',
  refund: 'refund(bytes32)',
  locks: 'locks(bytes32)',
}
const keccak = (text) => nobleHex(keccak_256(utf8ToBytes(text)))
for (const [name, sig] of Object.entries(signatures)) {
  check(SEL[name] === keccak(sig).slice(0, 8), `evm.ts selector ${name} = ${sig}`)
}
const topic = evmTs.match(/TOPIC_CLAIMED = '(0x[0-9a-f]{64})'/)?.[1]
check(topic === `0x${keccak('Claimed(bytes32,bytes32)')}`, 'evm.ts Claimed topic = Claimed(bytes32,bytes32)')

// ── 3. Run the shipped bytecode ──
const strip0x = (h) => (h.startsWith('0x') ? h.slice(2) : h)
const word = (hex) => strip0x(hex).toLowerCase().padStart(64, '0')
const uintWord = (v) => word(v.toString(16))
const call = (selector, ...words) => `0x${selector}${words.join('')}`
const sha256hex = (hex) => createHash('sha256').update(Buffer.from(strip0x(hex), 'hex')).digest('hex')
// Same decoding as readBaseLock in evm.ts
function decodeLock(hex) {
  const w = (i) => strip0x(hex).slice(i * 64, (i + 1) * 64)
  const sender = `0x${w(1).slice(24)}`
  if (/^0x0{40}$/.test(sender)) return null
  return { token: `0x${w(0).slice(24)}`, sender, recipient: `0x${w(2).slice(24)}`, amount: BigInt(`0x${w(3)}`), refundAfter: Number(BigInt(`0x${w(4)}`)), done: BigInt(`0x${w(5)}`) !== 0n }
}

const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Shanghai })
const vm = await VM.create({ common })
const T0 = 1_800_000_000
const at = (t) => Block.fromBlockData({ header: { timestamp: BigInt(t), number: 1n, gasLimit: 30_000_000n } }, { common })
const actor = (n) => new Address(hexToBytes(`0x${n.toString(16).padStart(40, '0')}`))
const ALICE = actor(0xa11ce)
const BOB = actor(0xb0b)
const MALLORY = actor(0xbad)
async function run(caller, to, data, t = T0) {
  const r = await vm.evm.runCall({ caller, to, data: hexToBytes(data), gasLimit: 5_000_000n, block: at(t) })
  return { ok: !r.execResult.exceptionError, ret: bytesToHex(r.execResult.returnValue), logs: r.execResult.logs ?? [], created: r.createdAddress }
}

const swap = (await run(ALICE, undefined, artifact.bytecode)).created
check(Boolean(swap), 'SwapLock deploys from the shipped bytecode')
const deployedCode = bytesToHex(await vm.stateManager.getContractCode(swap))
check(deployedCode === artifact.deployedBytecode, 'deployed code equals deployedBytecode, so isSwapLock() accepts a real deployment')

const usdc = (await run(ALICE, undefined, `0x${out.contracts['MockUSDC.sol'].MockUSDC.evm.bytecode.object}`)).created
const mint = keccak('mint(address,uint256)').slice(0, 8)
await run(ALICE, usdc, call(mint, word(ALICE.toString()), uintWord(5_000_000n)))
const balance = async (who) => BigInt((await run(ALICE, usdc, call(SEL.balanceOf, word(who.toString())))).ret)
const lock = (from, hash, amount, refundAfter) => run(from, swap, call(SEL.lock, word(hash), word(usdc.toString()), word(BOB.toString()), uintWord(amount), uintWord(BigInt(refundAfter))))
const approve = (from, amount) => run(from, usdc, call(SEL.approve, word(swap.toString()), uintWord(amount)))

const secret = randomBytes(32).toString('hex')
const hash = sha256hex(secret)
const refundAfter = T0 + 12 * 3600

check(!(await lock(ALICE, hash, 1_000_000n, refundAfter)).ok, 'a lock without USDC approval reverts')
await approve(ALICE, 1_000_000n)
check((await lock(ALICE, hash, 1_000_000n, refundAfter)).ok && (await balance(swap)) === 1_000_000n, 'Alice approves and locks 1 USDC for Bob')

const stored = decodeLock((await run(ALICE, swap, call(SEL.locks, word(hash)))).ret)
check(Boolean(stored && stored.token === usdc.toString() && stored.sender === ALICE.toString() && stored.recipient === BOB.toString()
  && stored.amount === 1_000_000n && stored.refundAfter === refundAfter && !stored.done), 'readBaseLock decoding returns the stored lock')
check(decodeLock((await run(ALICE, swap, call(SEL.locks, word('00'.repeat(32))))).ret) === null, 'an unknown hash reads as no lock')

await approve(ALICE, 1n)
check(!(await lock(ALICE, hash, 1n, refundAfter)).ok, 'the same secret hash cannot be locked twice')
check(!(await run(MALLORY, swap, call(SEL.refund, word(hash)), refundAfter - 1)).ok, 'a refund before the timeout reverts')
check(!(await run(MALLORY, swap, call(SEL.claim, word(randomBytes(32).toString('hex'))))).ok, 'a wrong secret reverts')
check(!(await run(MALLORY, swap, call(SEL.claim, word(secret)), refundAfter)).ok, 'a claim at or after the timeout reverts')

const claim = await run(MALLORY, swap, call(SEL.claim, word(secret)))
check(claim.ok && (await balance(BOB)) === 1_000_000n && (await balance(MALLORY)) === 0n, 'anyone may submit the secret; the USDC goes to Bob, the recipient')
const event = claim.logs.find((l) => bytesToHex(l[1][0]) === topic)
check(Boolean(event) && bytesToHex(event[1][1]) === `0x${hash}` && bytesToHex(event[2]).slice(2, 66) === secret,
  'Claimed(secretHash, secret) carries the secret that findBaseSecret reads')
check(sha256hex(secret) === hash, 'the revealed secret opens the BCH lock too (SHA-256 on both chains)')
check(!(await run(MALLORY, swap, call(SEL.claim, word(secret)))).ok, 'a second claim reverts')
check(!(await run(ALICE, swap, call(SEL.refund, word(hash)), refundAfter + 1)).ok, 'a refund after a claim reverts')

const secret2 = randomBytes(32).toString('hex')
const hash2 = sha256hex(secret2)
await approve(ALICE, 500_000n)
await lock(ALICE, hash2, 500_000n, refundAfter)
const before = await balance(ALICE)
check((await run(MALLORY, swap, call(SEL.refund, word(hash2)), refundAfter)).ok && (await balance(ALICE)) === before + 500_000n,
  'after the timeout anyone may trigger the refund; the USDC returns to Alice')
check(!(await lock(ALICE, sha256hex(randomBytes(32).toString('hex')), 1n, T0 - 1)).ok, 'a lock whose refund time has passed is refused')

console.log(`\n${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
