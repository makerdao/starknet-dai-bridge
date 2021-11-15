/**
 * Full goerli deploy including any permissions that need to be set.
 */
import fs from "fs";
import { getAddressOfNextDeployedContract } from "@makerdao/hardhat-utils";
import hre from "hardhat";

import { callFrom, getAddress, save } from "./utils";

const L1_GOERLI_DAI_ADDRESS = "0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844";
const L1_GOERLI_STARKNET_ADDRESS = "0x5e6229F2D4d977d20A50219E521dE6Dd694d45cc";
let NETWORK: string;

async function main() {
  const [signer] = await hre.ethers.getSigners();
  if (signer.provider) {
    const network = await signer.provider.getNetwork();
    NETWORK = network.name;
  }
  console.log(`Deploying on ${NETWORK}`);

  if (!fs.existsSync(`./deployments/${NETWORK}`)) {
    fs.mkdirSync(`./deployments/${NETWORK}`, { recursive: true });
  }
  save("DAI", { address: L1_GOERLI_DAI_ADDRESS }, NETWORK);
  
  const account = await deploy(hre, "account", 2, {}, "account-auth");
  const get_this = await deploy(hre, "get_this", 2, {});
  const l2DAI = await deploy(hre, "dai", 2, {
    caller: BigInt(account.address).toString(),
    get_this: BigInt(get_this.address).toString(),
  });
  const registry = await deploy(hre, "registry", 2, {});
  await callFrom(registry, "register", [signer.address], account);
  const l1Escrow = await deploy(hre, "L1Escrow", 1, []);

  const futureL1DAIBridgeAddress = await getAddressOfNextDeployedContract(signer);

  const l2DAIBridge = await deploy(hre, "l2_dai_bridge", 2, {
    caller: BigInt(account.address).toString(),
    dai: BigInt(l2DAI.address).toString(),
    bridge: BigInt(futureL1DAIBridgeAddress).toString(),
    registry: BigInt(registry.address).toString(),
    get_this: BigInt(get_this.address).toString(),
  });
  console.log("Initializing dai");
  await callFrom(l2DAI, "rely", [BigInt(l2DAIBridge.address).toString()], account);

  const l1DAIBridge = await deploy(hre, "L1DAIBridge", 1, [
    L1_GOERLI_STARKNET_ADDRESS,
    L1_GOERLI_DAI_ADDRESS,
    l1Escrow.address,
    l2DAIBridge.address,
  ]);

  const DAIAddress = getAddress("DAI", NETWORK);
  const MAX = BigInt(2 ** 256) - BigInt(1);
  await l1Escrow.approve(DAIAddress, l1DAIBridge.address, MAX);

  const futureL1GovernanceRelayAddress = await getAddressOfNextDeployedContract(signer);

  const l2GovernanceRelay = await deploy(hre, "l2_governance_relay", 2, {
    l1_governance_relay: BigInt(futureL1GovernanceRelayAddress).toString(),
    dai: BigInt(l2DAI.address).toString(),
    bridge: BigInt(l2DAIBridge.address).toString(),
  });

  const l1GovernanceRelay = await deploy(hre, "L1GovernanceRelay", 1, [
    L1_GOERLI_STARKNET_ADDRESS,
    l2GovernanceRelay.address,
  ]);
}

async function deploy(
  hre: any,
  contractName: string,
  layer: 1 | 2,
  calldata: any,
  saveName?: string
) {
  try {
    const network = layer === 1 ? "ethers" : "starknet";
    console.log(`Deploying ${contractName}`);
    const contractFactory = await hre[network].getContractFactory(contractName);
    let contract;
    if (layer === 1) {
      contract = await contractFactory.deploy(...calldata);
    } else {
      contract = await contractFactory.deploy(calldata);
    }
    const fileName = saveName || contractName;
    save(fileName, contract, NETWORK);
    if (layer === 1) {
      await contract.deployed();
    }
    return contract;
  } catch (err) {
    console.log(err);
  }
}

main();
