/**
 * Full goerli deploy including any permissions that need to be set.
 */
import {
  getAddressOfNextDeployedContract,
  getRequiredEnv,
} from "@makerdao/hardhat-utils";
import { getOptionalEnv } from "@makerdao/hardhat-utils/dist/env";
import { DEFAULT_STARKNET_NETWORK } from "@shardlabs/starknet-hardhat-plugin/dist/constants";
import { ethers } from "ethers";
import fs from "fs";
import hre from "hardhat";

import { callFrom, getAddress, save } from "./utils";

async function main(): Promise<void> {
  const [signer] = await hre.ethers.getSigners();

  const NETWORK = hre.network.name;
  const STARKNET_NETWORK = hre.starknet.network || DEFAULT_STARKNET_NETWORK;

  const L1_DAI_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_DAI_ADDRESS`
  );
  const L1_STARKNET_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_STARKNET_ADDRESS`
  );

  console.log(`Deploying on ${NETWORK}/${STARKNET_NETWORK}`);

  if (!fs.existsSync(`./deployments/${NETWORK}`)) {
    fs.mkdirSync(`./deployments/${NETWORK}`, { recursive: true });
  }
  save("DAI", { address: L1_DAI_ADDRESS }, NETWORK);

  const account = await deployL2("account", {}, "account-auth");

  const l2DAI = await deployL2("dai", {
    caller: BigInt(account.address).toString(),
  });

  const REGISTRY_ADDRESS = getOptionalEnv(
    `${NETWORK.toUpperCase()}_REGISTRY_ADDRESS`
  );

  if (REGISTRY_ADDRESS) {
    console.log(`Using existing registry: ${REGISTRY_ADDRESS}`);
    save("registry", { address: REGISTRY_ADDRESS }, NETWORK);
  }

  const registry = REGISTRY_ADDRESS
    ? await getL2ContractAt("registry", REGISTRY_ADDRESS)
    : await deployL2("registry");

  // await callFrom(registry, "set_L1_address", [signer.address], account);
  const l1Escrow = await deployL1("L1Escrow");

  const futureL1DAIBridgeAddress = await getAddressOfNextDeployedContract(
    signer
  );

  const l2DAIBridge = await deployL2("l2_dai_bridge", {
    caller: BigInt(account.address).toString(), //TODO: l2_gov_relay
    dai: BigInt(l2DAI.address).toString(),
    bridge: BigInt(futureL1DAIBridgeAddress).toString(),
    registry: BigInt(registry.address).toString(),
  });

  console.log("Initializing dai");

  // TODO: turn into spell
  await callFrom(
    l2DAI,
    "rely",
    [BigInt(l2DAIBridge.address).toString()],
    account
  );

  const l1DAIBridge = await deployL1("L1DAIBridge", [
    L1_STARKNET_ADDRESS,
    L1_DAI_ADDRESS,
    l1Escrow.address,
    l2DAIBridge.address,
  ]);

  const DAIAddress = getAddress("DAI", NETWORK);
  const MAX = BigInt(2 ** 256) - BigInt(1);
  await l1Escrow.approve(DAIAddress, l1DAIBridge.address, MAX);

  const futureL1GovRelayAddress = await getAddressOfNextDeployedContract(
    signer
  );

  const l2GovernanceRelay = await deployL2("l2_governance_relay", {
    l1_governance_relay: BigInt(futureL1GovRelayAddress).toString(),
    dai: BigInt(l2DAI.address).toString(),
    bridge: BigInt(l2DAIBridge.address).toString(),
  });

  await deployL1("L1GovernanceRelay", [
    L1_STARKNET_ADDRESS,
    l2GovernanceRelay.address,
  ]);
}

function printAddresses() {
  const NETWORK = hre.network.name;

  const contracts = [
    "account-auth",
    "dai",
    "registry",
    "L1Escrow",
    "l2_dai_bridge",
    "L1DAIBridge",
    "l2_governance_relay",
    "L1GovernanceRelay",
  ];

  const addresses = contracts.reduce(
    (a, c) => Object.assign(a, { [c]: getAddress(c, NETWORK) }),
    {}
  );

  console.log(addresses);
}

async function getL2ContractAt(name: string, address: string) {
  console.log(`Deploying ${name}`);
  const contractFactory = await hre.starknet.getContractFactory(name);
  return contractFactory.getContractAt(address);
}

async function deployL2(name: string, calldata: any = {}, saveName?: string) {
  console.log(`Deploying ${name}${(saveName && "/" + saveName) || ""}`);
  const contractFactory = await hre.starknet.getContractFactory(name);
  const contract = await contractFactory.deploy(calldata);
  save(saveName || name, contract, hre.network.name);
  return contract;
}

async function deployL1(name: string, calldata: any = [], saveName?: string) {
  const options = {
    gasPrice: await hre.ethers.provider.getGasPrice(),
  };
  console.log(
    `Deploying ${name}${(saveName && "/" + saveName) || ""}`,
    `gas price: ${ethers.utils.formatUnits(options.gasPrice, "gwei")} gwei`
  );
  const contractFactory = await hre.ethers.getContractFactory(name);
  const contract = await contractFactory.deploy(...calldata, options);
  save(saveName || name, contract, hre.network.name);
  await contract.deployed();
  return contract;
}

main()
  .then(() => console.log("Successfully deployed"))
  .then(() => printAddresses())
  .catch((err) => console.log(err));
