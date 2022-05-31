echo "Deploying deployer"
yarn deploy-deployer:goerli
echo
echo "Deploying bridge"
yarn deploy-bridge:goerli
echo
echo "Deploying teleport"
yarn deploy-teleport:goerli
echo
echo "Creating L2 spell"
yarn create-teleport-spell-l2
yarn compile:l2
echo
echo "Deploying L2 spell"
yarn deploy-teleport-spell-l2:goerli
echo
echo "Creating L1 spell"
yarn create-teleport-spell-l1
yarn compile:l1
echo
echo "Deploying L1 spell"
yarn deploy-teleport-spell-l1:goerli
echo
echo "Calling spell"
yarn run-spell:goerli

STARKNET_NETWORK=alpha-goerli yarn call:l2 --network goerli --contract l2_dai_teleport_gateway --func valid_domains --calldata GOERLI-MASTER-1
