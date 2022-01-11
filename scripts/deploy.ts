/**
 * Full goerli deploy including any permissions that need to be set.
 */
import {
  getActiveWards,
  getAddressOfNextDeployedContract,
  getRequiredEnv,
  waitForTx,
} from "@makerdao/hardhat-utils";
import { getOptionalEnv } from "@makerdao/hardhat-utils/dist/env";
import { DEFAULT_STARKNET_NETWORK } from "@shardlabs/starknet-hardhat-plugin/dist/constants";
import { StarknetContract } from "@shardlabs/starknet-hardhat-plugin/dist/types";
import { expect } from "chai";
import hre from "hardhat";
import { ec } from "starknet";
const { genKeyPair, getStarkKey } = ec;

import { getAddress, save, Signer } from "./utils";

async function main(): Promise<void> {
  const [l1Signer] = await hre.ethers.getSigners();

  let NETWORK;
  if (hre.network.name === "fork") {
    NETWORK = "mainnet";
  } else {
    NETWORK = hre.network.name;
  }
  const STARKNET_NETWORK = hre.starknet.network || DEFAULT_STARKNET_NETWORK;

  const L1_DAI_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_DAI_ADDRESS`
  );
  const L1_STARKNET_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_STARKNET_ADDRESS`
  );
  const L1_WORMHOLE_ROUTER_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_WORMHOLE_ROUTER_ADDRESS`
  );

  // @ts-ignore
  const BLOCK_NUMBER = await l1Signer.provider.getBlockNumber();

  console.log(`Deploying on ${NETWORK}/${STARKNET_NETWORK}`);

  const keyPair = genKeyPair();
  const privateKey = keyPair.priv;
  const publicKey = BigInt(getStarkKey(keyPair));
  const l2Signer = new Signer(privateKey);
  const account = await deployL2(
    "account",
    BLOCK_NUMBER,
    { _public_key: publicKey },
    "account-deployer"
  );

  save("DAI", { address: L1_DAI_ADDRESS }, NETWORK);
  const DAIAddress = getAddress("DAI", NETWORK);

  const futureL1GovRelayAddress = await getAddressOfNextDeployedContract(
    l1Signer
  );

  const l2GovernanceRelay = await deployL2(
    "l2_governance_relay",
    BLOCK_NUMBER,
    {
      l1_governance_relay: BigInt(futureL1GovRelayAddress).toString(),
    }
  );

  const l1GovernanceRelay = await deployL1("L1GovernanceRelay", BLOCK_NUMBER, [
    L1_STARKNET_ADDRESS,
    l2GovernanceRelay.address,
  ]);

  expect(
    futureL1GovRelayAddress === l1GovernanceRelay.address,
    "futureL1GovRelayAddress != l1GovernanceRelay.address"
  );

  const l2DAI = await deployL2("dai", BLOCK_NUMBER, {
    ward: asDec(account.address),
  });

  const REGISTRY_ADDRESS = getOptionalEnv(
    `${NETWORK.toUpperCase()}_REGISTRY_ADDRESS`
  );

  if (REGISTRY_ADDRESS) {
    save("registry", { address: REGISTRY_ADDRESS }, NETWORK);
  }

  const registry = REGISTRY_ADDRESS
    ? await getL2ContractAt("registry", REGISTRY_ADDRESS)
    : await deployL2("registry", BLOCK_NUMBER);

  const l1Escrow = await deployL1("L1Escrow", BLOCK_NUMBER);

  const futureL1DAIBridgeAddress = await getAddressOfNextDeployedContract(
    l1Signer
  );
  const l2DAIBridge = await deployL2("l2_dai_bridge", BLOCK_NUMBER, {
    ward: asDec(account.address),
    dai: asDec(l2DAI.address),
    bridge: asDec(futureL1DAIBridgeAddress),
    registry: asDec(registry.address),
  });

  const futureL1DAIWormholeBridgeAddress =
    await getAddressOfNextDeployedContract(l1Signer);
  const l2DAIWormholeBridge = await deployL2(
    "l2_dai_wormhole_bridge",
    BLOCK_NUMBER,
    {
      ward: asDec(account.address),
      l2_token: asDec(l2DAI.address),
      wormhole_bridge: asDec(futureL1DAIWormholeBridgeAddress),
      domain: asDec(registry.address),
    }
  );

  const l1DAIBridge = await deployL1("L1DAIBridge", BLOCK_NUMBER, [
    L1_STARKNET_ADDRESS,
    L1_DAI_ADDRESS,
    l2DAI.address,
    l1Escrow.address,
    l2DAIBridge.address,
  ]);
  expect(
    futureL1DAIBridgeAddress === l1DAIBridge.address,
    "futureL1DAIBridgeAddress != l1DAIBridge.address"
  );

  const l1DAIWormholeBridge = await deployL1(
    "L1DAIWormholeBridge",
    BLOCK_NUMBER,
    [
      L1_STARKNET_ADDRESS,
      L1_DAI_ADDRESS,
      l2DAIWormholeBridge.address,
      l1Escrow.address,
      L1_WORMHOLE_ROUTER_ADDRESS,
    ]
  );
  expect(
    futureL1DAIWormholeBridgeAddress === l1DAIWormholeBridge.address,
    "futureL1DAIWormholeBridgeAddress != l1DAIWormholeBridge.address"
  );

  const MAX = BigInt(2 ** 256) - BigInt(1);
  await l1Escrow.approve(DAIAddress, l1DAIBridge.address, MAX);
  await l1Escrow.approve(DAIAddress, l1DAIWormholeBridge.address, MAX);

  const L1_PAUSE_PROXY_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_PAUSE_PROXY_ADDRESS`
  );

  const L1_ESM_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_ESM_ADDRESS`
  );

  console.log("Finalizing permissions for L1Escrow...");
  await waitForTx(l1Escrow.rely(L1_PAUSE_PROXY_ADDRESS));
  await waitForTx(l1Escrow.rely(L1_ESM_ADDRESS));
  await waitForTx(l1Escrow.deny(await l1Signer.getAddress()));

  console.log("Finalizing permissions for L1DAIBridge...");
  await waitForTx(l1DAIBridge.rely(L1_PAUSE_PROXY_ADDRESS));
  await waitForTx(l1DAIBridge.rely(L1_ESM_ADDRESS));
  await waitForTx(l1DAIBridge.deny(await l1Signer.getAddress()));

  console.log("Finalizing permissions for L1GovernanceRelay...");
  await waitForTx(l1GovernanceRelay.rely(L1_PAUSE_PROXY_ADDRESS));
  await waitForTx(l1GovernanceRelay.rely(L1_ESM_ADDRESS));
  await waitForTx(l1GovernanceRelay.deny(await l1Signer.getAddress()));

  console.log("Finalizing permissions for L2DAI...");
  await l2Signer.sendTransaction(account, l2DAI, "rely", [
    asDec(l2DAIBridge.address),
  ]);
  await l2Signer.sendTransaction(account, l2DAI, "rely", [
    asDec(l2GovernanceRelay.address),
  ]);
  await l2Signer.sendTransaction(account, l2DAI, "deny", [
    asDec(account.address),
  ]);

  console.log("Finalizing permissions for L2DAITokenBridge...");
  await l2Signer.sendTransaction(account, l2DAIBridge, "rely", [
    asDec(l2GovernanceRelay.address),
  ]);
  await l2Signer.sendTransaction(account, l2DAIBridge, "deny", [
    asDec(account.address),
  ]);

  console.log("Finalizing permissions for L2DAIWormholeBridge...");
  await l2Signer.sendTransaction(account, l2DAIWormholeBridge, "rely", [
    asDec(l2GovernanceRelay.address),
  ]);
  await l2Signer.sendTransaction(account, l2DAIWormholeBridge, "deny", [
    asDec(account.address),
  ]);

  console.log("L1 permission sanity checks...");
  expect(await getActiveWards(l1Escrow as any)).to.deep.eq([
    L1_PAUSE_PROXY_ADDRESS,
    L1_ESM_ADDRESS,
  ]);
  expect(await getActiveWards(l1DAIBridge as any)).to.deep.eq([
    L1_PAUSE_PROXY_ADDRESS,
    L1_ESM_ADDRESS,
  ]);
  expect(await getActiveWards(l1GovernanceRelay as any)).to.deep.eq([
    L1_PAUSE_PROXY_ADDRESS,
    L1_ESM_ADDRESS,
  ]);

  console.log("L2 permission sanity checks...");
  expect(await wards(l2DAIBridge, l2GovernanceRelay)).to.deep.eq(BigInt(1));
  expect(await wards(l2DAIBridge, account)).to.deep.eq(BigInt(0));

  expect(await wards(l2DAIWormholeBridge, l2GovernanceRelay)).to.deep.eq(
    BigInt(1)
  );
  expect(await wards(l2DAIWormholeBridge, account)).to.deep.eq(BigInt(0));

  expect(await wards(l2DAI, l2GovernanceRelay)).to.deep.eq(BigInt(1));
  expect(await wards(l2DAI, l2DAIBridge)).to.deep.eq(BigInt(1));
  expect(await wards(l2DAI, l2DAIWormholeBridge)).to.deep.eq(BigInt(1));
  expect(await wards(l2DAI, account)).to.deep.eq(BigInt(0));
}

function printAddresses() {
  const NETWORK = hre.network.name;

  const contracts = [
    "account-deployer",
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

async function wards(authable: StarknetContract, ward: StarknetContract) {
  return (await authable.call("wards", { user: asDec(ward.address) })).res;
}

function asDec(address: string): string {
  return BigInt(address).toString();
}

async function getL2ContractAt(name: string, address: string) {
  console.log(`Using existing contract: ${name} at: ${address}`);
  const contractFactory = await hre.starknet.getContractFactory(name);
  return contractFactory.getContractAt(address);
}

async function deployL2(
  name: string,
  blockNumber: number,
  calldata: any = {},
  saveName?: string
) {
  console.log(`Deploying: ${name}${(saveName && "/" + saveName) || ""}...`);
  const contractFactory = await hre.starknet.getContractFactory(name);
  const contract = await contractFactory.deploy(calldata);
  save(saveName || name, contract, hre.network.name, blockNumber);
  return contract;
}

async function deployL1(
  name: string,
  blockNumber: number,
  calldata: any = [],
  saveName?: string
) {
  console.log(`Deploying: ${name}${(saveName && "/" + saveName) || ""}...`);
  const contractFactory = await hre.ethers.getContractFactory(name);
  const contract = await contractFactory.deploy(...calldata);
  save(saveName || name, contract, hre.network.name, blockNumber);
  await contract.deployed();
  return contract;
}

main()
  .then(() => console.log("Successfully deployed"))
  .then(() => printAddresses())
  .catch((err) => console.log(err));
