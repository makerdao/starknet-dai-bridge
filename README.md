# Starknet DAI Bridge
[![Lint](https://github.com/makerdao/starknet-dai-bridge/actions/workflows/lint.yml/badge.svg)](https://github.com/makerdao/starknet-dai-bridge/actions/workflows/lint.yml)
[![Check](https://github.com/makerdao/starknet-dai-bridge/actions/workflows/check.yml/badge.svg)](https://github.com/makerdao/starknet-dai-bridge/actions/workflows/check.yml)
[![Tests](https://github.com/makerdao/starknet-dai-bridge/actions/workflows/tests.yml/badge.svg)](https://github.com/makerdao/starknet-dai-bridge/actions/workflows/tests.yml)

StarkNet interpretation of DAI token and basic DAI bridge.

## :warning: :skull_and_crossbones: :warning:️ WARNING! :warning: :skull_and_crossbones:️ :warning:
This codebase is still in an experimental phase, has not been audited, might contain bugs and should not be used in production.

## Additional Documentation
[Development documentation](./docs/development.md)

## Overview

Bridge provides two main functions: `deposit` and `withdraw`. On L1 `deposit`, bridge parks funds on address of `L1Escrow` contract, then sends `finalize_deposit` message to L2 side of the bridge where L2 DAI is minted to the destination address. On L2 `withdrawal`, L2 DAI is burned and a `finalizeWithdraw` message is send to L1 where withdrawal should be finalized with `finalizeWithdrawal` method which will transfer DAI from escrow contract to the destination.

![Architecture](./docs/architecture.png?raw=true)

### Contracts
* `L1DAIBridge` - L1 side of the bridge
* `L1Escrow` - holds bridge funds on L1
* `L1GovernanceRelay` - relays governance action to L2
* `dai` - Cairo interpretation of DAI contract
* `l2_dai_bridge` - L2 side of the bridge
* `l2_governance_delay` - executes governance action relayed from L1
* `registry` - provides L2 to L1 address mapping

### Starknet DAI
Since StarkNet execution environment is significantly different than EVM, Starknet DAI is not a one to one copy of L1 DAI. Here are the diferences:
* snake case method names for compatibility with Cairo conventions
* [`uint256`](https://github.com/starkware-libs/cairo-lang/blob/master/src/starkware/cairo/common/uint256.cairo) to represent balances, for compatibility with L1
* no permit function - StarkNet account abstraction should be used for UX optimizations
* `increase_allowance`, `decrease_allowance` - extra methods to prevent approval front running

## Authorization
Sevaral contracts here use a very simple multi-owner authentication system, that restricts access to certain functions of the contract interface:
* L1DAIBridge: `rely`, `deny`, `setCeiling`, `close`
* L1Escrow: `relay`, `deny`, `approve`
* L1GovernanceRelay: `rely`, `deny`, `approve`
* dai: `rely`, `deny`, `mint`
* l2_dai_bridge: `rely`, `deny`, `close`

Allowance on L1Escrow should be managed by approve method on `L1Escrow` contract.

It is expected that admin rights to the bridge contracts will be given to the [Maker Governance](https://docs.makerdao.com/smart-contract-modules/governance-module).

## Governance relay
`L1GovernanceRelay` allows to relay L1 governance actions to a spell contract on the StarkNet via `l2_governance_relay`.

### Initial configuration
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
In the case that a user believes they are censored, there is a `forceWithdraw` helper method on `L1DAIBridge` that initiates withdrawal from L1. If the withdrawal request is not handled, then the user might request the DAO to initiate an evacuation procedure. The DAO can verify the withdrawal request was not fulfilled by checking the L1toL2 message queue.

##### Evacuation procedure
To reimburse L2 DAI users on L1, the last valid L2 state of DAI balances needs to be calculated. Since at that moment rollup data might be unavailable, L2 state needs to be reconstructed from state diffs available on L1. It is important to note that there is no general way to map StarkNet addresses to Ethereum addresses and that only L2 addresses that registered an L1 reimburse address in the L2 registry contract will be included in the evacuation procedure. What is more there might be pending deposits that have not reached L2. Those should also be included in evacuation and returned based on state of L1toL2 message queue.

### Configuration mistake
Bridge consists of several interacting contracts and it is possible to misconfigure the construction which will render bridge non functional. There are at least two ways to do that:
* remove allowance from `L1DAIBridge` to `L1Escrow` - withdrawals won't be finalized on L1, easy to fix by resetting the allowance and repeating `finalizeWithdrawal` operation
* remove authorization to mint L2 DAI from `l2_dai_bridge` - deposits won't be finalized on L2, probably possible to fix with the help from the sequencer: first reauthorize bridge to mint, then ask sequencer to retry `finalize_deposit` method. Retrying of `finalize_deposit` should be possible as reverted transactions are not included in the state update.

## Missing parts
StarkNet is still under active development and there are missing features for which there are no good workarounds:
* no events - no events are emitted whatsoever, ux will suffer for certain applications
