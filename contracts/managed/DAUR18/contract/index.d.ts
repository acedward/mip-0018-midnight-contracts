import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type ContractAddress = { bytes: Uint8Array };

export type Either<A, B> = { is_left: boolean; left: A; right: B };

export type Maybe<T> = { is_some: boolean; value: T };

export type ShieldedCoinInfo = { nonce: Uint8Array;
                                 color: Uint8Array;
                                 value: bigint
                               };

export type UserAddress = { bytes: Uint8Array };

export type ZswapCoinPublicKey = { bytes: Uint8Array };

export type Witnesses<PS> = {
  emitterSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  tokenColor(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  mints(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, bigint>>;
  publishUnshieldedName(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishUnshieldedSymbol(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishUnshieldedDecimals(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishUnshieldedRepository(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishShieldedName(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishShieldedSymbol(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishShieldedDecimals(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishShieldedRepository(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  mintShielded(context: __compactRuntime.CircuitContext<PS>,
               recipient_0: Either<ZswapCoinPublicKey, ContractAddress>,
               amount_0: bigint,
               nonce_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, ShieldedCoinInfo>>;
  mintUnshielded(context: __compactRuntime.CircuitContext<PS>,
                 recipient_0: Either<ContractAddress, UserAddress>,
                 amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
}

export type ProvableCircuits<PS> = {
  tokenColor(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  mints(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, bigint>>;
  publishUnshieldedName(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishUnshieldedSymbol(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishUnshieldedDecimals(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishUnshieldedRepository(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishShieldedName(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishShieldedSymbol(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishShieldedDecimals(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishShieldedRepository(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  mintShielded(context: __compactRuntime.CircuitContext<PS>,
               recipient_0: Either<ZswapCoinPublicKey, ContractAddress>,
               amount_0: bigint,
               nonce_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, ShieldedCoinInfo>>;
  mintUnshielded(context: __compactRuntime.CircuitContext<PS>,
                 recipient_0: Either<ContractAddress, UserAddress>,
                 amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
}

export type PureCircuits = {
  domainSep(): Uint8Array;
  decimals(): bigint;
}

export type Circuits<PS> = {
  domainSep(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  tokenColor(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  decimals(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, bigint>>;
  mints(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, bigint>>;
  publishUnshieldedName(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishUnshieldedSymbol(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishUnshieldedDecimals(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishUnshieldedRepository(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishShieldedName(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishShieldedSymbol(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishShieldedDecimals(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishShieldedRepository(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  mintShielded(context: __compactRuntime.CircuitContext<PS>,
               recipient_0: Either<ZswapCoinPublicKey, ContractAddress>,
               amount_0: bigint,
               nonce_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, ShieldedCoinInfo>>;
  mintUnshielded(context: __compactRuntime.CircuitContext<PS>,
                 recipient_0: Either<ContractAddress, UserAddress>,
                 amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
}

export type Ledger = {
  readonly TM_emitterSecretHash: Uint8Array;
  readonly _mints: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               emitterSecretHash_0: Uint8Array): Promise<__compactRuntime.ConstructorResult<PS>>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
export declare const expectedVk: Record<string, string>;
