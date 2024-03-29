# Starknet DAI Bridge
[![Lint](https://github.com/makerdao/starknet-dai-bridge/actions/workflows/lint.yml/badge.svg)](https://github.com/makerdao/starknet-dai-bridge/actions/workflows/lint.yml)
[![Check](https://github.com/makerdao/starknet-dai-bridge/actions/workflows/check.yml/badge.svg)](https://github.com/makerdao/starknet-dai-bridge/actions/workflows/check.yml)
[![Tests](https://github.com/makerdao/starknet-dai-bridge/actions/workflows/tests.yml/badge.svg)](https://github.com/makerdao/starknet-dai-bridge/actions/workflows/tests.yml)

StarkNet interpretation of DAI token, basic DAI bridge, DAI teleport gateway.

## Additional Documentation
[Development documentation](./docs/development.md)

# Basic Bridge

## Overview

Bridge provides two main functions: `deposit` and `withdraw`. On L1 `deposit`, bridge parks funds on address of `L1Escrow` contract, then sends `finalize_deposit` message to L2 side of the bridge where L2 DAI is minted to the destination address. On L2 `withdrawal`, L2 DAI is burned and a `finalizeWithdraw` message is send to L1 where withdrawal should be finalized with `finalizeWithdrawal` method which will transfer DAI from escrow contract to the destination.

![Architecture](./docs/architecture.png?raw=true)

## Contracts
* `L1DAIBridge` - L1 side of the bridge
* `L1Escrow` - holds bridge funds on L1
* `L1GovernanceRelay` - relays governance action to L2
* `dai` - Cairo interpretation of DAI contract
* `l2_dai_bridge` - L2 side of the bridge
* `l2_governance_delay` - executes governance action relayed from L1
* `registry` - provides L2 to L1 address mapping

## Bridge Ceiling
The amount of bridged DAI can be restricted by setting a ceiling property(`setCeiling`) on the L1DAIBridge. Setting it to Uint256.max will make it effectively unlimited, setting it to anything lower than the amount currently bridged will temporarily disable deposits.

## Deposit Limit
To make DAI bridge compatible with generic StarkNet token bridges a single deposit limit(`setMaxDeposit`) was added. Setting it to a value above the ceiling will make deposits unlimited, setting it to 0 will temporarily disable the bridge.

### Deposit cancellation
In case for some reason deposit transactions can't be included in L2 state users can cancel deposits on L1. It is a two step process:
* first call `startDepositCancellation` on L1DAIBridge
* second, after `messageCancellationDelay` (l1ToL2MessageNonce StarkNet core contract) finalize cancellation with `cancelDeposit`

## Starknet DAI
Since StarkNet execution environment is significantly different than EVM, Starknet DAI is not a one to one copy of L1 DAI. Here are the diferences:
* [`uint256`](https://github.com/starkware-libs/cairo-lang/blob/master/src/starkware/cairo/common/uint256.cairo) to represent balances, for compatibility with L1
* no permit function - StarkNet account abstraction should be used for UX optimizations
* `increase_allowance`, `decrease_allowance` - extra methods to prevent approval front running

## Authorization
Several contracts here use a very simple multi-owner authentication system, that restricts access to certain functions of the contract interface:
* L1DAIBridge: `rely`, `deny`, `setCeiling`, `setMaxDeposit`, `close`
* L1Escrow: `relay`, `deny`, `approve`
* L1GovernanceRelay: `rely`, `deny`, `approve`
* dai: `rely`, `deny`, `mint`
* l2_dai_bridge: `rely`, `deny`, `close`

Allowance on L1Escrow should be managed by approve method on `L1Escrow` contract.

It is expected that admin rights to the bridge contracts will be given to the [Maker Governance](https://docs.makerdao.com/smart-contract-modules/governance-module).

## Governance relay
`L1GovernanceRelay` allows to relay L1 governance actions to a spell contract on the StarkNet via `l2_governance_relay`.

## Initial configuration
Maker [PauseProxy](https://docs.makerdao.com/smart-contract-modules/governance-module/pause-detailed-documentation) should be relied on: `L1DAIBridge`, `L1Escrow`, `l2_dai_bridge`, `dai`, `L1GovernanceRelay`. Unlimited allowance on `L1Escrow` should be given to `L1DAIBridge`.
In order to withdraw allowance needs to be given to the `l2_dai_bridge` individually by each L2 DAI user.

## Upgrades
Since bridge funds are stored in a separate escrow contract, multiple bridge instances can share the escrow and operate independently.

After new version of the bridge is up, old version can be closed. Due to the asynchronous nature of L1 <> L2 communication, it is a two step procedure. First `close` method on `l2_dai_bridge` and `L1DAIBridge` should be called, so no new deposit or withdrawal requests can be initiated. Then after all async messages that were in transit are processed, bridge is effectively closed. Now, escrow approval on L1 and token minting rights on L2 can be revoked.

## Risks
### Bugs
In this section, we describe various risks caused by software bugs.

#### Minting uncollateralized L2 DAI
Bug allowing direct access to `mint` method on L2 `dai` or to `finalize_deposit` on `l2_dai_bridge` will result in a creation of uncollateralized L2 DAI. Withdrawal finalization to L1 is expected to take several hours on StarkNet. Maker governance with its 2 day delay won't be able to respond in time to coordinate preventive action if a malicious user mints uncollateralized DAI on L2 and withdraw DAI on L1.

#### Getting access to `L1Escrow`
Getting direct access to `L1Escrow` via incorectly assigned allowance or getting indirect access by having fake entry in L2toL1 message queue will allow to immediately drain L1 DAI from `L1Escrow`.

### Censorship
In its current stage of development, StarkNet is a centralized operation. Until it is fully decentralized, the sequencer operator has a right to censor transactions. What is more, if for some reason the operator goes down, no future updates of the state of the rollup will be possible. Both of those situations might result in L2 user not being able to transact L2 DAI or withdraw it back to L1.

#### Governance Assisted Escape Hatch
In case of rollup emergency that would result in funds being frozen governance assisted escape hatch mechanism is planned. It consists of two phases:
* DAO needs to detect or be informed about rollup emergency, be it either inidividual censorship or rollup unavailability
* governance assisted evacuation procedure is initiated, DAI escrowed in the `L1Escrow` is distributed on L1 back to users, effectively L2 DAI is abandoned

##### Emergency detection
In the case that a user believes they are censored, there is a `forceWithdraw` helper method on `L1DAIBridge` that initiates withdrawal from L1. If the withdrawal request is not handled, then the user might request the DAO to initiate an evacuation procedure. The DAO can verify the withdrawal request was not fulfilled by checking the L1toL2 message queue. It is important to note that in order for the `forceWithdraw` to effectively work, L2 user needs to give allowance to `l2_dai_bridge` and register its L1 reimbuse adress prior to calling `forceWithdraw`. This may no longer be possible when the L2 network is acting maliciously, hence this should be done by the users before receiving DAI on L2.

##### Evacuation procedure
To reimburse L2 DAI users on L1, the last valid L2 state of DAI balances needs to be calculated. Since at that moment rollup data might be unavailable, L2 state needs to be reconstructed from state diffs available on L1. It is important to note that there is no general way to map StarkNet addresses to Ethereum addresses and that only L2 addresses that registered an L1 reimburse address in the L2 registry contract will be included in the evacuation procedure. What is more there might be pending deposits that have not reached L2. Those should also be included in evacuation and returned based on state of L1toL2 message queue.

#### Deposit censorship
If `DEPOSIT` message for some reason is not processed by the sequencer, user funds will be stucked in the L1 escrow. Since this situation is detectable from data available on L1(L1 to L2 message queue is in the L1 StarkNet contract) Governance Assisted Escape Hatch described above will work. Another, simpler solution is to use [deposit cancelation](#deposit-cancellation).

### Configuration mistake
Bridge consists of several interacting contracts and it is possible to misconfigure the construction which will render bridge non functional. There are at least two ways to do that:
* remove allowance from `L1DAIBridge` to `L1Escrow` - withdrawals won't be finalized on L1, easy to fix by resetting the allowance and repeating `finalizeWithdrawal` operation
* remove authorization to mint L2 DAI from `l2_dai_bridge` - deposits won't be finalized on L2, probably possible to fix [deposit cancelation](#deposit-cancellation): cancel the deposit, reauthorize bridge to mint, then retry the deposit operation.

## Emergency Circuit Breaker
Since StarkNet is expected to finalize its state on L1 at most every several hours, there is very little time to organize any preventive action in case of uncollateralized DAI is minted on L2. Maker Governance with its 2 day delay won't be able to respond in time. `L1EscrowMom` provides `refuse` method that sets L1Escrow allowance to 0. It can be used to freeze withdrawals immediately.
As soon as problem is fixed Governance could increase allowance. `Refuse` access is controlled by `AuthorityLike` contract. It is expected to be set to: [DSChief](https://docs.makerdao.com/smart-contract-modules/governance-module/chief-detailed-documentation) to bypass the governance delay.

# Teleport Gateway

## Overview
Starknet DAI Teleport is part of general teleport infrastructure spread over several repos:
* [dss-teleport](https://github.com/makerdao/dss-teleport) - L1 relayer, L1 domain
implemenetation
* TODO: a link to AttestationOracle

There are parallel implementations for optimistic L2s:
* [optimism-dai-bridge](https://github.com/makerdao/optimism-dai-bridge) - Optimism implementation
* [arbitrum-dai-bridge](https://github.com/makerdao/arbitrum-dai-bridge) - Arbitrum

StarkNet teleport implementation allows to open teleport on StarkNet and finalize it on L1. In the future, when full MCD system is deployed to L2s it will be possible to finalize StarkNet originating teleports on other L2 and finalize teleports originating from other L2 on StarkNet.

Following documentation describes special case of L2 to L1 teleports also called _fast withdrawals_.

## Architecture
![Teleport L2/L1 usecase](./docs/teleport.png?raw=true)

There are several components that provide _fast withdrawals_ functionality on StarkNet:
* `l2_dai_teleport_gateway` - a StarkNet smart contract that allows to open the teleport, initiate teleport debt settlement, and initiate emergency teleport finalization in case for some reason Attestions Oracle does not work
* `L1DAITeleportGateway` - a L1 smart contract that is the counterpart to `l2_dai_teleport_gateway` and forwards calls to internal components of dss-teleport
* _AttestationOracle_ - a service that watches for `TeleportInitialized` events on StarkNet and based on those serves attestions that can be used to finalize the teleport by calling `requestMint` on `TeleportOracleAuth`
* `TeleportOracleAuth` - part of [dss-teleport](https://github.com/makerdao/dss-teleport), allows to finalized the teleport in a fast way by providing attestation

#### Fast path
Aka 'fast withdrawal':
1. The user calls `l2_dai_teleport_gateway.initiate_teleport` - this burns DAI on L2 and stores teleport data in `l2_dai_teleport_gateway.teleports` storage variable. It also emmits `TeleportInitialized` event.
2. Attestation Oracle observes `TeleportInitialized` event and creates an attestation
3. As soon as enough attestations are available user calls `TeleportOracleAuth.requestMint` which will finnalize the teleport

#### Settlement through L1
Settlement process moves DAI from L1 Bridge to TeleportJoin to clear the debt that accumulates there. It is triggered by keepers.
1. On StarkNet keeper calls `l2_dai_teleport_gateway.flush`
2. L2 -> L1 message `finalizeFlush` is sent to `L1DAITeleportGateway` and relayed by a keeper
3. `L1DAITeleportGateway` upon receiving `finalizeFlush` calls `TeleportRouter.settle()` which will:
    1. Transfer DAI from bridges' escrow to `TeleportJoin`
    2. Call `TeleportJoin.settle` which will use transfered DAI to clear any outstanding debt

#### Slow path
If attestations cannot be obtained (Oracles down or censoring), `l2_dai_teleport_gateway` provides a way to finalize teleport through L2->L1 messages:
1. Initiate slow path on L2 by calling `l2_dai_teleport_gateway.finalize_register_teleport`. After checking in `l2_dai_teleport_gateway.teleports` that teleport was opened, `FINALIZE_REGISTER_TELEPORT` L2->L1 message will sent to `L1DAITeleportGateway`
2. Receive `FINALIZE_REGISTER_TELEPORT` message by calling `L1DAITeleportGateway.finalizeRegisterTeleport`, which in turn will call `TeleportJoin.requestMint` which will finalize teleport if it was not finalized already.

## Risks
In addition to general teleport risks described [here](https://github.com/makerdao/dss-teleport#risks) there are a few  StarkNet specific risks that are worth mentioning.

### Attestations finality
At the current stage of StarkNet development there is no middle ground between L1 finality reached after state update on L1 and no finality at all. Any system trying to build functionality that will result in non reversible consequences based on non final rollup state will need take the risk of L2 state rollback. There are a few reasons why L2 state might be rolled back:
* deep L1 rollback
* malicious sequncer
* bugs in the sequncer

Teleport attestations are sensitive to L2 state rollback as attestations are nonreversible and teleport reopening with the same funds might result in double withdrawals on L1 and bad debt that eventually will need to be healed with system surplus. This peculiar nature of withdrawal attestations will need to be taken under consideration when setting StarkNet teleport join risk parameters.

### Data availability
In case of the following two failures:
* rollup becomes unavailable after the consequences of the `l2_dai_teleport_gateway.initiate_teleport` call become finalized on L1
* user is not able to use the teleport attestation because the Attestation Oracle becomes unavailable

the full teleport data is stored in `l2_dai_teleport_gateway.teleports`.

This should allow to execute teleport evacuation procedure in case of catastrophic rollup failure.

# Deployed addresses
## Mainnet
```s
L1_DAI_BRIDGE_ADDRESS=0x9F96fE0633eE838D0298E8b8980E6716bE81388d
L1_DAI_TELEPORT_GATEWAY_ADDRESS=0x95D8367B74ef8C5d014ff19C212109E243748e28
L1_ESCROW_ADDRESS=0x0437465dfb5B79726e35F08559B0cBea55bb585C
L1_ESCROW_MOM_ADDRESS=0xc238E3D63DfD677Fa0FA9985576f0945C581A266
L1_GOVERNANCE_RELAY_ADDRESS=0x2385C60D2756Ed8CA001817fC37FDa216d7466c0
L2_DAI_ADDRESS=0x00da114221cb83fa859dbdb4c44beeaa0bb37c7537ad5ae66fe5e0efd20e6eb3
L2_DAI_BRIDGE_ADDRESS=0x075ac198e734e289a6892baa8dd14b21095f13bf8401900f5349d5569c3f6e60
L2_DAI_TELEPORT_GATEWAY_ADDRESS=0x05b20d8c7b85456c07bdb8eaaeab52a6bf3770a586af6da8d3f5071ef0dcf234
L2_GOVERNANCE_RELAY_ADDRESS=0x05f4d9b039f82e9a90125fb119ace0531f4936ff2a9a54a8598d49a4cd4bd6db
L2_REGISTRY_ADDRESS=0x02139a1b149d6c5959b2e845eb9fbac75070f6c4f5aaa71d8e6087fa09d4a95e
```

## Goerli
```s
L1_DAI_BRIDGE_ADDRESS=0xaB00D7EE6cFE37cCCAd006cEC4Db6253D7ED3a22
L1_DAI_TELEPORT_GATEWAY_ADDRESS=0x6DcC2d81785B82f2d20eA9fD698d5738B5EE3589
L1_ESCROW_ADDRESS=0x38c3DDF1eF3e045abDDEb94f4e7a1a0d5440EB44
L1_ESCROW_MOM_ADDRESS=0x464379BD1aC523DdA45b7B78eCB1F703661cad2a
L1_GOVERNANCE_RELAY_ADDRESS=0x8919aefA417745F22c6af5AD6550E83159a373F3
L2_DAI_ADDRESS=0x03e85bfbb8e2a42b7bead9e88e9a1b19dbccf661471061807292120462396ec9
L2_DAI_BRIDGE_ADDRESS=0x057b7fe4e59d295de5e7955c373023514ede5b972e872e9aa5dcdf563f5cfacb
L2_DAI_TELEPORT_GATEWAY_ADDRESS=0x078e1e7cc88114fe71be7433d1323782b4586c532a1868f072fc44ce9abf6714
L2_GOVERNANCE_RELAY_ADDRESS=0x00275e3f018f7884f449a1fb418b6b1de77e01c74a9fefaed1599cb22322ff74
L2_REGISTRY_ADDRESS=0x09a22467ad5121347d290c8d439d660076bf8e6f836ad4ca607d7637f8c2a5
```
