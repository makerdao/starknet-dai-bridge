import * as dotenv from "dotenv";
import { Contract } from "ethers";
import { DEFAULT_STARKNET_NETWORK } from "@shardlabs/starknet-hardhat-plugin/dist/src/constants";
import { Interface } from "ethers/lib/utils";
import { task } from "hardhat/config";
import { getAccount, getNetwork } from "./utils";
dotenv.config();

import {
  getAddress,
  getRequiredEnvDeployer,
  parseCalldataL1,
  parseCalldataL2,
  toBytes32,
} from "./utils";

task("invoke:l2", "Invoke an L2 contract")
  .addParam("contract", "Contract to call")
  .addParam("func", "Function to call")
  .addOptionalParam("calldata", "Inputs to the function")
  .addOptionalParam("name", "Account name to execute from")
  .setAction(async ({ contract, func, calldata, name }, hre) => {
    const { network, NETWORK } = getNetwork(hre);
    console.log(`Calling on ${NETWORK}`);
    const address = getAddress(contract, network);
    const contractFactory = await hre.starknet.getContractFactory(contract);
    const contractInstance = contractFactory.getContractAt(address);
    const _name = name || "default";
    const _calldata = parseCalldataL2(calldata, NETWORK, contract, func);
    const account = await getAccount(_name, hre);
    const res = await account.invoke(contractInstance, func, _calldata);
    console.log("Response:", res);
  });

task("call:l2", "Call an L2 contract")
  .addParam("contract", "Contract to call")
  .addParam("func", "Function to call")
  .addOptionalParam("calldata", "Inputs to the function")
  .setAction(async ({ contract, func, calldata }, hre) => {
    const { network, NETWORK } = getNetwork(hre);
    console.log(`Calling on ${NETWORK}`);
    const address = getAddress(contract, network);
    const contractFactory = await hre.starknet.getContractFactory(contract);
    const contractInstance = contractFactory.getContractAt(address);

    const _calldata = parseCalldataL2(calldata, network, contract, func);
    const res = await contractInstance.call(func, _calldata);
    console.log("Response:", res);
  });

task("call:l1", "Call an L1 contract")
  .addParam("contract", "Contract to call")
  .addParam("func", "Function to call")
  .addOptionalParam("calldata", "Inputs to the function")
  .setAction(async ({ contract, func, calldata }, hre) => {
    const contractAbiName = contract === "DAI" ? "DAIMock" : contract;
    const { network, NETWORK } = getNetwork(hre);
    console.log(`Calling on ${NETWORK}`);
    const address = getAddress(contract, network);
    const contractFactory = (await hre.ethers.getContractFactory(
      contractAbiName
    )) as any;
    const contractInstance = await contractFactory.attach(address);
    const _calldata = parseCalldataL1(calldata, network);
    let res;
    if (func === "finalizeRegisterTeleport") {
      res = await contractInstance[func]([
        toBytes32(_calldata[0]),
        toBytes32(_calldata[1]),
        toBytes32(_calldata[2]),
        toBytes32(_calldata[3]),
        ..._calldata.slice(4),
      ]);
    } else {
      res = await contractInstance[func](..._calldata);
    }
    console.log(`Response: ${res}`);
  });

task("call-oracle", "Call an L1 contract").setAction(async (_, hre) => {
  const [l1Signer] = await hre.ethers.getSigners();

  const oracleAuth = new Contract(
    "0x70FEdb21fF40E8bAf9f1a631fA9c34F179f29442",
    new Interface([
      "function requestMint((bytes32,bytes32,bytes32,bytes32,uint128,uint80,uint48),bytes,uint256,uint256)",
      "function getGUIDHash((bytes32,bytes32,bytes32,bytes32,uint128,uint80,uint48)) view returns (bytes32)",
      "function signers(address) view returns(uint256)",
    ]),
    l1Signer
  );

  await oracleAuth.requestMint(
    [
      "0x0474f45524c492d534c4156452d535441524b4e45542d3100000000000000000",
      "0x474f45524c492d4d41535445522d310000000000000000000000000000000000",
      "0x000000000000000000000000273b13017d681180840f08e951368cb199a783bb",
      "0x000000000000000000000000273b13017d681180840f08e951368cb199a783bb",
      "0x0000000000000000000000000000000000000000000000000de0b6b3a7640000",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    ],
    "0xbfb1119fe4781d65e92b67cba331109d288cc781c20363e0e921d3a0c3cc83f567a3128ab186f84fe62109ac6e946218280e4186b0dddf95a3a55e98bf5ce93d1b",
    0,
    0
  );
});
