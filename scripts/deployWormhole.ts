import { DEFAULT_STARKNET_NETWORK } from "@shardlabs/starknet-hardhat-plugin/dist/constants";
import { expect } from "chai";
import { task } from "hardhat/config";

import {
  asDec,
  deployL1,
  deployL2,
  getAddress,
  getAddressOfNextDeployedContract,
  getL2ContractAt,
  getRequiredEnv,
  L2Signer,
  printAddresses,
  wards,
  writeAddresses,
} from "./utils";

task("deploy-wormhole", "Deploy wormhole").setAction(async (_, hre) => {
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
  const L1_ESCROW_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_ESCROW_ADDRESS`
  );
  const L2_DAI_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L2_DAI_ADDRESS`
  );
  const L2_GOVERNANCE_RELAY_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L2_GOVERNANCE_RELAY_ADDRESS`
  );
  const DENY_DEPLOYER = !!getRequiredEnv("DENY_DEPLOYER");

  // @ts-ignore
  const BLOCK_NUMBER = await l1Signer.provider.getBlockNumber();

  console.log(`Deploying gateway on ${NETWORK}/${STARKNET_NETWORK}`);

  const DEPLOYER_KEY = getRequiredEnv(`DEPLOYER_ECDSA_PRIVATE_KEY`);
  const l2Signer = new L2Signer(DEPLOYER_KEY);

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

  const futureL1DAIWormholeGatewayAddress =
    await getAddressOfNextDeployedContract(l1Signer);
  const l2DAIWormholeGateway = await deployL2(
    hre,
    "l2_dai_wormhole_gateway",
    BLOCK_NUMBER,
    {
      ward: asDec(deployer.address),
      dai: asDec(L2_DAI_ADDRESS),
      wormhole_gateway: asDec(futureL1DAIWormholeGatewayAddress),
      domain: asDec(L1_DAI_ADDRESS),
    }
  );

  const l1DAIWormholeGateway = await deployL1(
    hre,
    "L1DAIWormholeGateway",
    BLOCK_NUMBER,
    [
      L1_STARKNET_ADDRESS,
      L1_DAI_ADDRESS,
      l2DAIWormholeGateway.address,
      L1_ESCROW_ADDRESS,
      L1_WORMHOLE_ROUTER_ADDRESS,
    ]
  );
  expect(
    futureL1DAIWormholeGatewayAddress === l1DAIWormholeGateway.address,
    "futureL1DAIWormholeGatewayAddress != l1DAIWormholeGateway.address"
  );

  console.log("Finalizing permissions for l2_dai_wormhole_gateway...");
  await l2Signer.sendTransaction(deployer, l2DAIWormholeGateway, "rely", [
    asDec(L2_GOVERNANCE_RELAY_ADDRESS),
  ]);
  if (DENY_DEPLOYER) {
    await l2Signer.sendTransaction(deployer, l2DAIWormholeGateway, "deny", [
      asDec(deployer.address),
    ]);
  }

  console.log("L2 wormhole gateway permission sanity checks...");
  expect(await wards(l2DAIWormholeGateway, l2GovernanceRelay)).to.deep.eq(
    BigInt(1)
  );
  expect(await wards(l2DAIWormholeGateway, deployer)).to.deep.eq(
    BigInt(!DENY_DEPLOYER)
  );

  printAddresses(hre);
  writeAddresses(hre);
});
