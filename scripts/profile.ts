/**
 * Network profile and shared helpers for the on-chain scripts.
 *
 * Modelled on shielded-night v2's `contracts/v2/scripts/profile.ts`, which is the tooling
 * that already deploys to Stagenet with this pin set (compact-js 2.5.5-rc.8,
 * compact-runtime 0.19.0, midnight-js 5.0.0-beta.7, wallet-sdk 2.0.0-beta.2); ledger-v9 is
 * 1.0.0-rc.5 since spec 00024 (one copy, pinned in `dependencies` and `overrides`). Only the Stagenet profile is supported: the reference set is deployed to
 * a public test network on purpose, so an indexer that anyone can query serves the events.
 */
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
