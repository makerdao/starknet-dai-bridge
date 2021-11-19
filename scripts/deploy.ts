/**
 * Full goerli deploy including any permissions that need to be set.
 */
import {
  getActiveWards,
  getAddressOfNextDeployedContract,
  getRequiredEnv, waitForTx,
} from "@makerdao/hardhat-utils";
import { getOptionalEnv } from "@makerdao/hardhat-utils/dist/env";
import { DEFAULT_STARKNET_NETWORK } from "@shardlabs/starknet-hardhat-plugin/dist/constants";
import { ethers } from "ethers";
import hre from "hardhat";

import { callFrom, getAddress, save } from "./utils";
import {expect} from "chai";

async function main(): Promise<void> {
  const [l1Signer] = await hre.ethers.getSigners();

  const NETWORK = hre.network.name;
  const STARKNET_NETWORK = hre.starknet.network || DEFAULT_STARKNET_NETWORK;

  const L1_DAI_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_DAI_ADDRESS`
  );
  const L1_STARKNET_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_STARKNET_ADDRESS`
  );

  console.log(`Deploying on ${NETWORK}/${STARKNET_NETWORK}`);

  save("DAI", { address: L1_DAI_ADDRESS }, NETWORK);
  const DAIAddress = getAddress("DAI", NETWORK);

  const futureL1GovRelayAddress = await getAddressOfNextDeployedContract(
    l1Signer
  );

  const l2GovernanceRelay = await deployL2("l2_governance_relay", {
    l1_governance_relay: BigInt(futureL1GovRelayAddress).toString(),
  });

  const l1GovernanceRelay = await deployL1("L1GovernanceRelay", [
    L1_STARKNET_ADDRESS,
    l2GovernanceRelay.address,
  ]);

  expect(futureL1GovRelayAddress === l1GovernanceRelay.address, "futureL1GovRelayAddress != l1GovernanceRelay.address")
  
  // ---------------------------
  const l2DAI = await deployL2("dai", {
    ward: BigInt(l2GovernanceRelay.address).toString(),
  });

  const REGISTRY_ADDRESS = getOptionalEnv(
    `${NETWORK.toUpperCase()}_REGISTRY_ADDRESS`
  );

  if (REGISTRY_ADDRESS) {
    save("registry", { address: REGISTRY_ADDRESS }, NETWORK);
  }

  const registry = REGISTRY_ADDRESS
    ? await getL2ContractAt("registry", REGISTRY_ADDRESS)
    : await deployL2("registry");

  const l1Escrow = await deployL1("L1Escrow");

  const futureL1DAIBridgeAddress = await getAddressOfNextDeployedContract(
    l1Signer
  );

  // ---------------------------
  const l2DAIBridge = await deployL2("l2_dai_bridge", {
    ward: BigInt(l2GovernanceRelay.address).toString(),
    dai: BigInt(l2DAI.address).toString(),
    bridge: BigInt(futureL1DAIBridgeAddress).toString(),
    registry: BigInt(registry.address).toString(),
  });

  const l1DAIBridge = await deployL1("L1DAIBridge", [
    L1_STARKNET_ADDRESS,
    L1_DAI_ADDRESS,
    l1Escrow.address,
    l2DAIBridge.address,
  ]);

  expect(futureL1DAIBridgeAddress === l1DAIBridge.address, "futureL1DAIBridgeAddress != l1DAIBridge.address")

  const MAX = BigInt(2 ** 256) - BigInt(1);
  await l1Escrow.approve(DAIAddress, l1DAIBridge.address, MAX);

  // TODO: turn into spell
  await callFrom(
    l2DAI,
    "rely",
    [BigInt(l2DAIBridge.address).toString()],
    account
  );

  const L1_PAUSE_PROXY_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_PAUSE_PROXY_ADDRESS`
  );

  const L1_ESM_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_ESM_ADDRESS`
  );

  console.log('Finalizing permissions for L1Escrow...')
  await waitForTx(l1Escrow.rely(L1_PAUSE_PROXY_ADDRESS, opts.L1_TX_OPTS))
  await waitForTx(l1Escrow.rely(L1_ESM_ADDRESS, opts.L1_TX_OPTS))
  await waitForTx(l1Escrow.deny(await l1Signer.getAddress(), opts.L1_TX_OPTS))

  console.log('Finalizing permissions for L2DAI...')
  await waitForTx(l2Dai.rely(l2DAITokenBridge.address, opts.L2_TX_OPTS))
  await waitForTx(l2Dai.rely(l2GovernanceRelay.address, opts.L2_TX_OPTS))
  await waitForTx(l2Dai.deny(await opts.l2Deployer.getAddress(), opts.L2_TX_OPTS))

  console.log('Finalizing permissions for L1DAITokenBridge...')
  await waitForTx(l1DAIBridge.rely(L1_PAUSE_PROXY_ADDRESS, opts.L1_TX_OPTS))
  await waitForTx(l1DAIBridge.rely(L1_ESM_ADDRESS, opts.L1_TX_OPTS))
  await waitForTx(l1DAIBridge.deny(await l1Signer.getAddress(), opts.L1_TX_OPTS))

  console.log('Finalizing permissions for L2DAITokenBridge...')
  await waitForTx(l2DAITokenBridge.rely(l2GovernanceRelay.address, opts.L2_TX_OPTS))
  await waitForTx(l2DAITokenBridge.deny(await opts.l2Deployer.getAddress(), opts.L2_TX_OPTS))

  console.log('Finalizing permissions for l1GovernanceRelay...')
  await waitForTx(l1GovernanceRelay.rely(L1_PAUSE_PROXY_ADDRESS, opts.L1_TX_OPTS))
  await waitForTx(l1GovernanceRelay.rely(L1_ESM_ADDRESS, opts.L1_TX_OPTS))
  await waitForTx(l1GovernanceRelay.deny(await l1Signer.getAddress(), opts.L1_TX_OPTS))

  console.log('L1 permission sanity checks...')
  expect(await getActiveWards(l1Escrow)).to.deep.eq([L1_PAUSE_PROXY_ADDRESS, L1_ESM_ADDRESS])
  expect(await getActiveWards(l1DAIBridge)).to.deep.eq([L1_PAUSE_PROXY_ADDRESS, L1_ESM_ADDRESS])
  expect(await getActiveWards(l1GovernanceRelay)).to.deep.eq([L1_PAUSE_PROXY_ADDRESS, L1_ESM_ADDRESS])

  console.log('L2 permission sanity checks...')
  expect(await getActiveWards(l2DAIBridge)).to.deep.eq([l2GovernanceRelay.address])
  expect(await getActiveWards(l2Dai)).to.deep.eq([l2DAITokenBridge.address, l2GovernanceRelay.address])


  // TODO: turn into spell
  await callFrom(
    l2DAI,
    "rely",
    [BigInt(l2DAIBridge.address).toString()],
    account
  );



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
  console.log(`Using existing contract: ${name} at: ${address}`);
  const contractFactory = await hre.starknet.getContractFactory(name);
  return contractFactory.getContractAt(address);
}

async function deployL2(name: string, calldata: any = {}, saveName?: string) {
  console.log(`Deploying: ${name}${(saveName && "/" + saveName) || ""}...`);
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
    `Deploying: ${name}${(saveName && "/" + saveName) || ""}`,
    `gas price: ${ethers.utils.formatUnits(options.gasPrice, "gwei")} gwei...`
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
