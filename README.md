# @turnkey/stacks

[![npm version](https://img.shields.io/npm/v/@turnkey/stacks)](https://www.npmjs.com/package/@turnkey/stacks)
[![Apache-2.0](https://img.shields.io/npm/l/@turnkey/stacks)](./LICENSE)

Turnkey signer for Stacks blockchain transactions.

This package provides a class-based signer following the patterns established by `@turnkey/solana`, `@turnkey/ethers`, and `@turnkey/cosmjs`.

## Installation

```bash
npm install @turnkey/stacks @stacks/transactions
```

## Quick Start

```typescript
import { TurnkeySigner, broadcastTransaction } from "@turnkey/stacks"
import { Turnkey } from "@turnkey/sdk-server"

// Initialize Turnkey client
const turnkey = new Turnkey({
  apiBaseUrl: "https://api.turnkey.com",
  apiPrivateKey: process.env.TURNKEY_API_PRIVATE_KEY!,
  apiPublicKey: process.env.TURNKEY_API_PUBLIC_KEY!,
  defaultOrganizationId: process.env.TURNKEY_ORGANIZATION_ID!,
})

// Create Stacks signer
const signer = new TurnkeySigner({
  client: turnkey.apiClient(),
  organizationId: process.env.TURNKEY_ORGANIZATION_ID!,
  publicKey: "025afa6566651f6c49d84a482a1af918b25ba7caac0b06d9ab8d79a45b72715aeb",
  network: "testnet",
})

// Get address
const address = signer.getAddress()
console.log(`Address: ${address}`)

// Sign and broadcast transfer
const { transaction } = await signer.signSTXTransfer({
  recipient: "ST20J4GKB8W7KKA8B0KZ3J7G330DZ1WEWYXJKD4PV",
  amount: 1_000_000n, // 1 STX
})

const txid = await broadcastTransaction(transaction, "testnet")
console.log(`TX: https://explorer.hiro.so/txid/${txid}?chain=testnet`)
```

## API Reference

### `TurnkeySigner`

Class-based signer for Stacks transactions.

#### Constructor

```typescript
new TurnkeySigner(config: TurnkeySignerConfig)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `config.client` | `TurnkeySignerClient` | Turnkey client (use `turnkey.apiClient()` for SDK server) |
| `config.organizationId` | `string?` | Turnkey organization ID (required for server, omit for browser) |
| `config.publicKey` | `string` | Compressed secp256k1 public key (66 hex chars) |
| `config.network` | `'testnet' \| 'mainnet'` | Default network (optional, defaults to `'testnet'`) |

#### Methods

##### `getAddress(network?): string`

Returns the Stacks address for this signer.

```typescript
const address = signer.getAddress()           // Uses default network
const mainnetAddr = signer.getAddress("mainnet")  // Override network
```

##### `getPublicKey(): string`

Returns the compressed public key.

```typescript
const pubKey = signer.getPublicKey()
```

##### `signSTXTransfer(params): Promise<SignedTransactionResult>`

Signs an STX token transfer.

```typescript
const { transaction, senderAddress, nonce, fee } = await signer.signSTXTransfer({
  recipient: "ST20J4G...",
  amount: 1_000_000n,    // Required: amount in microSTX
  memo: "Payment",       // Optional: memo string
  nonce: 5n,             // Optional: fetched if not provided
  fee: 200n,             // Optional: defaults to 180n
  network: "testnet",    // Optional: overrides signer default
})
```

### Standalone Functions

#### `getAddressFromPublicKey(publicKey, network?): string`

Derives a Stacks address without creating a signer.

```typescript
import { getAddressFromPublicKey } from "@turnkey/stacks"

const address = getAddressFromPublicKey("025afa...", "testnet")
```

#### `broadcastTransaction(transaction, network?): Promise<string>`

Broadcasts a signed transaction.

```typescript
import { broadcastTransaction } from "@turnkey/stacks"

const txid = await broadcastTransaction(signedTx, "testnet")
```

#### `signAndBroadcastSTXTransfer(signer, params): Promise<BroadcastResult>`

Signs and broadcasts in one call.

```typescript
import { signAndBroadcastSTXTransfer } from "@turnkey/stacks"

const { txid, senderAddress, recipient, amount } = await signAndBroadcastSTXTransfer(
  signer,
  { recipient: "ST20J4G...", amount: 1_000_000n }
)
```

## Types

### `TurnkeySignerConfig`

```typescript
interface TurnkeySignerConfig {
  client: TurnkeySignerClient
  publicKey: string
  organizationId?: string  // required for server, omit for browser
  network?: "testnet" | "mainnet"
}
```

### `STXTransferParams`

```typescript
interface STXTransferParams {
  recipient: string
  amount: bigint
  nonce?: bigint
  fee?: bigint
  memo?: string
  network?: "testnet" | "mainnet"
}
```

### `SignedTransactionResult`

```typescript
interface SignedTransactionResult {
  transaction: StacksTransactionWire
  senderAddress: string
  nonce: bigint
  fee: bigint
}
```

### `BroadcastResult`

```typescript
interface BroadcastResult {
  txid: string
  senderAddress: string
  recipient: string
  amount: bigint
}
```

## Client Compatibility

The `TurnkeySigner` works with multiple Turnkey client types:

### With `@turnkey/sdk-server`

```typescript
import { Turnkey } from "@turnkey/sdk-server"

const turnkey = new Turnkey({ ... })
const signer = new TurnkeySigner({
  client: turnkey.apiClient(),  // Use apiClient()
  ...
})
```

### With `@turnkey/sdk-browser`

```typescript
import { TurnkeyBrowserClient } from "@turnkey/sdk-browser"

const client = new TurnkeyBrowserClient({ ... })
const signer = new TurnkeySigner({
  client: client,  // Use directly
  ...
})
```

### With `@turnkey/http` (Legacy)

```typescript
import { TurnkeyClient } from "@turnkey/http"

const client = new TurnkeyClient({ ... }, stamper)
const signer = new TurnkeySigner({
  client: client,  // Use directly
  ...
})
```

## Cryptographic Details

This package uses Turnkey's `signRawPayload` with `HASH_FUNCTION_NO_OP` because Stacks' `sigHashPreSign` already produces the final hash to be signed. Turnkey must sign the bytes directly without re-hashing.

Signature flow:
1. Build unsigned STX transfer with `makeUnsignedSTXTokenTransfer`
2. Generate pre-sign hash with `sigHashPreSign`
3. Sign with Turnkey using `HASH_FUNCTION_NO_OP`
4. Construct VRS signature (recovery byte + r + s = 65 bytes)
5. Attach signature to transaction spending condition

## License

Apache-2.0
