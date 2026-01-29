/**
 * @turnkey/stacks
 *
 * Turnkey signer for Stacks blockchain transactions.
 *
 * This package provides a class-based signer following the patterns established
 * by @turnkey/solana, @turnkey/ethers, and @turnkey/cosmjs.
 *
 * @example
 * ```typescript
 * import { TurnkeySigner, broadcastTransaction } from "@turnkey/stacks"
 * import { Turnkey } from "@turnkey/sdk-server"
 *
 * const turnkey = new Turnkey({ ... })
 * const signer = new TurnkeySigner({
 *   client: turnkey.apiClient(),
 *   organizationId: "org-id",
 *   publicKey: "025afa...",
 * })
 *
 * const address = signer.getAddress()
 * const { transaction } = await signer.signSTXTransfer({
 *   recipient: "ST2J6ZY...",
 *   amount: 1_000_000n,
 * })
 * const txid = await broadcastTransaction(transaction)
 * ```
 *
 * @packageDocumentation
 */

import {
  broadcastTransaction as stacksBroadcastTransaction,
  createMessageSignature,
  makeUnsignedSTXTokenTransfer,
  publicKeyToAddress,
  sigHashPreSign,
  TransactionSigner,
  validateStacksAddress,
  type SingleSigSpendingCondition,
  type StacksTransactionWire,
} from "@stacks/transactions"

import type {
  TurnkeySignerClient,
  TurnkeySignerConfig,
  STXTransferParams,
  SignedTransactionResult,
  BroadcastResult,
  StacksNetworkType,
} from "./types"

// Re-export types
export type {
  TurnkeySignerClient,
  TurnkeySignerConfig,
  STXTransferParams,
  SignedTransactionResult,
  BroadcastResult,
  StacksNetworkType,
}

// Default fee for STX transfers (conservative)
const DEFAULT_FEE = 180n

// API endpoints by network
const API_ENDPOINTS: Record<StacksNetworkType, string> = {
  testnet: "https://api.testnet.hiro.so",
  mainnet: "https://api.hiro.so",
}

/**
 * Validates that a public key is in compressed secp256k1 format
 * @internal
 */
function validateCompressedPublicKey(pubKeyHex: string): string {
  if (typeof pubKeyHex !== "string") {
    throw new Error("Public key must be a string")
  }

  const cleaned = pubKeyHex.startsWith("0x") ? pubKeyHex.slice(2) : pubKeyHex

  if (cleaned.length !== 66) {
    throw new Error(
      `Invalid public key length: expected 66 hex chars (33 bytes compressed), got ${cleaned.length}`
    )
  }

  const prefix = cleaned.slice(0, 2)
  if (prefix !== "02" && prefix !== "03") {
    throw new Error(
      `Invalid public key prefix: expected '02' or '03' (compressed), got '${prefix}'`
    )
  }

  return cleaned
}

/**
 * Normalizes the recovery byte from Turnkey signature
 * @internal
 */
function normalizeRecoveryByte(v: string): string {
  const parsed = parseInt(v, 16)
  if (parsed !== 0 && parsed !== 1) {
    throw new Error(`Invalid recovery byte value: ${v} (expected 0 or 1)`)
  }
  return parsed.toString(16).padStart(2, "0")
}

/**
 * TurnkeySigner - Turnkey signer for Stacks transactions
 *
 * Follows the patterns established by @turnkey/solana, @turnkey/ethers, and @turnkey/cosmjs.
 *
 * @example
 * ```typescript
 * import { TurnkeySigner } from "@turnkey/stacks"
 * import { Turnkey } from "@turnkey/sdk-server"
 *
 * const turnkey = new Turnkey({
 *   apiBaseUrl: "https://api.turnkey.com",
 *   apiPrivateKey: process.env.TURNKEY_API_PRIVATE_KEY,
 *   apiPublicKey: process.env.TURNKEY_API_PUBLIC_KEY,
 *   defaultOrganizationId: process.env.TURNKEY_ORGANIZATION_ID,
 * })
 *
 * const signer = new TurnkeySigner({
 *   client: turnkey.apiClient(),
 *   organizationId: process.env.TURNKEY_ORGANIZATION_ID,
 *   publicKey: "025afa6566651f6c49d84a482a1af918b25ba7caac0b06d9ab8d79a45b72715aeb",
 *   network: "testnet",
 * })
 *
 * // Get address
 * const address = signer.getAddress()
 *
 * // Sign a transfer
 * const { transaction } = await signer.signSTXTransfer({
 *   recipient: "ST2J6ZY7R94P80Z4CGFRHZ3Q16MF0NKHN3FK4R0N",
 *   amount: 1_000_000n, // 1 STX
 * })
 * ```
 */
