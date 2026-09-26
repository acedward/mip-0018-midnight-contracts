/**
 * The staged deployment of spec 00024 Q20 (a) — scripts/staged-deploy.ts.
 *
 * CNST18 keeps one literal circuit per declaration (39 impure circuits), and a deploy that
 * carries all of their verifier keys does not fit a block of the ledger's default parameters
 * (50 000 bytes written). The deploy script deploys it with the keys that fit and adds the
 * others with maintenance-authority `VerifierKeyInsert` transactions.
 *
 * The planning rules are tested here without a chain. The last block builds CNST18's real
 * deploy transaction the way midnight-js does and plans its staged deploy against
 * `LedgerParameters.initialParameters()` (what the local dev chain runs); it needs the
 * compiled verifier keys, which are not committed (`scripts/compile.sh` writes them), so it is
 * skipped where they are absent (CI).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { sampleSigningKey } from '@midnight-ntwrk/compact-runtime';
import { createUnprovenDeployTxFromVerifierKeys } from '@midnight-ntwrk/midnight-js-contracts';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { ZKConfigProvider, type ProverKey, type VerifierKey, type ZKIR } from '@midnight-ntwrk/midnight-js-types';
import { ContractState, LedgerParameters } from '@midnightntwrk/ledger-v9';
import {
  STAGED_DEPLOY_BLOCK_BUDGET,
  blockShare,
  longestFittingPrefix,
  planStagedDeploy,
  stagedDeployTx,
  stagingOrder,
  withinBudget,
} from '../scripts/staged-deploy.js';
import { emitterSecretHashOf, emitterWitnesses } from '../scripts/profile.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('staged deploy planning', () => {
  it('orders the circuits the deployment calls first, then the rest, each once', () => {
    expect(stagingOrder(['a', 'b', 'c', 'd', 'e'], ['c', 'a', 'c', 'mint-of-another', 'e'])).toEqual(['c', 'a', 'e', 'b', 'd']);
    expect(stagingOrder(['a', 'b'], [])).toEqual(['a', 'b']);
  });

  it('deploys the longest prefix that fits and inserts the rest', () => {
    const order = ['a', 'b', 'c', 'd', 'e'];
    expect(longestFittingPrefix(order, (subset) => subset.length <= 3)).toEqual({ deployed: ['a', 'b', 'c'], inserted: ['d', 'e'] });
    expect(longestFittingPrefix(order, () => true)).toEqual({ deployed: order, inserted: [] });
    expect(() => longestFittingPrefix(order, () => false)).toThrow(/not even one circuit/);
  });

  it('accepts a share only when every dimension is within the budget', () => {
    // 0.6 by default: the node admits a transaction only below ~0.64 of the ledger's block
    // limits (75 % normal dispatch − 10 % initialization reserve − the 1 % size weight).
    expect(STAGED_DEPLOY_BLOCK_BUDGET).toBe(0.6);
    const share = { readTime: 0.1, computeTime: 0.1, blockUsage: 0.2, bytesWritten: 0.55, bytesChurned: 0 };
    expect(withinBudget(share)).toBe(true);
    expect(withinBudget({ ...share, bytesWritten: STAGED_DEPLOY_BLOCK_BUDGET + 0.01 })).toBe(false);
    expect(withinBudget(undefined)).toBe(false); // beyond a whole block: the ledger refuses to normalize
    expect(withinBudget(share, 0.5)).toBe(false);
  });
});

/** The compiled artefacts of a contract, as midnight-js's node provider reads them. */
class ManagedZkConfig extends ZKConfigProvider<string> {
  constructor(private readonly directory: string) {
    super();
  }
  private read(file: string): Uint8Array {
    return new Uint8Array(readFileSync(join(this.directory, file)));
  }
  getZKIR(circuit: string): Promise<ZKIR> {
    return Promise.resolve(this.read(`zkir/${circuit}.bzkir`) as ZKIR);
  }
  getProverKey(circuit: string): Promise<ProverKey> {
    return Promise.resolve(this.read(`keys/${circuit}.prover`) as ProverKey);
  }
  getVerifierKey(circuit: string): Promise<VerifierKey> {
    return Promise.resolve(this.read(`keys/${circuit}.verifier`) as VerifierKey);
  }
}

