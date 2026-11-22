// Shared by the live-run scripts (htlc-demo, swap-demo, keys).
//
// Left alone, the SDK opens a new socket for each burst of requests and retries
// a dropped one once, so a run could stop halfway on "WebSocket: 1006". Here one
// socket stays open for the whole run, a request that fails for want of a
// connection is tried again after a pause, and after a few failures the next
// server in the list takes over. ELECTRUM=<host> or <host>:<port> puts your
// own choice of server first.

import { createHash } from 'node:crypto'
import { ElectrumNetworkProvider } from '@solidcash/solidcash/network/electrum'

const SERVERS = {
  mainnet: ['bch.imaginary.cash', 'electrum.imaginary.cash'],
  chipnet: ['chipnet.bch.ninja', 'chipnet.imaginary.cash'],
}
const ATTEMPTS = 8

const message = (e) => String(e?.message ?? e)
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const sha256 = (bytes) => createHash('sha256').update(bytes).digest()

/** The server could not be reached or the socket dropped: nothing about the transaction itself. */
export const isConnectionError = (e) =>
  /Failed to establish connection|timed out after|Connection lost|disconnected server|Could not write|WebSocket|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up/i
    .test(message(e))

/** The key had too few coins to pay for the call, so the contract never got to judge it. */
export const isFundingError = (e) =>
  /satoshis from the signer|Fund the signer address|available plain UTXO|not enough funds|insufficient funds/i.test(message(e))

/** A second key for a run, derived from the wallet's so the same WIF recovers it. */
export const derivedKey = (label, privateKey) =>
  new Uint8Array(sha256(new Uint8Array([...Buffer.from(label), ...privateKey])))

const txidOf = (rawHex) => Buffer.from(sha256(sha256(Buffer.from(rawHex, 'hex')))).reverse().toString('hex')
const endpoint = (server) => {
  const [hostname, port] = server.split(':')
  return port ? { hostname, port: Number(port) } : { hostname }
}

/** An Electrum provider for mainnet or chipnet that rides out dropped connections. */
export async function liveProvider(network) {
  const servers = [...new Set([process.env.ELECTRUM, ...(SERVERS[network] ?? [])].filter(Boolean))]
  let current = 0
  const provider = new ElectrumNetworkProvider(network, { ...endpoint(servers[0]), manualConnectionManagement: true })

  const nextServer = () => {
    if (servers.length < 2) return
    const old = provider.electrum
    current = (current + 1) % servers.length
    provider.electrum = provider.instantiateElectrumClient(network, endpoint(servers[current]))
    Promise.resolve().then(() => old.disconnect()).catch(() => {})
    console.log(`  (switching to ${servers[current]})`)
  }

  const request = provider.performRequest.bind(provider)
  provider.performRequest = async (name, ...parameters) => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await request(name, ...parameters)
      } catch (e) {
        // The same bytes sent again after a dropped reply: the first send got through.
        if (name === 'blockchain.transaction.broadcast' && /already (?:in|known)|txn-already/i.test(message(e))) {
          return txidOf(parameters[0])
        }
        if (!isConnectionError(e) || attempt >= ATTEMPTS) throw e
        console.log(`  (lost the connection to ${servers[current]}; trying again in ${attempt * 2} s)`)
        if (attempt % 3 === 0) nextServer()
        await wait(attempt * 2000)
      }
    }
  }

  for (let attempt = 1; ; attempt += 1) {
    try {
      await provider.connect()
      break
    } catch (e) {
      if (attempt >= ATTEMPTS) throw new Error(`Could not reach an Electrum server (${servers.join(', ')}): ${message(e)}`)
      console.log(`  (could not reach ${servers[current]}; trying again in ${attempt * 2} s)`)
      if (attempt % 3 === 0) nextServer()
      await wait(attempt * 2000)
    }
  }
  console.log(`Electrum server: ${servers[current]}`)
  return provider
}

/**
 * A dropped socket can surface outside any await; note it and keep the run
 * going. A failure of the run itself still stops it with exit code 1.
 */
export function keepRunningThroughDroppedSockets() {
  process.on('unhandledRejection', (e) => {
    console.log(`  (ignored a background error: ${message(e).split('\n')[0]})`)
  })
  process.on('uncaughtException', (e, origin) => {
    if (origin === 'uncaughtException' && isConnectionError(e)) {
      console.log(`  (ignored a dropped connection: ${message(e).split('\n')[0]})`)
      return
    }
    console.error(e)
    process.exit(1)
  })
}