export class TurnkeySigner {
  /**
   * Turnkey organization ID
   */
  public readonly organizationId: string

  /**
   * Default network for this signer
   */
  public readonly network: StacksNetworkType

  private readonly client: TurnkeySignerClient
  private readonly compressedPublicKey: string

  /**
   * Creates a new TurnkeySigner instance
   *
   * @param config - Signer configuration
   * @throws Error if public key is invalid
   */
  constructor(config: TurnkeySignerConfig) {
    this.client = config.client
    this.organizationId = config.organizationId
    this.network = config.network ?? "testnet"

    // Validate and normalize the public key
    this.compressedPublicKey = validateCompressedPublicKey(config.publicKey)
  }

  /**
   * Returns the Stacks address for this signer
   *
   * @param network - Optional network override (defaults to signer's configured network)
   * @returns Stacks address (ST... for testnet, SP... for mainnet)
   */
  getAddress(network?: StacksNetworkType): string {
    return publicKeyToAddress(this.compressedPublicKey, network ?? this.network)
  }

  /**
   * Returns the compressed public key used by this signer
   */
  getPublicKey(): string {
    return this.compressedPublicKey
  }

  /**
   * Signs an STX token transfer transaction
   *
   * This method builds an unsigned STX transfer, generates the signing hash,
   * signs it with Turnkey, and returns the signed transaction.
   *
   * @param params - Transfer parameters
   * @returns Signed transaction result
   * @throws Error if recipient address is invalid or amount is <= 0
   *
   * @example
   * ```typescript
   * const { transaction, senderAddress, nonce, fee } = await signer.signSTXTransfer({
   *   recipient: "ST2J6ZY7R94P80Z4CGFRHZ3Q16MF0NKHN3FK4R0N",
   *   amount: 1_000_000n, // 1 STX
   *   memo: "Payment for services",
   * })
   * ```
   */
  async signSTXTransfer(params: STXTransferParams): Promise<SignedTransactionResult> {
    const { recipient, amount, fee, memo } = params
    const network = params.network ?? this.network

    // Validate recipient address
    if (!validateStacksAddress(recipient)) {
      throw new Error(`Invalid recipient Stacks address: ${recipient}`)
    }

    if (amount <= 0n) {
      throw new Error("Amount must be greater than 0")
    }

    // Derive sender address
    const senderAddress = this.getAddress(network)

    // Fetch nonce if not provided
    const nonce = params.nonce ?? (await this.fetchNonce(senderAddress, network))
    
    const txFee = fee ?? DEFAULT_FEE

    // Build unsigned transaction
    const transaction = await makeUnsignedSTXTokenTransfer({
      recipient,
      amount,
      publicKey: this.compressedPublicKey,
      nonce,
      fee: txFee,
      network,
      memo,
    })

    // Generate pre-sign hash
    const signer = new TransactionSigner(transaction)
    const preSignHash = sigHashPreSign(
      signer.sigHash,
      transaction.auth.authType,
      transaction.auth.spendingCondition.fee,
      transaction.auth.spendingCondition.nonce
    )

    // Sign with Turnkey
    const signature = await this.signHash(preSignHash)

    // Normalize and format signature
    const v = normalizeRecoveryByte(signature.v)
    const r = signature.r.padStart(64, "0")
    const s = signature.s.padStart(64, "0")

    // Construct VRS signature (65 bytes = 130 hex chars)
    const vrs = `${v}${r}${s}`

    if (vrs.length !== 130) {
      throw new Error(
        `Invalid signature length: expected 130 hex chars (65 bytes), got ${vrs.length}`
      )
    }

    // Attach signature to transaction
    const spendingCondition = transaction.auth
      .spendingCondition as SingleSigSpendingCondition
    spendingCondition.signature = createMessageSignature(vrs)

    return {
      transaction,
      senderAddress,
      nonce,
      fee: txFee,
    }
  }

