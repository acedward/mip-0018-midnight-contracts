/**
 * Network profile and shared helpers for the on-chain scripts.
 *
 * Modelled on shielded-night v2's `contracts/v2/scripts/profile.ts`, which is the tooling
 * that already deploys to Stagenet with this pin set (compact-js 2.5.5-rc.8,
 * compact-runtime 0.19.0, midnight-js 5.0.0-beta.7, wallet-sdk 2.0.0-beta.2); ledger-v9 is
 * 1.0.0-rc.5 since spec 00024 (one copy, pinned in `dependencies` and `overrides`).
 *
 * The network comes from the `MN_*` variables (spec 00024 FR-018): `MN_NETWORK_ID` unset or
 * `stagenet` is the Stagenet profile (with its URL defaults); `MN_NETWORK_ID=undeployed` is a
 * local dev chain (the 00024 local stack), for which EVERY endpoint must be given — that
 * profile can never fall back to a Stagenet URL. Only the Stagenet profile is supported: the reference set is deployed to
 * a public test network on purpose, so an indexer that anyone can query serves the events.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import pino from 'pino';

export const COMPATIBILITY = {
  compiler: '0.34.0',
  language: '0.26.0',
  compactJs: '2.5.5-rc.8',
  compactRuntime: '0.19.0',
  midnightJs: '5.0.0-beta.7',
  ledger: '1.0.0-rc.5',
  onchainRuntime: '4.0.0-rc.3',
  walletSdk: '2.0.0-beta.2',
} as const;

export const REPOSITORY_ROOT = path.resolve(new URL(import.meta.url).pathname, '..', '..');
export const MANAGED_ROOT = path.join(REPOSITORY_ROOT, 'contracts', 'managed');

const envUrl = (name: string, fallback: string): string => process.env[name]?.trim() || fallback;

export const stagenet = () => ({
  walletNetworkId: 'stagenet' as const,
  networkId: 'stagenet',
  indexer: envUrl('MN_INDEXER_URL', 'https://indexer.stagenet.shielded.tools/api/v4/graphql'),
  indexerWS: envUrl('MN_INDEXER_WS_URL', 'wss://indexer.stagenet.shielded.tools/api/v4/graphql/ws'),
  node: envUrl('MN_NODE_URL', 'https://rpc.stagenet.shielded.tools'),
  nodeWS: envUrl('MN_NODE_WS_URL', 'wss://rpc.stagenet.shielded.tools'),
  proofServer: envUrl('MN_PROOF_SERVER_URL', 'http://127.0.0.1:6300'),
});

const requiredUrl = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when MN_NETWORK_ID=undeployed`);
  return value;
};

/** The network profile the `MN_*` variables select: Stagenet (default) or a local dev chain. */
export const networkProfile = () => {
  const id = process.env.MN_NETWORK_ID?.trim() || 'stagenet';
  if (id === 'stagenet') return stagenet();
  if (id !== 'undeployed') throw new Error(`MN_NETWORK_ID=${id} is not supported (stagenet | undeployed)`);
  return {
    walletNetworkId: 'undeployed' as const,
    networkId: 'undeployed',
    indexer: requiredUrl('MN_INDEXER_URL'),
    indexerWS: requiredUrl('MN_INDEXER_WS_URL'),
    node: requiredUrl('MN_NODE_URL'),
    nodeWS: requiredUrl('MN_NODE_WS_URL'),
    proofServer: requiredUrl('MN_PROOF_SERVER_URL'),
  };
};

/** Reads a secret file, refusing one that group or others can read (mode 600 or stricter). */
export const readSecretFile = (name: string, file: string): string => {
  const mode = statSync(file).mode & 0o777;
  if ((mode & 0o077) !== 0) throw new Error(`${name}: ${file} must be mode 600 or stricter`);
  return readFileSync(file, 'utf8').trim();
};

/**
 * The deployment wallet's seed: `MN_SEED` (hex), or `MN_MNEMONIC_FILE` — a BIP-39 mnemonic in a
 * mode-600 file (the local stack's funded test wallet). testkit-js's `WalletSeeds.fromMnemonic`
 * is `fromMasterSeed(hex(BIP-39 seed))`, so the seed is that hex. It stays in this process:
 * never printed, never on a command line.
 */
export const walletSeed = async (): Promise<string> => {
  const hex = process.env.MN_SEED?.trim();
  if (hex) {
    if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) throw new Error('MN_SEED must be an even-length hexadecimal string');
    return hex;
  }
  const file = process.env.MN_MNEMONIC_FILE?.trim();
  if (!file) throw new Error('set MN_SEED (hex) or MN_MNEMONIC_FILE (a mode-600 BIP-39 mnemonic file)');
  const { mnemonicToSeedSync, validateMnemonic } = await import('@scure/bip39');
  const { wordlist } = await import('@scure/bip39/wordlists/english.js');
  const phrase = readSecretFile('MN_MNEMONIC_FILE', file).split(/\s+/u).join(' ').toLowerCase();
  if (!validateMnemonic(phrase, wordlist)) throw new Error(`MN_MNEMONIC_FILE: ${file} is not a valid BIP-39 mnemonic`);
  return Buffer.from(mnemonicToSeedSync(phrase)).toString('hex');
};

