import { task } from "hardhat/config";
import { ec } from "starknet";
const { getKeyPair, getStarkKey } = ec;

import { getAddress, save } from "./utils";

task("account:get", "Get L2 account information")
  .addOptionalParam("name", "Account name")
  .setAction(async ({ name }, hre) => {
    const NETWORK = hre.network.name;

    console.log(`Calling account ${name} on ${NETWORK}`);
    const _name = name || "default";
    const accountAddress = getAddress(`account-${_name}`, NETWORK);
    console.log(`account-${_name} L2 address:`, accountAddress);
  });

task("account:create", "Create new L2 account")
  .addParam("name", "Name of account")
  .setAction(async ({ name }, hre) => {
    const NETWORK = hre.network.name;
    const _name = name || "default";
    const ECDSA_PRIVATE_KEY =
      process.env[`${_name.toUpperCase()}_ECDSA_PRIVATE_KEY`];
    if (!ECDSA_PRIVATE_KEY) {
      throw new Error(`Set ${_name}_ECDSA_PRIVATE_KEY in .env`);
    }
    console.log(`Deploying account ${_name} on ${NETWORK}`);
    const accountFactory = await hre.starknet.getContractFactory("account");
    const keyPair = getKeyPair(ECDSA_PRIVATE_KEY);
    const publicKey = BigInt(getStarkKey(keyPair));
    const account = await accountFactory.deploy({ _public_key: publicKey });
    save(`account-${_name}`, account, NETWORK);
    console.log(`account-${_name} L2 address:`, account.address);
  });
