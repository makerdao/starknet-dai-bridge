import {
  getActiveWards,
  getAddressOfNextDeployedContract,
  getOptionalEnv,
  getRequiredEnv,
  waitForTx,
} from "@makerdao/hardhat-utils";
import { DEFAULT_STARKNET_NETWORK } from "@shardlabs/starknet-hardhat-plugin/dist/constants";
import { expect } from "chai";
import hre from "hardhat";

import {
  asDec,
  deployL1,
  deployL2,
  getAddress,
  getL2ContractAt,
  printAddresses,
  save,
  Signer,
  wards,
} from "./utils";

async function deployWormhole(): Promise<void> {
  const [l1Signer] = await hre.ethers.getSigners();

  let NETWORK;
  if (hre.network.name === "fork") {
    NETWORK = "mainnet";
  } else {
    NETWORK = hre.network.name;
  }
  const STARKNET_NETWORK = hre.starknet.network || DEFAULT_STARKNET_NETWORK;

  const L1_PAUSE_PROXY_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_PAUSE_PROXY_ADDRESS`
  );
  const L1_ESM_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_ESM_ADDRESS`
  );
  const L1_DAI_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_DAI_ADDRESS`
  );
  const L1_STARKNET_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_STARKNET_ADDRESS`
  );
  const L1_WORMHOLE_ROUTER_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_WORMHOLE_ROUTER_ADDRESS`
  );
  const L1_ESCROW_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_ESCROW_ADDRESS`
  );
  const L2_DAI_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L2_DAI_ADDRESS`
  );
  const L2_GOVERNANCE_RELAY_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L2_GOVERNANCE_RELAY_ADDRESS`
  );

  const L2_DAI_BRIDGE_ADDRESS = getOptionalEnv(
    `${NETWORK.toUpperCase()}_L2_DAI_BRIDGE_ADDRESS`
  );
  if (L2_DAI_BRIDGE_ADDRESS) {
    save("l2_dai_bridge", { address: L2_DAI_BRIDGE_ADDRESS }, NETWORK);
  }
  const L2_REGISTRY_ADDRESS = getOptionalEnv(
    `${NETWORK.toUpperCase()}_L2_REGISTRY_ADDRESS`
  );
  if (L2_REGISTRY_ADDRESS) {
    save("registry", { address: L2_REGISTRY_ADDRESS }, NETWORK);
  }

  // @ts-ignore
  const BLOCK_NUMBER = await l1Signer.provider.getBlockNumber();

  console.log(`Deploying bridge on ${NETWORK}/${STARKNET_NETWORK}`);

  const DEPLOYER_KEY = getRequiredEnv(`DEPLOYER_ECDSA_PRIVATE_KEY`);
  const l2Signer = new Signer(DEPLOYER_KEY);

  const deployer = await getL2ContractAt(
    hre,
    "account",
    getAddress("account-deployer", NETWORK)
  );
  console.log(`Deploying from account: ${deployer.address.toString()}`);

  const l2GovernanceRelay = await getL2ContractAt(
    hre,
    "l2_governance_relay",
    L2_GOVERNANCE_RELAY_ADDRESS
  );

  const futureL1DAIWormholeBridgeAddress =
    await getAddressOfNextDeployedContract(l1Signer);
  const l2DAIWormholeBridge = await deployL2(
    hre,
    "l2_dai_wormhole_bridge",
    BLOCK_NUMBER,
    {
      ward: asDec(deployer.address),
      l2_token: asDec(L2_DAI_ADDRESS),
      wormhole_bridge: asDec(futureL1DAIWormholeBridgeAddress),
      domain: asDec(L1_DAI_ADDRESS),
    }
  );

  const l1DAIWormholeBridge = await deployL1(
    hre,
    "L1DAIWormholeBridge",
    BLOCK_NUMBER,
    [
      L1_STARKNET_ADDRESS,
      L1_DAI_ADDRESS,
      l2DAIWormholeBridge.address,
      L1_ESCROW_ADDRESS,
      L1_WORMHOLE_ROUTER_ADDRESS,
    ]
  );
  expect(
    futureL1DAIWormholeBridgeAddress === l1DAIWormholeBridge.address,
    "futureL1DAIWormholeBridgeAddress != l1DAIWormholeBridge.address"
  );

  console.log("Finalizing permissions for L1DAIWormholeBridge...");
  await waitForTx(l1DAIWormholeBridge.rely(L1_PAUSE_PROXY_ADDRESS));
  await waitForTx(l1DAIWormholeBridge.rely(L1_ESM_ADDRESS));
  await waitForTx(l1DAIWormholeBridge.deny(await l1Signer.getAddress()));

  console.log("Finalizing permissions for L2DAIWormholeBridge...");
  await l2Signer.sendTransaction(deployer, l2DAIWormholeBridge, "rely", [
    asDec(L2_GOVERNANCE_RELAY_ADDRESS),
  ]);
  await l2Signer.sendTransaction(deployer, l2DAIWormholeBridge, "deny", [
    asDec(deployer.address),
  ]);

  console.log("L1 permission sanity checks...");
  expect(await getActiveWards(l1DAIWormholeBridge as any)).to.deep.eq([
    L1_PAUSE_PROXY_ADDRESS,
    L1_ESM_ADDRESS,
  ]);

  console.log("L2 wormhole bridge permission sanity checks...");
  expect(await wards(l2DAIWormholeBridge, l2GovernanceRelay)).to.deep.eq(
    BigInt(1)
  );
  expect(await wards(l2DAIWormholeBridge, deployer)).to.deep.eq(BigInt(0));
}

deployWormhole()
  .then(() => console.log("Successfully deployed"))
  .then(() => printAddresses(hre))
  .catch((err) => console.log(err));
