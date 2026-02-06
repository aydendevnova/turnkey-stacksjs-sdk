/**
 * @turnkey/stacks - Type Definitions
 *
 * Types for the Turnkey Stacks signer package.
 */

import type { StacksTransactionWire } from "@stacks/transactions"

/**
 * Stacks network type
 */
export type StacksNetworkType = "testnet" | "mainnet"

/**
 * Turnkey client interface - minimal interface for signing
 *
 * This interface is satisfied by:
 * - TurnkeyServerSDK from @turnkey/sdk-server (via apiClient())
 * - TurnkeyBrowserClient from @turnkey/sdk-browser
 * - TurnkeyClient from @turnkey/http
 */
export interface TurnkeySignerClient {
  signRawPayload(params: {
    organizationId?: string
    signWith: string
    payload: string
    encoding: "PAYLOAD_ENCODING_HEXADECIMAL"
    hashFunction: "HASH_FUNCTION_NO_OP"
  }): Promise<{ v: string; r: string; s: string }>
}

/**
 * Configuration for TurnkeySigner
 */
export interface TurnkeySignerConfig {
  /**
   * Turnkey client instance that implements signRawPayload
   *
   * For @turnkey/sdk-server: pass `turnkey.apiClient()`
   * For @turnkey/react-wallet-kit (browser): pass `httpClient` from `useTurnkey()`
   * For @turnkey/sdk-browser: pass the client directly
   */
  client: TurnkeySignerClient

  /**
   * Compressed secp256k1 public key (66 hex chars, starts with 02 or 03)
   * This is used for both signing and address derivation
   */
  publicKey: string

  /**
   * Turnkey organization ID
   *
   * Required for server-side signing with @turnkey/sdk-server.
   * Omit when using the browser client (httpClient from useTurnkey()) —
   * the browser session already scopes operations to the user's sub-organization.
   */
  organizationId?: string

  /**
   * Default network for transactions
   * @default "testnet"
   */
  network?: StacksNetworkType
}

/**
 * Parameters for signing an STX token transfer
 *
 * Note: organizationId is not needed here — it is set once on TurnkeySigner
 * construction and used for all signing operations automatically.
 */
export interface STXTransferParams {
  /**
   * Recipient Stacks address (ST... for testnet, SP... for mainnet)
   */
  recipient: string

  /**
   * Amount to transfer in microSTX (1 STX = 1,000,000 microSTX)
   */
  amount: bigint

  /**
   * Transaction nonce - fetched automatically if not provided
   */
  nonce?: bigint

  /**
   * Transaction fee in microSTX
   * @default 180n
   */
  fee?: bigint

  /**
   * Optional memo string (max 34 bytes)
   */
  memo?: string

  /**
   * Network override for this transaction
   */
  network?: StacksNetworkType
}

/**
 * Result from signing a transaction
 */
export interface SignedTransactionResult {
  /**
   * Signed transaction ready for broadcast
   */
  transaction: StacksTransactionWire

  /**
   * Sender's Stacks address
   */
  senderAddress: string

  /**
   * Transaction nonce used
   */
  nonce: bigint

  /**
   * Transaction fee in microSTX
   */
  fee: bigint
}

/**
 * Result from broadcasting a transaction
 */
export interface BroadcastResult {
  /**
   * Transaction ID (txid)
   */
  txid: string

  /**
   * Sender's Stacks address
   */
  senderAddress: string

  /**
   * Recipient's Stacks address
   */
  recipient: string

  /**
   * Amount transferred in microSTX
   */
  amount: bigint
}