const CNST18 = join(ROOT, 'contracts', 'managed', 'CNST18');
const haveKeys = existsSync(join(CNST18, 'keys', 'publishOrionName.verifier'));

describe.skipIf(!haveKeys)('CNST18 deployed in stages (needs the compiled verifier keys)', () => {
  it('cannot deploy in one block, and stages into a deploy that fits plus key inserts', async () => {
    setNetworkId('undeployed');
    const params = LedgerParameters.initialParameters();
    const { Contract } = (await import('../contracts/managed/CNST18/contract/index.js')) as unknown as { Contract: never };
    const compiled = CompiledContract.make('CNST18', Contract).pipe(
      CompiledContract.withWitnesses(emitterWitnesses as never),
      CompiledContract.withCompiledFileAssets(CNST18),
    );
    const secret = new Uint8Array(32).fill(1);
    const deploy = (await createUnprovenDeployTxFromVerifierKeys(
      new ManagedZkConfig(CNST18) as never,
      '11'.repeat(32) as never,
      {
        compiledContract: compiled,
        args: [emitterSecretHashOf(secret)],
        signingKey: sampleSigningKey(),
        privateStateId: 'CNST18',
        initialPrivateState: { emitterSecret: secret },
      } as never,
      '22'.repeat(32) as never,
    )) as never as {
      public: { initialContractState: { serialize(): Uint8Array } };
      private: { unprovenTx: { cost(p: LedgerParameters): never; guaranteedOffer?: never; fallibleOffer?: unknown } };
    };

    // midnight-js's own deploy carries every key and exceeds the block.
    const full = ContractState.deserialize(deploy.public.initialContractState.serialize());
    const circuits = full.operations().map(String);
    expect(circuits).toHaveLength(39);
    expect(blockShare(deploy.private.unprovenTx as never, params).share).toBeUndefined();
    expect(deploy.private.unprovenTx.fallibleOffer).toBeUndefined();

    const info = JSON.parse(readFileSync(join(CNST18, 'compiler', 'contract-info.json'), 'utf8')) as {
      circuits: { name: string; proof: boolean }[];
    };
    const matrix = JSON.parse(readFileSync(join(ROOT, 'deployments', 'generated-matrix.json'), 'utf8')) as {
      rows: { id: string; steps: { circuit: string }[] }[];
    };
    const order = stagingOrder(
      info.circuits.filter((c) => c.proof).map((c) => c.name),
      matrix.rows.find((r) => r.id === 'CNST18')!.steps.map((s) => s.circuit),
    );
    const plan = planStagedDeploy(full, order, params, deploy.private.unprovenTx.guaranteedOffer);

    // The deploy fits the budget; one more key would not.
    expect(withinBudget(plan.share)).toBe(true);
    expect(plan.deployed.length).toBeGreaterThan(1);
    expect(plan.inserted.length).toBeGreaterThan(0);
    expect([...plan.deployed, ...plan.inserted]).toEqual(order);
    expect(new Set(order)).toEqual(new Set(circuits));
    const oneMore = stagedDeployTx(full, order.slice(0, plan.deployed.length + 1), deploy.private.unprovenTx.guaranteedOffer);
    expect(withinBudget(blockShare(oneMore.tx, params).share)).toBe(false);
    // The first call (mintPiece) is deployed with the contract.
    expect(plan.deployed[0]).toBe('mintPiece');

    // The staged state is the full one with fewer operations: same data, same authority,
    // and each deployed operation carries the compiled key.
    const staged = stagedDeployTx(full, plan.deployed, deploy.private.unprovenTx.guaranteedOffer);
    expect(staged.initialState.operations().map(String).sort()).toEqual([...plan.deployed].sort());
    expect(staged.initialState.data.toString()).toBe(full.data.toString());
    expect(staged.initialState.maintenanceAuthority.toString()).toBe(full.maintenanceAuthority.toString());
    for (const circuit of plan.deployed) {
      const key = new Uint8Array(readFileSync(join(CNST18, 'keys', `${circuit}.verifier`)));
      expect(Buffer.from(staged.initialState.operation(circuit)!.verifierKey).equals(Buffer.from(key)), circuit).toBe(true);
    }
  });
});
