import { DEFAULT_STARKNET_NETWORK } from "@shardlabs/starknet-hardhat-plugin/dist/constants";
import { expect } from "chai";
import { task } from "hardhat/config";

import {
  asDec,
  deployL1,
  deployL2,
  getActiveWards,
  getAddress,
  getAddressOfNextDeployedContract,
  getL2ContractAt,
  getOptionalEnv,
  getRequiredEnv,
  L2Signer,
  printAddresses,
  save,
  waitForTx,
  wards,
  writeAddresses,
} from "./utils";

task("deploy-bridge", "Deploy bridge").setAction(async (_, hre) => {
  const [l1Signer] = await hre.ethers.getSigners();

  let NETWORK;
  if (hre.network.name === "fork") {
    NETWORK = "mainnet";
  } else {
    NETWORK = hre.network.name;
  }
  const STARKNET_NETWORK = hre.starknet.network || DEFAULT_STARKNET_NETWORK;
  console.log(`Deploying bridge on ${NETWORK}/${STARKNET_NETWORK}`);

  const L1_DAI_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_DAI_ADDRESS`
  );
  save("DAI", { address: L1_DAI_ADDRESS }, NETWORK);

  const L1_STARKNET_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_STARKNET_ADDRESS`
  );
  const L1_PAUSE_PROXY_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_PAUSE_PROXY_ADDRESS`
  );
  const L1_ESM_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_ESM_ADDRESS`
  );

  // @ts-ignore
  const BLOCK_NUMBER = await l1Signer.provider.getBlockNumber();

  const DEPLOYER_KEY = getRequiredEnv(`DEPLOYER_ECDSA_PRIVATE_KEY`);
  const l2Signer = new L2Signer(DEPLOYER_KEY);
  const deployer = await getL2ContractAt(
    hre,
    "account",
    getAddress("account-deployer", NETWORK)
  );
  console.log(`Deploying from account: ${deployer.address.toString()}`);

  const L2_DAI_ADDRESS = getOptionalEnv(
    `${STARKNET_NETWORK.toUpperCase()}_L2_DAI_ADDRESS`
  );
  if (L2_DAI_ADDRESS) {
    save("dai", { address: L2_DAI_ADDRESS }, NETWORK);
  }

  const l2DAI = L2_DAI_ADDRESS
    ? await getL2ContractAt(hre, "dai", L2_DAI_ADDRESS)
    : await deployL2(hre, "dai", BLOCK_NUMBER, {
        ward: asDec(deployer.address),
      });

  const futureL1GovRelayAddress = await getAddressOfNextDeployedContract(
    l1Signer
  );
  const l2GovernanceRelay = await deployL2(
    hre,
    "l2_governance_relay",
    BLOCK_NUMBER,
    {
      l1_governance_relay: BigInt(futureL1GovRelayAddress).toString(),
    }
  );

  const l1GovernanceRelay = await deployL1(
    hre,
    "L1GovernanceRelay",
    BLOCK_NUMBER,
    [L1_STARKNET_ADDRESS, l2GovernanceRelay.address]
  );
  expect(
    futureL1GovRelayAddress === l1GovernanceRelay.address,
    "futureL1GovRelayAddress != l1GovernanceRelay.address"
  );

  const REGISTRY_ADDRESS = getOptionalEnv(
    `${NETWORK.toUpperCase()}_REGISTRY_ADDRESS`
  );
  if (REGISTRY_ADDRESS) {
    save("registry", { address: REGISTRY_ADDRESS }, NETWORK);
  }
  const registry = REGISTRY_ADDRESS
    ? await getL2ContractAt(hre, "registry", REGISTRY_ADDRESS)
    : await deployL2(hre, "registry", BLOCK_NUMBER);

  const l1Escrow = await deployL1(hre, "L1Escrow", BLOCK_NUMBER);

  const futureL1DAIBridgeAddress = await getAddressOfNextDeployedContract(
    l1Signer
  );
  const l2DAIBridge = await deployL2(hre, "l2_dai_bridge", BLOCK_NUMBER, {
    ward: asDec(deployer.address),
    dai: asDec(l2DAI.address),
    bridge: asDec(futureL1DAIBridgeAddress),
    registry: asDec(registry.address),
  });

  const l1DAIBridge = await deployL1(hre, "L1DAIBridge", BLOCK_NUMBER, [
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

  const MAX = BigInt(2 ** 256) - BigInt(1);
  await l1Escrow.approve(L1_DAI_ADDRESS, l1DAIBridge.address, MAX);

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

  console.log("Finalizing permissions for l2_dai...");
  await l2Signer.sendTransaction(deployer, l2DAI, "rely", [
    asDec(l2DAIBridge.address),
  ]);
  await l2Signer.sendTransaction(deployer, l2DAI, "rely", [
    asDec(l2GovernanceRelay.address),
  ]);
  await l2Signer.sendTransaction(deployer, l2DAI, "deny", [
    asDec(deployer.address),
  ]);

  console.log("Finalizing permissions for l2_dai_bridge...");
  await l2Signer.sendTransaction(deployer, l2DAIBridge, "rely", [
    asDec(l2GovernanceRelay.address),
  ]);
  await l2Signer.sendTransaction(deployer, l2DAIBridge, "deny", [
    asDec(deployer.address),
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

  console.log("L2 bridge permission sanity checks...");
  expect(await wards(l2DAIBridge, l2GovernanceRelay)).to.deep.eq(BigInt(1));
  expect(await wards(l2DAIBridge, deployer)).to.deep.eq(BigInt(0));

  console.log("L2 dai permission sanity checks...");
  expect(await wards(l2DAI, l2GovernanceRelay)).to.deep.eq(BigInt(1));
  expect(await wards(l2DAI, l2DAIBridge)).to.deep.eq(BigInt(1));
  expect(await wards(l2DAI, deployer)).to.deep.eq(BigInt(0));

  printAddresses(hre);
  writeAddresses(hre);
});
