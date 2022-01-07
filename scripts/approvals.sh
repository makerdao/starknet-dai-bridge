yarn invoke:l2 --network fork --name deployer --contract registry --func set_L1_address --calldata 0x273B13017D681180840F08e951368cb199a783Bb
yarn call:l1 --network fork --contract DAI --func approve --calldata L1DAIBridge,MAX
yarn call:l1 --network fork --contract DAI --func approve --calldata L1DAIWormholeGateway,MAX
yarn invoke:l2 --network fork --name deployer --contract dai --func approve --calldata l2_dai_bridge,MAX_HALF,MAX_HALF
yarn invoke:l2 --network fork --name deployer --contract dai --func approve --calldata l2_dai_wormhole_gateway,MAX_HALF,MAX_HALF
