/**
 * Deploy the MIP-18 set (deployments/generated-matrix.json: LSUN18 … LLIAR18) and run each
 * row's steps in order — ONE circuit call per transaction, so every declaration is its own
 * intent and its own package (UC-1).
 *
 *   # the 00024 local chain (spec 00024 §6.1) — every endpoint explicit:
 *   MN_NETWORK_ID=undeployed MN_INDEXER_URL=… MN_INDEXER_WS_URL=… MN_NODE_URL=… \
 *   MN_NODE_WS_URL=… MN_PROOF_SERVER_URL=… MN_MNEMONIC_FILE=<mode-600 mnemonic> \
 *   MN_EMITTER_SECRET_FILE=<mode-600 hex secret> MN_PRIVATE_STATE_DIR=<dir> \
 *   MN_DEPLOYMENT_FILE=out/local-deployment.json \
 *     npx tsx scripts/deploy-and-publish.ts [LSUN18 SNEB18 …]
 *
 *   # Stagenet (MN_NETWORK_ID unset): MN_SEED=<hex> and the Stagenet URL defaults.
 *
 * With no arguments every non-optional row of the matrix is run, in file order. `ROWS` works
 * as an alternative to arguments (comma-separated). Rows are named by id (`LSUN18`).
 *
 * The emitter secret (spec 00024 Q12): every generated contract's constructor takes
 * `emitterSecretHashOf(secret)`, and every emitting circuit proves knowledge of the secret
 * through the `emitterSecret` witness, answered from the contract's private state
 * (`{ emitterSecret }`, stored by midnight-js in the LevelDB under `MN_PRIVATE_STATE_DIR`).
 * The secret is read from `MN_EMITTER_SECRET_FILE` and is never logged; it reaches only the
 * proof server as a private input — use one you run.
 *
 * Resumable per row AND per step: the deployment record (`MN_DEPLOYMENT_FILE`, default
 * `out/deployment.json`) holds the contract address and every completed step, and a re-run
 * skips them. A step that fails stops that row and the script moves on to the next one, so one
 * bad row cannot take the whole matrix down.
 *
 * It starts nothing. The proof server is managed by whoever runs this.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { CompactTypeBytes, CompactTypeVector, persistentCommit } from '@midnight-ntwrk/compact-runtime';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { MidnightWalletProvider, initializeMidnightProviders, syncWallet } from '@midnight-ntwrk/testkit-js';
import { MidnightBech32m, UnshieldedAddress } from '@midnightntwrk/wallet-sdk-address-format';
import {
  artifactSha256,
  createWalletLogger,
  emitterSecret,
  emitterSecretHashOf,
  emitterWitnesses,
  enterPrivateStateDirectory,
  hexOf,
  managedDirectory,
  networkProfile,
  pad,
  REPOSITORY_ROOT,
  walletSeed,
} from './profile.js';

const MATRIX = path.join(REPOSITORY_ROOT, 'deployments', 'generated-matrix.json');
const OUT_DIR = path.join(REPOSITORY_ROOT, 'out');
/** One record per chain: MN_DEPLOYMENT_FILE (e.g. out/local-deployment.json; not committed). */
const OUT_FILE = path.resolve(process.env.MN_DEPLOYMENT_FILE?.trim() || path.join(OUT_DIR, 'deployment.json'));

const log = (event: string, fields: Record<string, unknown> = {}): void =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));

// ---------------------------------------------------------------------------
// the plan
// ---------------------------------------------------------------------------

interface EmitStep {
  kind: 'emit';
  circuit: string;
  /** A collection's per-piece circuit: its selector (spec 00024 Q20). */
  args?: number[];
  sourceOps: string[];
  /** UC-1: the step's one package — its parts and exact bytes. */
  parts: number;
  payload: string;
  events: { piece: string | null; domainSep: string; kind: number; key: string; len: number; parts: number; value: string; payload: string; text: string | null }[];
}
interface MintStep {
  kind: 'mint';
  circuit: string;
  mintKind: 'shielded' | 'unshielded';
  piece: string | null;
  domain: string;
  domainSepHex: string;
  to: string;
  amount: string;
  nonce: string | null;
}
interface LedgerStep {
  kind: 'ledger';
  circuit: string;
  op: string;
  to: string;
  amount: string;
}
type PlannedStep = EmitStep | MintStep | LedgerStep;

interface MatrixRow {
  id: string;
  contract: string;
  template: string;
  name: string;
  symbol: string;
  decimals: number;
  kind: number;
  optional: boolean;
  domain: string | null;
  domainSepHex: string | null;
  pieces: { piece: string; domain: string; domainSepHex: string }[] | null;
  steps: PlannedStep[];
}

