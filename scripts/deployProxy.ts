import { DEFAULT_STARKNET_NETWORK } from "@shardlabs/starknet-hardhat-plugin/dist/constants";
import { task } from "hardhat/config";

import { deployL1 } from "./utils";

task("deploy-proxy", "Deploy proxy").setAction(async (_, hre) => {
  const NETWORK = hre.network.name;

  const STARKNET_NETWORK =
    hre.config.mocha.starknetNetwork || DEFAULT_STARKNET_NETWORK;

  const [l1Signer] = await hre.ethers.getSigners();

  // @ts-ignore
  const BLOCK_NUMBER = await l1Signer.provider.getBlockNumber();

  console.log(`Deploying deployer on ${NETWORK}/${STARKNET_NETWORK}`);

  const proxy = await deployL1(hre, "Proxy", BLOCK_NUMBER, []);
  console.log(proxy.address);
});
