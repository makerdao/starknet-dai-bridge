Set `FORK_ENV` in `.env`

yarn deploy-deployer:fork:goerli

Move `DEPLOYER_ECDSA_PRIVATE_KEY` from `.env.deployer` to `.env`

yarn deploy-bridge:fork:goerli

yarn deploy-wormhole:fork:goerli

yarn load-messaging-contract

Set `gateway` in `L2GoerliAddWormholeDomainSpell.cairo`

yarn compile:l2

yarn deploy-wormhole-spell-l2:fork:goerli

Set
  `slaveDomainGateway`
  `escrow`
  `l1Bridge`
  `l1GovRelay`
  `l2ConfigureDomainSpell`
in `L1GoerliAddWormholeDomainSpell.sol`

yarn compile:l1

yarn deploy-wormhole-spell-l1:fork:goerli

yarn flush # ignore errors

yarn call:l2 --network fork --contract l2_dai_wormhole_gateway --func valid_domains --calldata GOERLI-MASTER-1

yarn invoke:l2 --network fork --name deployer --contract registry --func set_L1_address --calldata L1_ADDRESS

yarn call:l1 --network fork --contract DAI --func approve --calldata L1DAIBridge,MAX
yarn call:l1 --network fork --contract DAI --func approve --calldata L1DAIWormholeGateway,MAX
yarn invoke:l2 --network fork --name deployer --contract dai --func approve --calldata l2_dai_bridge,MAX_HALF,MAX_HALF
yarn invoke:l2 --network fork --name deployer --contract dai --func approve --calldata l2_dai_wormhole_gateway,MAX_HALF,MAX_HALF

yarn call:l1 --network fork --contract L1DAIBridge --func deposit --calldata 1000000000000000000,deployer

yarn invoke:l2 --network fork --name deployer --contract l2_dai_wormhole_gateway --func initiate_wormhole --calldata GOERLI-MASTER-1,L1_ADDRESS,1000000000000000000,L1_ADDRESS

yarn invoke:l2 --network fork --name deployer --contract l2_dai_wormhole_gateway --func finalize_register_wormhole --calldata GOERLI-MASTER-1,L1_ADDRESS,1000000000000000000,L1_ADDRESS,NONCE,TIMESTAMP