const matrix = JSON.parse(readFileSync(MATRIX, 'utf8')) as { rows: MatrixRow[] };

const requested = (process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : (process.env.ROWS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
).map((s) => s.toUpperCase());

const rows = requested.length > 0
  ? requested.map((id) => {
      const row = matrix.rows.find((r) => r.id === id);
      if (!row) throw new Error(`unknown row "${id}"`);
      return row;
    })
  : matrix.rows.filter((r) => !r.optional);

// ---------------------------------------------------------------------------
// the record
// ---------------------------------------------------------------------------

interface StepRecord {
  index: number;
  circuit: string;
  /** Emit steps: the declared key, the package's part count and its SHA-256 (from the matrix). */
  key?: string;
  parts?: number;
  payloadSha256?: string;
  txId?: string;
  txHash?: string;
  blockHeight?: number;
  status?: string;
  at: string;
  error?: string;
}
interface RowRecord {
  id: string;
  contract: string;
  artifactSha256?: string;
  /** The constructor argument: the emitter-secret hash (public). */
  emitterSecretHash?: string;
  address?: string;
  deploy?: { txId: string; txHash: string; blockHeight: number; at: string };
  tokenColor?: string | Record<string, string>;
  steps: StepRecord[];
}
interface Deployment {
  schemaVersion: 1;
  network: { name: string; networkId: string; node: string; indexer: string };
  rows: Record<string, RowRecord>;
}

mkdirSync(path.dirname(OUT_FILE), { recursive: true });
const profile = networkProfile();

const deployment: Deployment = existsSync(OUT_FILE)
  ? (JSON.parse(readFileSync(OUT_FILE, 'utf8')) as Deployment)
  : {
      schemaVersion: 1,
      network: { name: profile.networkId, networkId: profile.networkId, node: profile.node, indexer: profile.indexer },
      rows: {},
    };
if (deployment.network.networkId !== profile.networkId) {
  throw new Error(`${OUT_FILE} records network ${deployment.network.networkId}, not ${profile.networkId}`);
}

const save = (): void => {
  const temporary = `${OUT_FILE}.tmp.${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(deployment, null, 2)}\n`, 'utf8');
  renameSync(temporary, OUT_FILE);
};

// ---------------------------------------------------------------------------
// recipients
// ---------------------------------------------------------------------------

/**
 * Mint recipients. Every mint goes to the deployer unless the matrix asked for a distinct
 * holder (UMET's three addresses, §7.1 row 8), in which case the address is derived
 * deterministically from the label. Those coins are unspendable by design: the point of the
 * row is three distinct recipients in the mint effects, which is what the indexer counts.
 */
const derivedAddress = (label: string): Uint8Array =>
  new Uint8Array(createHash('sha256').update(`umbra:00020:recipient:${label}`).digest());

const BYTES32 = new CompactTypeBytes(32);
const VECTOR2 = new CompactTypeVector(2, BYTES32);
const DERIVE_TOKEN = pad(32, 'midnight:derive_token');

/** Spec 00020 section 6.4 / `standard-library.compact:121` — the token colour. */
const deriveColor = (domainSep: Uint8Array, addressHex: string): Uint8Array =>
  persistentCommit(VECTOR2, [domainSep, new Uint8Array(Buffer.from(addressHex.replace(/^0x/i, ''), 'hex'))], DERIVE_TOKEN);

