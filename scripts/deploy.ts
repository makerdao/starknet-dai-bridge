/**
 * Full goerli deploy including any permissions that need to be set.
 */
import {getAddressOfNextDeployedContract, getRequiredEnv} from "@makerdao/hardhat-utils";
import assert from "assert";
import fs from "fs";
import hre from "hardhat";

import { callFrom, getAddress, save } from "./utils";

async function main(): Promise<void> {
  const [signer] = await hre.ethers.getSigners();
  const NETWORK = await getL1NetworkName()

  const L1_DAI_ADDRESS = getRequiredEnv(`L1_${NETWORK.toUpperCase()}_DAI_ADDRESS`)
  const L1_STARKNET_ADDRESS = getRequiredEnv(`L1_${NETWORK.toUpperCase()}_STARKNET_ADDRESS`)

  console.log(`Deploying on ${NETWORK}`);

  if (!fs.existsSync(`./deployments/${NETWORK}`)) {
    fs.mkdirSync(`./deployments/${NETWORK}`, { recursive: true });
  }
  save("DAI", { address: L1_DAI_ADDRESS }, NETWORK);

  const account = await deployL2("account", {}, "account-auth");
  const get_this = await deployL2("get_this");
  const l2DAI = await deployL2("dai", {
    caller: BigInt(account.address).toString(),
    get_this: BigInt(get_this.address).toString(),
  });
  //TODO: don't deploy if on mainnet?
  const registry = await deployL2("registry");
  await callFrom(registry, "set_L1_address", [signer.address], account);
  const l1Escrow = await deployL1("L1Escrow");

  const futureL1DAIBridgeAddress = await getAddressOfNextDeployedContract(
    signer
  );

  const l2DAIBridge = await deployL2("l2_dai_bridge", {
    caller: BigInt(account.address).toString(),
    dai: BigInt(l2DAI.address).toString(),
    bridge: BigInt(futureL1DAIBridgeAddress).toString(),
    registry: BigInt(registry.address).toString(),
    get_this: BigInt(get_this.address).toString(),
  });
  console.log("Initializing dai");
  await callFrom(
    l2DAI,
    "rely",
    [BigInt(l2DAIBridge.address).toString()],
    account
  );

  const l1DAIBridge = await deployL1("L1DAIBridge",[
    L1_STARKNET_ADDRESS,
    L1_DAI_ADDRESS,
    l1Escrow.address,
    l2DAIBridge.address,
  ]);

  const DAIAddress = getAddress("DAI", NETWORK);
  const MAX = BigInt(2 ** 256) - BigInt(1);
  await l1Escrow.approve(DAIAddress, l1DAIBridge.address, MAX);

  const futureL1GovernanceRelayAddress = await getAddressOfNextDeployedContract(
    signer
  );

  const l2GovernanceRelay = await deployL2("l2_governance_relay",{
    l1_governance_relay: BigInt(futureL1GovernanceRelayAddress).toString(),
    dai: BigInt(l2DAI.address).toString(),
    bridge: BigInt(l2DAIBridge.address).toString(),
  });

  await deployL1("L1GovernanceRelay", [
    L1_STARKNET_ADDRESS,
    l2GovernanceRelay.address,
  ]);
}

async function deployL2(name: string, calldata: any = {}, saveName?: string) {
  console.log(`Deploying ${name}`);
  const contractFactory = await hre.starknet.getContractFactory(name);
  const  contract = await contractFactory.deploy(calldata);
  save(saveName || name, contract, await getL1NetworkName());
  return contract;
}

async function deployL1(name: string, calldata: any = [], saveName?: string) {
  console.log(`Deploying ${name}`);
  const contractFactory = await hre.ethers.getContractFactory(name);
  const contract = await contractFactory.deploy(...calldata);

  save(saveName || name, contract, await getL1NetworkName());

  await contract.deployed();

  return contract;
}

async function getL1NetworkName() {
  const [signer] = await hre.ethers.getSigners();
  const network = (await signer.provider?.getNetwork())?.name
  assert(network);
  return network;
}

main()
  .then(() => console.log("Successfully deployed"))
  .catch((err) => console.log(err));
