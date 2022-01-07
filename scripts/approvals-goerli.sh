yarn call:l1 --network goerli --contract DAI --func approve --calldata L1DAIBridge,MAX
yarn call:l1 --network goerli --contract DAI --func approve --calldata L1DAIWormholeGateway,MAX
yarn invoke:l2 --network goerli --name user --contract dai --func approve --calldata l2_dai_bridge,MAX_HALF,MAX_HALF
yarn invoke:l2 --network goerli --name user --contract dai --func approve --calldata l2_dai_wormhole_gateway,MAX_HALF,MAX_HALF