  /**
   * Fetches the next available nonce for an address
   * @internal
   */
  private async fetchNonce(address: string, network: StacksNetworkType): Promise<bigint> {
    const baseUrl = API_ENDPOINTS[network]
    const url = `${baseUrl}/extended/v1/address/${address}/nonces`
    const res = await fetch(url)

    if (!res.ok) {
      throw new Error(`Failed to fetch nonce: ${res.status} ${res.statusText}`)
    }

    const data = (await res.json()) as { possible_next_nonce?: number }
    return BigInt(data.possible_next_nonce ?? 0)
  }

  /**
   * Signs a hash using Turnkey's signing API
   *
   * Uses HASH_FUNCTION_NO_OP because Stacks' sigHashPreSign already
   * produces the final hash. Turnkey must not re-hash it.
   *
   * @internal
   */
  private async signHash(hash: string): Promise<{ v: string; r: string; s: string }> {
    const { v, r, s } = await this.client.signRawPayload({
      signWith: this.compressedPublicKey,
      payload: `0x${hash}`,
      encoding: "PAYLOAD_ENCODING_HEXADECIMAL",
      hashFunction: "HASH_FUNCTION_NO_OP",
    })

    return { v, r, s }
  }
}

/**
 * Derives a Stacks address from a compressed public key
 *
 * Standalone function for cases where you need address derivation
 * without creating a full signer instance.
 *
 * @param publicKey - Compressed secp256k1 public key (66 hex chars, starts with 02 or 03)
 * @param network - Network type (defaults to 'testnet')
 * @returns Stacks address (ST... for testnet, SP... for mainnet)
 * @throws Error if public key is invalid
 *
 * @example
 * ```typescript
 * import { getAddressFromPublicKey } from "@turnkey/stacks"
 *
 * const address = getAddressFromPublicKey(
 *   "025afa6566651f6c49d84a482a1af918b25ba7caac0b06d9ab8d79a45b72715aeb",
 *   "testnet"
 * )
 * // Returns: "ST2J6ZY..."
 * ```
 */
export function getAddressFromPublicKey(
  publicKey: string,
  network: StacksNetworkType = "testnet"
): string {
  const cleaned = validateCompressedPublicKey(publicKey)
  return publicKeyToAddress(cleaned, network)
}

/**
 * Broadcasts a signed transaction to the Stacks network
 *
 * @param transaction - Signed Stacks transaction
 * @param network - Network to broadcast to (defaults to 'testnet')
 * @returns Transaction ID (txid)
 * @throws Error if broadcast fails
 *
 * @example
 * ```typescript
 * import { broadcastTransaction } from "@turnkey/stacks"
 *
 * const txid = await broadcastTransaction(signedTransaction, "testnet")
 * console.log(`https://explorer.hiro.so/txid/${txid}?chain=testnet`)
 * ```
 */
export async function broadcastTransaction(
  transaction: StacksTransactionWire,
  network: StacksNetworkType = "testnet"
): Promise<string> {
  const result = await stacksBroadcastTransaction({
    transaction,
    network,
  })

  // Handle different response formats
  if (typeof result === "string") {
    return result
  }

  if (result && typeof result === "object" && "txid" in result) {
    return (result as { txid: string }).txid
  }

  throw new Error(`Broadcast failed: ${JSON.stringify(result)}`)
}

/**
 * Signs and broadcasts an STX transfer in one call
 *
 * Convenience function that combines signing and broadcasting.
 *
 * @param signer - TurnkeySigner instance
 * @param params - Transfer parameters
 * @returns Broadcast result with transaction ID
 *
 * @example
 * ```typescript
 * import { TurnkeySigner, signAndBroadcastSTXTransfer } from "@turnkey/stacks"
 *
 * const signer = new TurnkeySigner({ ... })
 * const result = await signAndBroadcastSTXTransfer(signer, {
 *   recipient: "ST2J6ZY...",
 *   amount: 1_000_000n,
 * })
 * console.log(`TX ID: ${result.txid}`)
 * ```
 */
export async function signAndBroadcastSTXTransfer(
  signer: TurnkeySigner,
  params: STXTransferParams
): Promise<BroadcastResult> {
  const { transaction, senderAddress } = await signer.signSTXTransfer(params)
  const txid = await broadcastTransaction(transaction, params.network ?? signer.network)

  return {
    txid,
    senderAddress,
    recipient: params.recipient,
    amount: params.amount,
  }
}
