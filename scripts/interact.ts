import { task } from "hardhat/config";

import { getAddress, parseCalldataL1, parseCalldataL2, Signer } from "./utils";

task("invoke:l2", "Invoke an L2 contract")
  .addParam("contract", "Contract to call")
  .addParam("func", "Function to call")
  .addOptionalParam("calldata", "Inputs to the function")
  .addOptionalParam("name", "Account name to execute from")
  .setAction(async ({ contract, func, calldata, name }, hre) => {
    const NETWORK = hre.network.name;
    console.log(`Calling on ${NETWORK}`);
    const address = getAddress(contract, NETWORK);
    const contractFactory = await hre.starknet.getContractFactory(contract);
    const contractInstance = contractFactory.getContractAt(address);
    const _name = name || "default";
    const accountAddress = getAddress(`account-${_name}`, NETWORK);
    const accountFactory = await hre.starknet.getContractFactory("account");
    const accountInstance = accountFactory.getContractAt(accountAddress);

    const _calldata = parseCalldataL2(calldata, NETWORK, contract, func);
    const ECDSA_PRIVATE_KEY =
      process.env[`${_name.toUpperCase()}_ECDSA_PRIVATE_KEY`];
    if (!ECDSA_PRIVATE_KEY) {
      throw new Error(`Set ${_name.toUpperCase()}_ECDSA_PRIVATE_KEY in .env`);
    }
    const l2Signer = new Signer(ECDSA_PRIVATE_KEY);
    const res = await l2Signer.sendTransaction(
      accountInstance,
      contractInstance,
      func,
      _calldata
    );
    console.log("Response:", res);
  });

task("call:l2", "Call an L2 contract")
  .addParam("contract", "Contract to call")
  .addParam("func", "Function to call")
  .addOptionalParam("calldata", "Inputs to the function")
  .setAction(async ({ contract, func, calldata }, hre) => {
    const NETWORK = hre.network.name;
    console.log(`Calling on ${NETWORK}`);
    const address = getAddress(contract, NETWORK);
    const contractFactory = await hre.starknet.getContractFactory(contract);
    const contractInstance = contractFactory.getContractAt(address);

    const _calldata = parseCalldataL2(calldata, NETWORK, contract, func);
    const res = await contractInstance.call(func, _calldata);
    console.log("Response:", res);
  });

task("call:l1", "Call an L1 contract")
  .addParam("contract", "Contract to call")
  .addParam("func", "Function to call")
  .addOptionalParam("calldata", "Inputs to the function")
  .setAction(async ({ contract, func, calldata }, hre) => {
    const contractAbiName = contract === "DAI" ? "DAIMock" : contract;
    const NETWORK = hre.network.name;
    console.log(`Calling on ${NETWORK}`);
    const address = getAddress(contract, NETWORK);
    const contractFactory = (await hre.ethers.getContractFactory(
      contractAbiName
    )) as any;
    const contractInstance = await contractFactory.attach(address);

    const _calldata = parseCalldataL1(calldata, NETWORK);
    // @ts-ignore
    const res = await contractInstance[func](..._calldata);
    console.log("Response:", res);
  });
