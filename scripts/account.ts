import { task } from "hardhat/config";

import { getAddress, save } from "./utils";

task("account:get", "Get L2 account information")
  .addOptionalParam("name", "Account name")
  .setAction(async ({ name }, hre) => {
    const NETWORK = hre.network.name;

    console.log(`Calling account ${name} on ${NETWORK}`);
    const _name = name || "auth";
    const accountAddress = getAddress(`account-${_name}`, NETWORK);
    console.log(`account-${_name} L2 address:`, accountAddress);
  });

task("account:create", "Create new L2 account")
  .addParam("name", "Name of account")
  .setAction(async ({ name }, hre) => {
    const NETWORK = hre.network.name;

    console.log(`Deploying account ${name} on ${NETWORK}`);
    const accountFactory = await hre.starknet.getContractFactory("account");
    const account = await accountFactory.deploy();
    save(`account-${name}`, account, NETWORK);
    console.log(`account-${name} L2 address:`, account.address);
  });
