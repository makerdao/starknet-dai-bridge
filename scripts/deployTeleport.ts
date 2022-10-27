import { expect } from "chai";
import { task } from "hardhat/config";

import {
  asDec,
  deployL1,
  deployL2,
  getAccount,
  getAddressOfNextDeployedContract,
  getL2ContractAt,
  getNetwork, getOptionalEnv,
  getRequiredEnv,
  l2String,
  printAddresses,
  wards,
} from "./utils";

task("deploy-teleport", "Deploy teleport").setAction(async (_, hre) => {
  const [l1Signer] = await hre.ethers.getSigners();

  const { network, NETWORK } = getNetwork(hre);

  const L1_DAI_ADDRESS = getRequiredEnv(`${NETWORK}_L1_DAI_ADDRESS`);
  const L1_STARKNET_ADDRESS = getRequiredEnv(`${NETWORK}_L1_STARKNET_ADDRESS`);
  const L1_TELEPORT_ROUTER_ADDRESS = getRequiredEnv(
    `${NETWORK}_L1_TELEPORT_ROUTER_ADDRESS`
  );
  const L1_ESCROW_ADDRESS = getRequiredEnv(`${NETWORK}_L1_ESCROW_ADDRESS`);
  const L2_DAI_ADDRESS = getRequiredEnv(`${NETWORK}_L2_DAI_ADDRESS`);
  const L2_GOVERNANCE_RELAY_ADDRESS = getRequiredEnv(
    `${NETWORK}_L2_GOVERNANCE_RELAY_ADDRESS`
  );
  const DENY_DEPLOYER = getRequiredEnv("DENY_DEPLOYER") === "true";

  const L2_SRC_DOMAIN = l2String(getRequiredEnv(`${NETWORK}_SRC_DOMAIN`));
  const L2_TRG_DOMAIN = l2String(getRequiredEnv(`${NETWORK}_TRG_DOMAIN`));

  const TOKEN = getOptionalEnv(`${NETWORK}_TOKEN`);

  const deploymentOptions = TOKEN ? { token: TOKEN } : {};

  if (TOKEN) {
    console.log(`Using token: ${TOKEN}`);
  }

  console.log(`Deploying gateway on ${network}`);

  const deployer = await getAccount("deployer", hre);

  console.log("From");
  console.log(
    `\tl2 account: ${deployer.starknetContract.address.toString()}`
  );
  console.log(
    `\tl1 account: ${(await hre.ethers.getSigners())[0].address.toString()}`
  );

  console.log("Deny deployer:", DENY_DEPLOYER);

  const l2GovernanceRelay = await getL2ContractAt(
    hre,
    "l2_governance_relay",
    L2_GOVERNANCE_RELAY_ADDRESS
  );

  const futureL1DAITeleportGatewayAddress =
    await getAddressOfNextDeployedContract(l1Signer);

  const l2DAITeleportGateway = await deployL2(hre, "l2_dai_teleport_gateway", {
    ward: asDec(deployer.starknetContract.address),
    dai: asDec(L2_DAI_ADDRESS),
    teleport_gateway: asDec(futureL1DAITeleportGatewayAddress),
    domain: L2_SRC_DOMAIN,
  }, deploymentOptions);

  console.log(`Adding ${L2_TRG_DOMAIN} to valid domains`);
  await deployer.estimateAndInvoke(l2DAITeleportGateway, "file", {
    what: l2String("valid_domains"),
    domain: L2_TRG_DOMAIN,
    data: 1,
  });

  const l1DAITeleportGateway = await deployL1(hre, "L1DAITeleportGateway", [
    L1_STARKNET_ADDRESS,
    L1_DAI_ADDRESS,
    l2DAITeleportGateway.address,
    L1_ESCROW_ADDRESS,
    L1_TELEPORT_ROUTER_ADDRESS,
  ]);
  expect(
    futureL1DAITeleportGatewayAddress === l1DAITeleportGateway.address,
    "futureL1DAITeleportGatewayAddress != l1DAITeleportGateway.address"
  );

  console.log("Finalizing permissions for l2_dai_teleport_gateway...");
  console.log("L2_GOVERNANCE_RELAY_ADDRESS:", L2_GOVERNANCE_RELAY_ADDRESS);
  console.log("l2DAITeleportGateway", l2DAITeleportGateway.address);
  await deployer.estimateAndInvoke(l2DAITeleportGateway, "rely", {
    user: asDec(L2_GOVERNANCE_RELAY_ADDRESS),
  });
  if (DENY_DEPLOYER) {
    await deployer.estimateAndInvoke(l2DAITeleportGateway, "deny", {
      user: asDec(deployer.starknetContract.address),
    });
  }

  console.log("L2 teleport gateway permission sanity checks...");
  expect(await wards(l2DAITeleportGateway, l2GovernanceRelay)).to.deep.eq(
    BigInt(1)
  );
  expect(
    await wards(l2DAITeleportGateway, deployer.starknetContract)
  ).to.deep.eq(BigInt(!DENY_DEPLOYER));

  const addresses = {
    L1_DAI_TELEPORT_GATEWAY: l1DAITeleportGateway.address,
    L2_DAI_TELEPORT_GATEWAY: l2DAITeleportGateway.address,
  };
  printAddresses(hre, addresses);
});
