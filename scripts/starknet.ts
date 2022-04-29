import { task } from "hardhat/config";
import { HttpNetworkConfig } from "hardhat/types";

import { getRequiredEnv } from "./utils";

task("load-messaging-contract", "Load messaging contract on devnet").setAction(
  async (_, hre) => {
    const ADDRESS_NETWORK = getRequiredEnv("FORK_NETWORK").toUpperCase();
    const networkUrl: string = (hre.network.config as HttpNetworkConfig).url;
    const STARKNET_ADDRESS = getRequiredEnv(`${ADDRESS_NETWORK}_L1_STARKNET_ADDRESS`);
    await hre.starknet.devnet.loadL1MessagingContract(
      networkUrl,
      STARKNET_ADDRESS
    );
  }
);

task("flush", "Flush L1 -> L2 messages").setAction(async (_, hre) => {
  await hre.starknet.devnet.flush();
});