async function main(): Promise<void> {
  setNetworkId(profile.networkId);
  const seed = await walletSeed();
  const secret = emitterSecret();
  const secretHash = emitterSecretHashOf(secret);
  const privateStateDirectory = enterPrivateStateDirectory();

  const { NetworkId } = await import('@midnightntwrk/wallet-sdk');
  const environment = {
    ...profile,
    walletNetworkId: profile.networkId === 'undeployed' ? NetworkId.NetworkId.Undeployed : NetworkId.NetworkId.StageNet,
  };

  log('wallet.start', {
    network: profile.networkId,
    indexer: profile.indexer,
    proofServer: profile.proofServer,
    emitterSecretHash: hexOf(secretHash),
    privateStateDirectory,
  });
  const walletProvider = await MidnightWalletProvider.build(createWalletLogger(), environment as never, seed);
  await walletProvider.start(false);
  try {
    const state = await syncWallet(walletProvider.wallet as never, 2_000, 600_000);
    const dust = (state as { dust: { balance(at: Date): bigint } }).dust.balance(new Date());
    const night = (state as { unshielded: { balances: Record<string, bigint> } }).unshielded.balances;
    log('wallet.synced', {
      dust: dust.toString(),
      night: Object.fromEntries(Object.entries(night).map(([k, v]) => [k, String(v)])),
    });
    if (dust <= 0n) {
      throw new Error('the deployment wallet has no DUST — run scripts/register-dust.ts with MODE=register first');
    }

    const coinPublicKey = walletProvider.getCoinPublicKey();
    const unshieldedAddressString = walletProvider.unshieldedKeystore.getBech32Address().asString();
    const ownUserAddress = new Uint8Array(
      MidnightBech32m.parse(unshieldedAddressString).decode(UnshieldedAddress, profile.networkId).data,
    );
    log('wallet.keys', { coinPublicKey, unshieldedAddress: unshieldedAddressString });

    // A SHIELDED mint always goes to the deployer. A Zswap output is encrypted to its
    // recipient, so midnight-js has to know that recipient's ENCRYPTION public key —
    // `Unable to resolve encryption public key for recipient <hex>. Provide a mapping via
    // the encryptionPublicKeyResolver.` is what a made-up 32-byte coin public key gets you
    // (measured against Stagenet on 2026-09-17 with row SSTAR). Only the unshielded mints
    // below can address arbitrary bytes, and `UMET`'s three recipients are unshielded.
    const zswapRecipient = (_label: string) => ({
      is_left: true,
      left: { bytes: new Uint8Array(Buffer.from(coinPublicKey, 'hex')) },
      right: { bytes: new Uint8Array(32) },
    });
    const userRecipient = (label: string) => ({
      is_left: false,
      left: { bytes: new Uint8Array(32) },
      right: { bytes: label === 'owner' ? ownUserAddress : derivedAddress(label) },
    });

    for (const row of rows) {
      const record: RowRecord = deployment.rows[row.id] ?? { id: row.id, contract: row.contract, steps: [] };
      deployment.rows[row.id] = record;
      record.artifactSha256 = await artifactSha256(row.contract);
      if (record.emitterSecretHash && record.emitterSecretHash !== hexOf(secretHash)) {
        throw new Error(`${row.id} was deployed with another emitter secret; use its secret or a new record`);
      }
      record.emitterSecretHash = hexOf(secretHash);

      const contractModule = (await import(
        `../contracts/managed/${row.contract}/contract/index.js`
      )) as { Contract: never };
      const compiled = CompiledContract.make(row.id, contractModule.Contract).pipe(
        CompiledContract.withWitnesses(emitterWitnesses as never),
        CompiledContract.withCompiledFileAssets(managedDirectory(row.contract)),
      );
      const providers = initializeMidnightProviders(walletProvider, environment as never, {
        privateStateStoreName: `umbra-00024-${row.id.toLowerCase()}`,
        zkConfigPath: managedDirectory(row.contract),
      });
      /** The private state every emitting circuit's witness reads. */
      const privateState = { privateStateId: row.id, initialPrivateState: { emitterSecret: secret } };

      let contract: { callTx: Record<string, (...args: unknown[]) => Promise<{ public: { txId: string; txHash: string; blockHeight: number; status: string } }>> };
      try {
        if (record.address) {
          log('row.found', { row: row.id, address: record.address });
          contract = (await findDeployedContract(providers as never, {
            compiledContract: compiled,
            contractAddress: record.address,
            ...privateState,
          } as never)) as never;
        } else {
          log('row.deploy', { row: row.id, contract: row.contract });
          const started = Date.now();
          const deployed = (await deployContract(providers as never, {
            compiledContract: compiled,
            args: [secretHash],
            ...privateState,
          } as never)) as never as {
            deployTxData: { public: { contractAddress: string; txId: string; txHash: string; blockHeight: number } };
            callTx: Record<string, (...args: unknown[]) => Promise<{ public: { txId: string; txHash: string; blockHeight: number; status: string } }>>;
          };
          const publicData = deployed.deployTxData.public;
          record.address = publicData.contractAddress;
          record.deploy = {
            txId: publicData.txId,
            txHash: publicData.txHash,
            blockHeight: Number(publicData.blockHeight),
            at: new Date().toISOString(),
          };
          save();
          log('row.deployed', {
            row: row.id,
            address: publicData.contractAddress,
            txHash: publicData.txHash,
            blockHeight: Number(publicData.blockHeight),
            ms: Date.now() - started,
          });
          contract = deployed;
        }
      } catch (error) {
        log('row.deploy.failed', { row: row.id, error: String(error instanceof Error ? error.message : error) });
        save();
        continue;
      }

      let rowFailed = false;
      for (const [index, step] of row.steps.entries()) {
        if (record.steps.some((s) => s.index === index && s.txHash)) continue;
        if (rowFailed) break;

        let args: unknown[] = [];
        if (step.kind === 'emit') {
          args = (step.args ?? []).map((n) => BigInt(n));
        } else if (step.kind === 'mint') {
          const nonce = step.nonce ? pad(32, step.nonce) : pad(32, `${row.id}:${index}`);
          if (row.template === 'ShieldedCollection') {
            args = [pad(32, step.domain), zswapRecipient(step.to), nonce];
          } else if (step.mintKind === 'shielded') {
            args = [zswapRecipient(step.to), BigInt(step.amount), nonce];
          } else {
            args = [userRecipient(step.to), BigInt(step.amount)];
          }
        } else if (step.kind === 'ledger') {
          args =
            step.circuit === 'ledgerMint'
              ? [step.to === 'owner' ? ownUserAddress : derivedAddress(step.to), BigInt(step.amount)]
              : [ownUserAddress, derivedAddress(step.to), BigInt(step.amount)];
        }

        const started = Date.now();
        try {
          log('step.call', { row: row.id, index, circuit: step.circuit });
          const result = await contract.callTx[step.circuit]!(...args);
          const publicData = result.public;
          record.steps = record.steps.filter((s) => s.index !== index);
          record.steps.push({
            index,
            circuit: step.circuit,
            ...(step.kind === 'emit'
              ? {
                  key: step.events[0]!.key,
                  parts: step.parts,
                  payloadSha256: createHash('sha256').update(Buffer.from(step.payload, 'hex')).digest('hex'),
                }
              : {}),
            txId: publicData.txId,
            txHash: publicData.txHash,
            blockHeight: Number(publicData.blockHeight),
            status: String(publicData.status),
            at: new Date().toISOString(),
          });
          save();
          log('step.done', {
            row: row.id,
            index,
            circuit: step.circuit,
            txHash: publicData.txHash,
            blockHeight: Number(publicData.blockHeight),
            ms: Date.now() - started,
          });
        } catch (error) {
          const message = String(error instanceof Error ? (error.stack ?? error.message) : error);
          record.steps = record.steps.filter((s) => s.index !== index);
          record.steps.push({ index, circuit: step.circuit, at: new Date().toISOString(), error: message });
          save();
          log('step.failed', { row: row.id, index, circuit: step.circuit, error: message.split('\n')[0] });
          rowFailed = true;
        }
      }

      // The colour is derived off chain with the protocol's own formula,
      // `persistentCommit([domainSep, address], pad(32, "midnight:derive_token"))`. Calling
      // the contract's `tokenColor()` circuit would mean one more PROVEN TRANSACTION per
      // token (five for a collection) to learn a value that is a pure function of two
      // things already recorded — and the mint effects on chain carry the real colour, so
      // scripts/export-fixtures.ts checks the derivation against what was actually minted.
      // `VERIFY_COLOR_ONCHAIN=1` calls the circuit anyway, once per row.
      if (row.pieces) {
        const colours: Record<string, string> = {};
        for (const piece of row.pieces) {
          colours[piece.piece] = hexOf(deriveColor(pad(32, piece.domain), record.address!));
        }
        record.tokenColor = colours;
      } else if (row.domain) {
        record.tokenColor = hexOf(deriveColor(pad(32, row.domain), record.address!));
      }
      save();
      log('row.color', { row: row.id, tokenColor: record.tokenColor, derivedOffChain: true });

      if (process.env.VERIFY_COLOR_ONCHAIN === '1' && !rowFailed) {
        try {
          const result = (await contract.callTx.tokenColor!(
            ...(row.pieces ? [pad(32, row.pieces[0]!.domain)] : []),
          )) as never as { public: { result: Uint8Array } };
          const onChain = hexOf(result.public.result);
          const expected = row.pieces
            ? (record.tokenColor as Record<string, string>)[row.pieces[0]!.piece]
            : (record.tokenColor as string);
          log('row.color.onchain', { row: row.id, onChain, expected, equal: onChain === expected });
        } catch (error) {
          log('row.color.onchain.failed', { row: row.id, error: String(error instanceof Error ? error.message : error) });
        }
      }

      log('row.done', { row: row.id, address: record.address, steps: record.steps.length, failed: rowFailed });
    }
  } finally {
    await walletProvider.stop().catch(() => undefined);
    save();
  }

  log('summary', {
    rows: Object.values(deployment.rows).map((r) => ({
      id: r.id,
      address: r.address,
      steps: r.steps.filter((s) => s.txHash).length,
      failed: r.steps.filter((s) => s.error).length,
    })),
  });
}

main().catch((error) => {
  console.error('[deploy] failed:', error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
