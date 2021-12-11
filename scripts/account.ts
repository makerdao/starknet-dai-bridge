import { task } from "hardhat/config";

import { getAddress, save } from "./utils";
const { privateToStarkKey } = require("./signature");

task("account:get", "Get L2 account information")
  .addOptionalParam("name", "Account name")
  .setAction(async ({ name }, hre) => {
    const NETWORK = hre.network.name;

    console.log(`Calling account ${name} on ${NETWORK}`);
    const _name = name || "user";
    const accountAddress = getAddress(`account-${_name}`, NETWORK);
    console.log(`account-${_name} L2 address:`, accountAddress);
  });

task("account:create", "Create new L2 account")
  .addParam("name", "Name of account")
  .setAction(async ({ name }, hre) => {
    const NETWORK = hre.network.name;
    const ECDSA_PRIVATE_KEY = process.env.ECDSA_PRIVATE_KEY;
    if (!ECDSA_PRIVATE_KEY) {
      throw new Error("Set ECDSA_PRIVATE_KEY in .env");
    }
    console.log(`Deploying account ${name} on ${NETWORK}`);
    const accountFactory = await hre.starknet.getContractFactory("account");
    const publicKey = privateToStarkKey(ECDSA_PRIVATE_KEY);
    const account = await accountFactory.deploy({ _public_key: publicKey });
    const _name = name || "user";
    save(`account-${_name}`, account, NETWORK);
    console.log(`account-${_name} L2 address:`, account.address);
  });
