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
  getRequiredEnvDeployer,
  getRequiredEnvDeployments,
  printAddresses,
  wards,
  writeAddresses,
} from "./utils";

task("deploy-teleport", "Deploy teleport").setAction(async (_, hre) => {
  const [l1Signer] = await hre.ethers.getSigners();

  const NETWORK = hre.network.name;
  let ADDRESS_NETWORK;
  if (NETWORK === "fork") {
    ADDRESS_NETWORK = getRequiredEnv("FORK_NETWORK").toUpperCase();
  } else {
    ADDRESS_NETWORK = NETWORK.toUpperCase();
  }
  const STARKNET_NETWORK = hre.starknet.network || DEFAULT_STARKNET_NETWORK;

  const L1_DAI_ADDRESS = getRequiredEnv(`${ADDRESS_NETWORK}_L1_DAI_ADDRESS`);
  const L1_STARKNET_ADDRESS = getRequiredEnv(
    `${ADDRESS_NETWORK}_L1_STARKNET_ADDRESS`
  );
  const L1_WORMHOLE_ROUTER_ADDRESS = getRequiredEnv(
    `${ADDRESS_NETWORK}_L1_WORMHOLE_ROUTER_ADDRESS`
  );
  const L1_ESCROW_ADDRESS = getRequiredEnvDeployments(
    `${ADDRESS_NETWORK}_L1_ESCROW_ADDRESS`
  );
  const L2_DAI_ADDRESS = getRequiredEnvDeployments(
    `${ADDRESS_NETWORK}_L2_DAI_ADDRESS`
  );
  const L2_GOVERNANCE_RELAY_ADDRESS = getRequiredEnvDeployments(
    `${ADDRESS_NETWORK}_L2_GOVERNANCE_RELAY_ADDRESS`
  );
  const DENY_DEPLOYER = getRequiredEnv("DENY_DEPLOYER") === "true";

  // @ts-ignore
  const BLOCK_NUMBER = await l1Signer.provider.getBlockNumber();

  console.log(`Deploying gateway on ${NETWORK}/${STARKNET_NETWORK}`);

  const DEPLOYER_KEY = getRequiredEnvDeployer(`DEPLOYER_ECDSA_PRIVATE_KEY`);
  const deployer = await hre.starknet.getAccountFromAddress(
    getAddress("account-deployer", NETWORK),
    DEPLOYER_KEY,
    "OpenZeppelin"
  );
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
    `${ADDRESS_NETWORK}-SLAVE-STARKNET-1`,
    "utf8"
  ).toString("hex")}`;
  const l2DAITeleportGateway = await deployL2(
    hre,
    "l2_dai_teleport_gateway",
    BLOCK_NUMBER,
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
    BLOCK_NUMBER,
    [
      L1_STARKNET_ADDRESS,
      L1_DAI_ADDRESS,
      l2DAITeleportGateway.address,
      L1_ESCROW_ADDRESS,
      L1_WORMHOLE_ROUTER_ADDRESS,
    ]
  );
  expect(
    futureL1DAITeleportGatewayAddress === l1DAITeleportGateway.address,
    "futureL1DAITeleportGatewayAddress != l1DAITeleportGateway.address"
  );

  console.log("Finalizing permissions for l2_dai_teleport_gateway...");
  await deployer.invoke(l2DAITeleportGateway, "rely", {
    user: asDec(L2_GOVERNANCE_RELAY_ADDRESS),
  });
  if (DENY_DEPLOYER) {
    await deployer.invoke(l2DAITeleportGateway, "deny", {
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

  printAddresses(hre, true);
  writeAddresses(hre, true);
});
