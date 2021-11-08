# Starknet DAI Bridge
[!Tests](https://github.com/makerdao/starknet-dai-bridge/actions/workflows/tests.yml/badge.svg)
[!Check](https://github.com/makerdao/starknet-dai-bridge/actions/workflows/check.yml/badge.svg)
[!Lint](https://github.com/makerdao/starknet-dai-bridge/actions/workflows/lint.yml/badge.svg)

StarkNet interpretation of DAI token and basic DAI bridge.

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
* L1DAIBridge: `rely`, `deny`, `setCeilling`, `close`
* L1Escrow: `relay`, `deny`, `approve`
* L1GovernanceRelay: `rely`, `deny`, `approve`
* dai: `rely`, `deny`, `mint`
* l2_dai_bridge: `rely`, `deny`, `close`

Allowance on L1Escrow should be managed by approve method on `L1Escrow` contract.

It is expected that admin rights to the bridge contracts will be given to the [Maker Governance](https://docs.makerdao.com/smart-contract-modules/governance-module).

### Initial configuration
Maker [PauseProxy](https://docs.makerdao.com/smart-contract-modules/governance-module/pause-detailed-documentation) should be relied on: `L1DAIBridge`, `L1Escrow`, `l2_dai_bridge`, `dai`, `L1GovernanceRelay`. Unlimited allowance on `L1Escrow` should be given to `L1DAIBridge`.
In order to withdraw allowance needs to be given to the `l2_dai_bridge` individually by each L2 DAI user.

## Upgrades
Since bridge funds are stored in a separate escrow contract, multiple bridge instances can share the escrow and operate independently.

After new version of the bridge is up, old version can be closed. Due to the asynchronous nature of L1 <> L2 communication, it is a two step procedure. First `close` method on `L2DAIBridge` and `L1DAIBridge` should be called, so no new deposit or withdrawal requests can be initiated. Then after all async messages that where in transit are processed, bridge is effectively closed. Now, escrow approval on L1 and token minting rights on L2 can be revoked.

## Governance relay
Allows to relay L1 governance actions to a spell contract on the StarkNet. Spell contract is authorized to operate on L2 side of the bridge just for the execution of the spell.
Note that due to the unavailability of delagate call on StarkNet L2 Relay design is not elegant as it could be and Relay will need to be upgraded when new version of the bridge is deployed.

## Escape hatch
In its current stage of development, StarkNet is a centralized operation. Until it is fully decentralized sequencer operator has a right to censor transactions. What is more, if for some reason the operator goes down, no future updates of the state of the rollup will be possible. Both of those situations might result in L2 user not being able to transact L2 DAI or withdraw it back to L1. In any of those cases users should be able to recover DAI on L1. In order to achive that there is governance assisted escape hatch mechanism. It consists of two phases:
* first DAO needs to detect or be informed about rollup emergency, be it either inidividual censorship or rollup unavailability
* governance assisted evacuation procedure is initiated, efectively L2 is abandoned, DAI escrowed in L1Escrow is distributed on L1 back to users

### Emergency detection
In the case if user belives she is censored there is a helper method on `L1DAIBridge` `forceWithdraw` that initiaties withdrawal from L1. If withdrawal request is not handled, which can be read from L1toL2 message queue, then user might request DAO to initiate an evacuation procedure.

### Evacuation procedure
To reimbuse L2 DAI users on L1 last valid L2 state of DAI balances needs to be calculated. Since at that moment rollup data might be unavailable, L2 state needs to be reconstructed from state diffs available on L1. It is important to note that there is no general way to map StarkNet addresses to Ethereum addresses and that only L2 addresses that registered L1 reimbuse address in L2 registry contract will be included in the evacuation procedure. What is more there might be pending deposits that have not reached L2. Those should be also included in evacuation procedure  will be returned based on state of L1toL2 message queue.

## Risks
### StarkNet Bugs
#### L1 -> L2


#### L2 -> L1

### Censorship

#### Deposit

#### Withdrawal

### Configuration mistake
