# Starknet DAI Bridge

## Overview
![Architecture](./docs/architecture.png?raw=true)

## Additional Documentation
[Development documentation](./docs/development.md)

### Contracts
#### L1
* L1DAIBridge
* L1Escrow
* L1GovernanceRelay
#### L2
* dai
* l2_dai_bridge
* l2_governance_delay
* registry

## Starknet DAI
ERC-20 interpretation in Cairo
* snake case
* uint256 for compatibility with L1
* no permit function - account abstraction
* increase_allowance, decrease_allowance

## Upgrade procedure
* state in escrow contract
* messages in transit
* to upgrade:
    * deploy new bridge
    * setup auth
    * new bridge operational
    * close old one
    * when no messages in transit revoke auth for old bridge

## Governance relay
* L2Governance relay design temporary until delegate calls are available on starknet!

## Risks
### StarkNet Bugs

#### L1 -> L2

#### L2 -> L1

### Censorship

#### Deposit

#### Withdrawal

### Configuration mistake

## Escape hatch
Temporary solution until StarkNet is decentralized.

### Censorship detection
* if user belives she is censored she can request withdrawal from l1, for request to work allowance needs to be set, and L1 address needs to be registered in registry contract
* if withdrawal request is not handled then user might request DAO initiate an exit procedure, L1 address needs to be registered in registry contract

### Exit procedure
* state reconstruction from state diffs available on L1
* only L2 addresses that registered L1 address in L2 registry contract will be included
* pending deposits that have not reached L2 will be returned based on state on L1toL2 message mapping