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
 * A contract whose deploy does not fit one block (CNST18: 39 verifier keys) is deployed in
 * STAGES (spec 00024 Q20 (a); scripts/staged-deploy.ts): with the keys that fit, then one
 * maintenance-authority `VerifierKeyInsert` transaction per remaining key, before any of its
 * steps runs. Its maintenance key is kept in `MN_MAINTENANCE_KEY_DIR/<row>.maintenance-key.json`
 * (mode 600, in a mode-700 directory); the record's `staged` entry lists the deployed and the
 * inserted circuits with every insert transaction. Rows that fit are deployed as before.
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
import { CompactTypeBytes, CompactTypeVector, persistentCommit, signatureVerifyingKey, type SigningKey } from '@midnight-ntwrk/compact-runtime';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import {
  createUnprovenDeployTx,
  deployContract,
  findDeployedContract,
  submitInsertVerifierKeyTx,
  submitTx,
} from '@midnight-ntwrk/midnight-js-contracts';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { SucceedEntirely } from '@midnight-ntwrk/midnight-js-types';
import { ContractState as LedgerContractState, type NormalizedCost } from '@midnightntwrk/ledger-v9';
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
import {
  STAGED_DEPLOY_BLOCK_BUDGET,
  blockShare,
  chainLedgerParameters,
  loadOrCreateMaintenanceKey,
  planStagedDeploy,
  stagedDeployTx,
  stagingOrder,
  withinBudget,
} from './staged-deploy.js';

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
/** One maintenance transaction of a staged deploy: it inserts one circuit's verifier key. */
interface InsertRecord {
  circuit: string;
  verifierKeySha256: string;
  verifierKeyBytes: number;
  txId?: string;
  txHash?: string;
  blockHeight?: number;
  status?: string;
  /** The submitted (proven, balanced) transaction's share of a block, per dimension. */
  blockShare?: NormalizedCost;
  /** Already on chain with the same key when this run looked (a resumed run). */
  foundOnChain?: boolean;
  at?: string;
  error?: string;
}
/** Spec 00024 Q20 (a): how a contract too large for one deploy was deployed. */
interface StagedRecord {
  budget: number;
  /** The block whose ledger parameters the plan used. */
  ledgerParametersHeight: number;
  /** midnight-js's own deploy of the contract, with every key: it does not fit one block. */
  fullDeploy: { operations: number; bytesWritten: string; blockShare: NormalizedCost | null };
  /** The circuits deployed with the contract, in staging order, and that deploy's cost. */
  deployed: string[];
  deployCost: { bytesWritten: string; blockShare: NormalizedCost; submittedBlockShare?: NormalizedCost };
  /** The maintenance authority (public): its committee's verifying key; the key file's name. */
  maintenanceVerifyingKey: unknown;
  maintenanceKeyFile: string;
  inserts: InsertRecord[];
  /** Set when every provable circuit's key is on chain and equal to the compiled one. */
  complete?: boolean;
  /** The maintenance authority's counter after the inserts (one per maintenance update). */
  maintenanceCounter?: string;
}
interface RowRecord {
  id: string;
  contract: string;
  artifactSha256?: string;
  /** The constructor argument: the emitter-secret hash (public). */
  emitterSecretHash?: string;
  address?: string;
  deploy?: { txId: string; txHash: string; blockHeight: number; at: string };
  staged?: StagedRecord;
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

// ---------------------------------------------------------------------------
// staged deployment (spec 00024 Q20 (a); scripts/staged-deploy.ts)
// ---------------------------------------------------------------------------

type CallResult = { public: { txId: string; txHash: string; blockHeight: number; status: string } };
type CallableContract = { callTx: Record<string, (...args: unknown[]) => Promise<CallResult>> };
/** The part of midnight-js's unproven deploy data a staged deploy reads. */
type UnprovenDeploy = {
  public: { contractAddress: string; initialContractState: { serialize(): Uint8Array } };
  private: { unprovenTx: { guaranteedOffer?: never; fallibleOffer?: unknown } };
};
/** midnight-js `FinalizedTxData`, the fields recorded here. */
type FinalizedTx = { tx: unknown; status: unknown; txId: string; txHash: string; blockHeight: number };
/** The providers testkit-js builds, as far as a staged deploy uses them. */
type ContractProviders = {
  privateStateProvider: {
    setContractAddress(address: string): void;
    set(id: string, state: unknown): Promise<void>;
    setSigningKey(address: string, key: SigningKey): Promise<void>;
  };
  zkConfigProvider: {
    getVerifierKey(circuit: string): Promise<Uint8Array>;
    getVerifierKeys(circuits: string[]): Promise<[string, Uint8Array][]>;
  };
  publicDataProvider: {
    queryContractState(address: string): Promise<
      | { operation(circuit: string): { verifierKey: Uint8Array } | undefined; maintenanceAuthority: { counter: bigint } }
      | null
    >;
  };
};

const sha256Hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/**
 * An error with its `cause` chain on one line: the wallet SDK wraps the node's reason for a
 * refused transaction as the cause of "Transaction submission error".
 */
const errorText = (error: unknown): string => {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current !== undefined && current !== null && depth < 12; depth += 1) {
    // Effect: a FiberFailure keeps its Cause under a symbol; a `Fail` cause holds the error.
    const fiberCause = typeof current !== 'object' ? undefined : Object.getOwnPropertySymbols(current).find((symbol) => String(symbol.description).includes('FiberFailure/Cause'));
    if (fiberCause) {
      parts.push(String((current as Error).name ?? 'FiberFailure'));
      current = (current as Record<symbol, unknown>)[fiberCause];
      continue;
    }
    const tagged = current as { _tag?: string; error?: unknown; defect?: unknown };
    if ((tagged._tag === 'Fail' && 'error' in tagged) || (tagged._tag === 'Die' && 'defect' in tagged)) {
      current = tagged._tag === 'Fail' ? tagged.error : tagged.defect;
      continue;
    }
    if (current instanceof Error) {
      parts.push(`${(current as { _tag?: string })._tag ?? current.name}: ${current.message}`);
    } else {
      let text: string;
      try {
        text = JSON.stringify(current, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value)) ?? String(current);
      } catch {
        text = String(current);
      }
      parts.push(text.slice(0, 600));
    }
    current = (current as { cause?: unknown }).cause;
  }
  return parts.join(' <- ');
};

