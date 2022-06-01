import { task } from "hardhat/config";
import { DEFAULT_STARKNET_NETWORK } from "@shardlabs/starknet-hardhat-plugin/dist/constants";
import { ArgentAccount } from "@shardlabs/starknet-hardhat-plugin/dist/account";

import { saveAccount } from "./utils";

task("account:create", "Create new L2 account")
  .addOptionalParam("name", "Name of account")
  .setAction(async ({ name }, hre) => {
    const STARKNET_NETWORK =
      hre.config.starknet.network || DEFAULT_STARKNET_NETWORK;
    const _name = name || "default";
    const account: ArgentAccount = (await hre.starknet.deployAccount("Argent")) as ArgentAccount;
    await account.multiInvoke([
      {
        functionName: "change_guardian",
        toContract: account.starknetContract,
        calldata: { new_guardian: BigInt(0) },
      },
    ]);
    saveAccount(`account-${_name}`, account, STARKNET_NETWORK);
    console.log(`account-${_name} L2 address:`, account.starknetContract.address);
  });
