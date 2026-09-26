/**
 * A caller without the emitter secret cannot emit (spec 00024 Q12, FR-019b) — checked against
 * the contracts a deployment record names, on the chain they were deployed to.
 *
 *   MN_NETWORK_ID=undeployed MN_INDEXER_URL=… MN_INDEXER_WS_URL=… MN_NODE_URL=… \
 *   MN_NODE_WS_URL=… MN_PROOF_SERVER_URL=… MN_MNEMONIC_FILE=<mode-600 mnemonic> \
 *   MN_PRIVATE_STATE_DIR=<dir> MN_DEPLOYMENT_FILE=out/local-deployment.json \
 *     npx tsx scripts/stranger-check.ts [LSUN18 …]
 *
 * For every EMITTING circuit of every deployed row, the contract is found again with a fresh
 * random 32-byte secret as its private state (a "stranger" — whoever does not hold the
 * deployer's `METADATA_EMISSOR_SECRET`), and the circuit is called. Each call must fail with
 * `TokenMetadata: caller is not the emitter` — while executing, before any proof or
 * transaction exists — and the contract's latest action at the indexer must be the same before
 * and after. Exit 0 only if every call was refused that way; one JSON line per call.
 *
 * The wallet only pays; it is the deployer's own here, which makes the point sharper: holding
 * the funds and the maintenance key is not enough, the secret is.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { MidnightWalletProvider, initializeMidnightProviders, syncWallet } from '@midnight-ntwrk/testkit-js';
import {
  createWalletLogger,
  emitterWitnesses,
  enterPrivateStateDirectory,
  managedDirectory,
  networkProfile,
  REPOSITORY_ROOT,
  walletSeed,
} from './profile.js';

const MATRIX = path.join(REPOSITORY_ROOT, 'deployments', 'generated-matrix.json');
const RECORD = path.resolve(process.env.MN_DEPLOYMENT_FILE?.trim() || path.join(REPOSITORY_ROOT, 'out', 'deployment.json'));

const log = (event: string, fields: Record<string, unknown> = {}): void =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));

interface MatrixRow {
  id: string;
  contract: string;
  steps: { kind: string; circuit: string }[];
}
interface Deployment {
  network: { networkId: string };
  rows: Record<string, { id: string; contract: string; address?: string }>;
}

const matrix = JSON.parse(readFileSync(MATRIX, 'utf8')) as { rows: MatrixRow[] };
const deployment = JSON.parse(readFileSync(RECORD, 'utf8')) as Deployment;
const profile = networkProfile();
if (deployment.network.networkId !== profile.networkId) {
  throw new Error(`${RECORD} records network ${deployment.network.networkId}, not ${profile.networkId}`);
}

const requested = process.argv.slice(2).map((s) => s.toUpperCase());
const rows = matrix.rows.filter(
  (row) => deployment.rows[row.id]?.address && (requested.length === 0 || requested.includes(row.id)),
);
if (rows.length === 0) throw new Error(`no deployed row to check in ${RECORD}`);

/** The contract's latest action as the indexer reports it (a transaction hash). */
async function latestAction(address: string): Promise<string | null> {
  const response = await fetch(profile.indexer, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: 'query ($a: HexEncoded!) { contractAction(address: $a) { __typename transaction { hash } } }',
      variables: { a: address },
    }),
  });
  const body = (await response.json()) as { data?: { contractAction?: { transaction?: { hash: string } } | null }; errors?: unknown };
  if (body.errors) throw new Error(`indexer error for ${address}: ${JSON.stringify(body.errors)}`);
  return body.data?.contractAction?.transaction?.hash ?? null;
}

async function main(): Promise<void> {
  setNetworkId(profile.networkId);
  const seed = await walletSeed();
  enterPrivateStateDirectory();
  const { NetworkId } = await import('@midnightntwrk/wallet-sdk');
  const environment = {
    ...profile,
    walletNetworkId: profile.networkId === 'undeployed' ? NetworkId.NetworkId.Undeployed : NetworkId.NetworkId.StageNet,
  };
  const walletProvider = await MidnightWalletProvider.build(createWalletLogger(), environment as never, seed);
  await walletProvider.start(false);
  let failures = 0;
  let refused = 0;
  try {
    await syncWallet(walletProvider.wallet as never, 2_000, 600_000);
    for (const row of rows) {
      const address = deployment.rows[row.id]!.address!;
      const before = await latestAction(address);
      const contractModule = (await import(`../contracts/managed/${row.contract}/contract/index.js`)) as { Contract: never };
      const compiled = CompiledContract.make(row.id, contractModule.Contract).pipe(
        CompiledContract.withWitnesses(emitterWitnesses as never),
        CompiledContract.withCompiledFileAssets(managedDirectory(row.contract)),
      );
      const providers = initializeMidnightProviders(walletProvider, environment as never, {
        privateStateStoreName: `umbra-00024-stranger-${row.id.toLowerCase()}`,
        zkConfigPath: managedDirectory(row.contract),
      });
      // A fresh secret nobody deployed with: the stranger.
      const stranger = { emitterSecret: new Uint8Array(randomBytes(32)) };
      const contract = (await findDeployedContract(providers as never, {
        compiledContract: compiled,
        contractAddress: address,
        privateStateId: `stranger-${row.id}`,
        initialPrivateState: stranger,
      } as never)) as never as { callTx: Record<string, (...args: unknown[]) => Promise<{ public: { txHash: string } }>> };

      for (const step of row.steps.filter((s) => s.kind === 'emit')) {
        try {
          const result = await contract.callTx[step.circuit]!();
          failures += 1;
          log('stranger.EMITTED', { row: row.id, circuit: step.circuit, txHash: result.public.txHash });
        } catch (error) {
          const message = String(error instanceof Error ? error.message : error);
          if (/TokenMetadata: caller is not the emitter/.test(message)) {
            refused += 1;
            log('stranger.refused', { row: row.id, circuit: step.circuit, error: message.split('\n')[0] });
          } else {
            failures += 1;
            log('stranger.unexpected-error', { row: row.id, circuit: step.circuit, error: message.split('\n')[0] });
          }
        }
      }
      const after = await latestAction(address);
      if (after !== before) failures += 1;
      log('row.checked', { row: row.id, address, latestActionBefore: before, latestActionAfter: after, unchanged: after === before });
    }
  } finally {
    await walletProvider.stop().catch(() => undefined);
  }
  log('summary', { rows: rows.length, refused, failures });
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[stranger-check] failed:', error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