/** A compiled contract's provable circuits (each one verifier key on chain), in compiled order. */
const provableCircuits = (contract: string): string[] =>
  (
    JSON.parse(readFileSync(path.join(managedDirectory(contract), 'compiler', 'contract-info.json'), 'utf8')) as {
      circuits: { name: string; proof: boolean }[];
    }
  ).circuits
    .filter((circuit) => circuit.proof)
    .map((circuit) => circuit.name);

/** A staged row's maintenance key: `MN_MAINTENANCE_KEY_DIR/<row>.maintenance-key.json` (mode 600). */
const maintenanceKeyOf = (row: MatrixRow): ReturnType<typeof loadOrCreateMaintenanceKey> => {
  const directory = process.env.MN_MAINTENANCE_KEY_DIR?.trim();
  if (!directory) throw new Error(`${row.id} needs a staged deploy: set MN_MAINTENANCE_KEY_DIR (a mode-700 directory)`);
  const result = loadOrCreateMaintenanceKey(path.resolve(directory), row.id);
  if (result.created) log('row.staged.maintenance-key', { row: row.id, file: path.basename(result.file), created: true });
  return result;
};

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

    /** The private state every emitting circuit's witness reads. */
    const privateStateOf = (row: MatrixRow) => ({ privateStateId: row.id, initialPrivateState: { emitterSecret: secret } });

    // The chain's own ledger parameters decide whether a deploy fits one block.
    const { height: parametersHeight, params } = await chainLedgerParameters(profile.indexer);
    log('ledger.parameters', { height: parametersHeight });

    /** Spec 00024 Q20 (a): deploy with the keys that fit, record what is still to insert. */
    const stagedDeploy = async (
      row: MatrixRow,
      record: RowRecord,
      providers: ContractProviders,
      deployOptions: Record<string, unknown>,
      full: UnprovenDeploy,
      fullShare: ReturnType<typeof blockShare>,
    ): Promise<void> => {
      const { key, file } = maintenanceKeyOf(row);
      // midnight-js's deploy again, now under the maintenance key this row keeps in its file.
      const keyed = (await createUnprovenDeployTx(providers as never, { ...deployOptions, signingKey: key } as never)) as never as UnprovenDeploy;
      if (keyed.private.unprovenTx.fallibleOffer !== undefined) throw new Error(`${row.id}: a deploy with a fallible offer cannot be staged`);
      const fullState = LedgerContractState.deserialize(keyed.public.initialContractState.serialize());
      const callOrder = row.steps.map((step) => step.circuit);
      const order = stagingOrder(provableCircuits(row.contract), callOrder);
      const plan = planStagedDeploy(fullState, order, params, keyed.private.unprovenTx.guaranteedOffer);
      const staged = stagedDeployTx(fullState, plan.deployed, keyed.private.unprovenTx.guaranteedOffer);
      log('row.staged.plan', {
        row: row.id,
        fullDeploy: { operations: fullState.operations().length, bytesWritten: String(fullShare.cost.bytesWritten), fits: false },
        deployed: plan.deployed,
        deployBytesWritten: String(plan.cost.bytesWritten),
        deployShare: plan.share,
        toInsert: plan.inserted,
        budget: STAGED_DEPLOY_BLOCK_BUDGET,
      });
      const finalized = (await submitTx(providers as never, { unprovenTx: staged.tx as never })) as never as FinalizedTx;
      if (finalized.status !== SucceedEntirely) throw new Error(`${row.id}: staged deploy ${finalized.txHash} ended ${String(finalized.status)}`);
      // What submitDeployTx does after a deploy: scope the private state to the new address,
      // store the private state and the maintenance key.
      providers.privateStateProvider.setContractAddress(staged.address);
      await providers.privateStateProvider.set(row.id, privateStateOf(row).initialPrivateState);
      await providers.privateStateProvider.setSigningKey(staged.address, key);
      const verifierKeys = new Map(await providers.zkConfigProvider.getVerifierKeys(plan.inserted));
      record.address = staged.address;
      record.deploy = { txId: finalized.txId, txHash: finalized.txHash, blockHeight: Number(finalized.blockHeight), at: new Date().toISOString() };
      record.staged = {
        budget: STAGED_DEPLOY_BLOCK_BUDGET,
        ledgerParametersHeight: parametersHeight,
        fullDeploy: { operations: fullState.operations().length, bytesWritten: String(fullShare.cost.bytesWritten), blockShare: fullShare.share ?? null },
        deployed: plan.deployed,
        deployCost: {
          bytesWritten: String(plan.cost.bytesWritten),
          blockShare: plan.share,
          ...(blockShare(finalized.tx as never, params).share ? { submittedBlockShare: blockShare(finalized.tx as never, params).share } : {}),
        },
        maintenanceVerifyingKey: signatureVerifyingKey(key),
        maintenanceKeyFile: path.basename(file),
        inserts: plan.inserted.map((circuit) => {
          const vk = verifierKeys.get(circuit)!;
          return { circuit, verifierKeySha256: sha256Hex(vk), verifierKeyBytes: vk.length };
        }),
      };
      save();
    };

    /** Spec 00024 Q20 (a): one maintenance transaction per key still missing, then a check. */
    const insertRemainingKeys = async (row: MatrixRow, record: RowRecord, providers: ContractProviders, compiled: unknown): Promise<void> => {
      const address = record.address!;
      const staged = record.staged!;
      const { key } = maintenanceKeyOf(row);
      providers.privateStateProvider.setContractAddress(address);
      await providers.privateStateProvider.setSigningKey(address, key);
      for (const entry of staged.inserts) {
        if (entry.txHash || entry.foundOnChain) continue;
        const vk = await providers.zkConfigProvider.getVerifierKey(entry.circuit);
        if (sha256Hex(vk) !== entry.verifierKeySha256) throw new Error(`${row.id}.${entry.circuit}: the compiled key changed since the deploy`);
        const onChain = (await providers.publicDataProvider.queryContractState(address))?.operation(entry.circuit);
        if (onChain) {
          if (sha256Hex(onChain.verifierKey) !== entry.verifierKeySha256) throw new Error(`${row.id}.${entry.circuit}: another key is on chain`);
          entry.foundOnChain = true;
          save();
          continue;
        }
        const started = Date.now();
        try {
          const finalized = (await submitInsertVerifierKeyTx(providers as never, compiled as never, address, entry.circuit as never, vk as never)) as never as FinalizedTx;
          Object.assign(entry, {
            txId: finalized.txId,
            txHash: finalized.txHash,
            blockHeight: Number(finalized.blockHeight),
            status: String(finalized.status),
            ...(blockShare(finalized.tx as never, params).share ? { blockShare: blockShare(finalized.tx as never, params).share } : {}),
            at: new Date().toISOString(),
          });
          delete entry.error;
          save();
          log('row.staged.inserted', { row: row.id, circuit: entry.circuit, txHash: finalized.txHash, blockHeight: Number(finalized.blockHeight), ms: Date.now() - started });
        } catch (error) {
          entry.error = errorText(error);
          save();
          throw error;
        }
      }
      // Every provable circuit's key is on chain now, each equal to the compiled one.
      const state = await providers.publicDataProvider.queryContractState(address);
      const circuits = provableCircuits(row.contract);
      const local = new Map(await providers.zkConfigProvider.getVerifierKeys(circuits));
      const missing = circuits.filter((c) => !state?.operation(c) || sha256Hex(state.operation(c)!.verifierKey) !== sha256Hex(local.get(c)!));
      if (missing.length > 0) throw new Error(`${row.id}: keys missing or different on chain after the inserts: ${missing.join(', ')}`);
      staged.maintenanceCounter = String(state!.maintenanceAuthority.counter);
      staged.complete = true;
      save();
      log('row.staged.complete', { row: row.id, operations: circuits.length, inserted: staged.inserts.length, maintenanceCounter: staged.maintenanceCounter });
    };

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
      const privateState = privateStateOf(row);

      let contract: CallableContract | undefined;
      try {
        const deployOptions = { compiledContract: compiled, args: [secretHash], ...privateState };
        if (!record.address) {
          log('row.deploy', { row: row.id, contract: row.contract });
          const started = Date.now();
          // midnight-js's own deploy of this contract, built offline: does it fit one block?
          const full = (await createUnprovenDeployTx(providers as never, deployOptions as never)) as never as UnprovenDeploy;
          const fullShare = blockShare(full.private.unprovenTx as never, params);
          if (withinBudget(fullShare.share)) {
            const deployed = (await deployContract(providers as never, deployOptions as never)) as never as {
              deployTxData: { public: { contractAddress: string; txId: string; txHash: string; blockHeight: number } };
            } & CallableContract;
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
          } else {
            await stagedDeploy(row, record, providers, deployOptions, full, fullShare);
            log('row.deployed', {
              row: row.id,
              address: record.address,
              txHash: record.deploy!.txHash,
              blockHeight: record.deploy!.blockHeight,
              staged: { deployed: record.staged!.deployed.length, toInsert: record.staged!.inserts.length },
              ms: Date.now() - started,
            });
          }
        }
        if (record.staged && !record.staged.complete) await insertRemainingKeys(row, record, providers, compiled);
        if (!contract) {
          log('row.found', { row: row.id, address: record.address });
          // findDeployedContract checks every compiled circuit's key against the chain, so a
          // staged row is found only once all of its keys are there.
          contract = (await findDeployedContract(providers as never, {
            compiledContract: compiled,
            contractAddress: record.address,
            ...privateState,
            ...(record.staged ? { signingKey: maintenanceKeyOf(row).key } : {}),
          } as never)) as never;
        }
      } catch (error) {
        log('row.deploy.failed', { row: row.id, error: errorText(error) });
        save();
        continue;
      }

      let rowFailed = false;
      for (const [index, step] of row.steps.entries()) {
        if (record.steps.some((s) => s.index === index && s.txHash)) continue;
        if (rowFailed) break;

        let args: unknown[] = [];
        if (step.kind === 'mint') {
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
          const result = await contract!.callTx[step.circuit]!(...args);
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
          const result = (await contract!.callTx.tokenColor!(
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
