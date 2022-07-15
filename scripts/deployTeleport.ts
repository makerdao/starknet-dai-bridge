import { expect } from "chai";
import { task } from "hardhat/config";

import {
  asDec,
  deployL1,
  deployL2,
  getAccount,
  getAddressOfNextDeployedContract,
  getL2ContractAt,
  getNetwork,
  getRequiredEnv,
  getRequiredEnvDeployments,
  printAddresses,
  wards,
  writeAddresses,
} from "./utils";

task("deploy-teleport", "Deploy teleport").setAction(async (_, hre) => {
  const [l1Signer] = await hre.ethers.getSigners();

  const { network, NETWORK } = getNetwork(hre);

  const L1_DAI_ADDRESS = getRequiredEnv(`${NETWORK}_L1_DAI_ADDRESS`);
  const L1_STARKNET_ADDRESS = getRequiredEnv(`${NETWORK}_L1_STARKNET_ADDRESS`);
  const L1_TELEPORT_ROUTER_ADDRESS = getRequiredEnv(
    `${NETWORK}_L1_TELEPORT_ROUTER_ADDRESS`
  );
  const L1_ESCROW_ADDRESS = getRequiredEnvDeployments(
    `${NETWORK}_L1_ESCROW_ADDRESS`
  );
  const L2_DAI_ADDRESS = getRequiredEnvDeployments(`${NETWORK}_L2_DAI_ADDRESS`);
  const L2_GOVERNANCE_RELAY_ADDRESS = getRequiredEnvDeployments(
    `${NETWORK}_L2_GOVERNANCE_RELAY_ADDRESS`
  );
  const DENY_DEPLOYER = getRequiredEnv("DENY_DEPLOYER") === "true";

  console.log(`Deploying gateway on ${network}`);

  const deployer = await getAccount("deployer", hre);
  console.log(
    `Deploying from account: ${deployer.starknetContract.address.toString()}`
  );

  const l2GovernanceRelay = await getL2ContractAt(
    hre,
    "l2_governance_relay",
    L2_GOVERNANCE_RELAY_ADDRESS
  );

  const futureL1DAITeleportGatewayAddress =
    await getAddressOfNextDeployedContract(l1Signer);

  const L2_SOURCE_DOMAIN = `0x${Buffer.from(
    `${NETWORK.replace(/[_]/g, "-")}-SLAVE-STARKNET-1`,
    "utf8"
  ).toString("hex")}`;
  const l2DAITeleportGateway = await deployL2(
    hre,
    "l2_dai_teleport_gateway",
    {
      ward: asDec(deployer.starknetContract.address),
      dai: asDec(L2_DAI_ADDRESS),
      teleport_gateway: asDec(futureL1DAITeleportGatewayAddress),
      domain: L2_SOURCE_DOMAIN,
    }
  );

  const l1DAITeleportGateway = await deployL1(
    hre,
    "L1DAITeleportGateway",
    [
      L1_STARKNET_ADDRESS,
      L1_DAI_ADDRESS,
      l2DAITeleportGateway.address,
      L1_ESCROW_ADDRESS,
      L1_TELEPORT_ROUTER_ADDRESS,
    ]
  );
  expect(
    futureL1DAITeleportGatewayAddress === l1DAITeleportGateway.address,
    "futureL1DAITeleportGatewayAddress != l1DAITeleportGateway.address"
  );

  console.log("Finalizing permissions for l2_dai_teleport_gateway...");
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
    "L1_DAI_TELEPORT_GATEWAY_ADDRESS": l1DAITeleportGateway.address,
    "L2_DAI_TELEPORT_GATEWAY_ADDRESS": l2DAITeleportGateway.address,
  };
  printAddresses(hre, addresses);
  writeAddresses(hre, addresses);
});