/** The emitter-secret commitment's domain tag (contracts/TokenMetadata.compact). */
export const EMITTER_DOMAIN = 'mip-0018:emitter:';

/**
 * `TM_emitterSecretHashOf(secret)`: `persistentHash<Vector<2, Bytes<32>>>([pad(32,
 * "mip-0018:emitter:"), secret])`, i.e. SHA-256 over the 64 concatenated bytes. It is every
 * generated contract's constructor argument; the secret itself never leaves this process
 * except as a private proof input to the proof server (run your own).
 */
export const emitterSecretHashOf = (secret: Uint8Array): Uint8Array => {
  if (secret.length !== 32) throw new Error('the emitter secret is 32 bytes');
  return new Uint8Array(createHash('sha256').update(pad(32, EMITTER_DOMAIN)).update(secret).digest());
};

/**
 * `METADATA_EMISSOR_SECRET` (spec 00024 Q12): 32 bytes as 64 hex characters in the mode-600
 * file `MN_EMITTER_SECRET_FILE`.
 */
export const emitterSecret = (): Uint8Array => {
  const file = process.env.MN_EMITTER_SECRET_FILE?.trim();
  if (!file) throw new Error('MN_EMITTER_SECRET_FILE is required (a mode-600 file holding 32 bytes as hex)');
  const text = readSecretFile('MN_EMITTER_SECRET_FILE', file).replace(/^0x/i, '');
  if (!/^[0-9a-f]{64}$/i.test(text)) throw new Error('MN_EMITTER_SECRET_FILE must hold exactly 32 bytes as 64 hex characters');
  return new Uint8Array(Buffer.from(text, 'hex'));
};

/** Private state that answers every generated contract's `emitterSecret` witness. */
export interface EmitterPrivateState {
  readonly emitterSecret: Uint8Array;
}

/** The witness of `TM_assertEmitter()`, for `CompiledContract.withWitnesses`. */
export const emitterWitnesses = {
  emitterSecret: ({ privateState }: { privateState: EmitterPrivateState }): [EmitterPrivateState, Uint8Array] => [
    privateState,
    privateState.emitterSecret,
  ],
};

/**
 * Where the private-state LevelDB lives. midnight-js opens it as `midnight-level-db` in the
 * working directory, and it holds the emitter secret and the contracts' maintenance signing
 * keys, so `MN_PRIVATE_STATE_DIR` moves the process into a directory of the operator's
 * choosing (the local stack uses its mode-700 `secrets/`). Unset keeps the working directory.
 */
export const enterPrivateStateDirectory = (): string => {
  const directory = process.env.MN_PRIVATE_STATE_DIR?.trim();
  if (directory) process.chdir(directory);
  return process.cwd();
};

/**
 * testkit-js interpolates the wallet seed into an info-level message while building a
 * wallet. Keep every level silent: field redaction cannot remove an already-formatted
 * secret, and this repository's wallet key is written into a planning document.
 */
export const createWalletLogger = (): pino.Logger => pino({ level: 'silent' });

export const managedDirectory = (contract: string): string => path.join(MANAGED_ROOT, contract);

const filesBelow = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const file = path.join(directory, name);
    return statSync(file).isDirectory() ? filesBelow(file) : [file];
  });

/** A stable digest of one contract's compiled artefacts, recorded with each deployment. */
export const artifactSha256 = async (contract: string): Promise<string> => {
  const { createHash } = await import('node:crypto');
  const directory = managedDirectory(contract);
  const hash = createHash('sha256');
  for (const file of filesBelow(directory).sort()) {
    // keys/ is a pure function of the ZKIR and is not committed; leave it out so the
    // digest is reproducible from a fresh checkout.
    if (path.relative(directory, file).startsWith('keys')) continue;
    hash.update(path.relative(directory, file));
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
};

export const hexOf = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

export const bytesOfHex = (hex: string): Uint8Array =>
  new Uint8Array(Buffer.from(hex.replace(/^0x/i, ''), 'hex'));

/** `pad(32, text)` as the Compact compiler produces it: UTF-8, NUL-padded on the right. */
export const pad = (size: number, text: string): Uint8Array => {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length > size) throw new Error(`"${text}" does not fit in ${size} bytes`);
  const out = new Uint8Array(size);
  out.set(bytes);
  return out;
};
