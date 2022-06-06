import { ArgentAccount } from "@shardlabs/starknet-hardhat-plugin/dist/src/account";
import { expect } from "chai";
import { utils } from "ethers";
import { task } from "hardhat/config";

import {
  asDec,
  deployL1,
  deployL2,
  getAccount,
  getActiveWards,
  getAddressOfNextDeployedContract,
  getL2ContractAt,
  getNetwork,
  getOptionalEnv,
  getRequiredEnv,
  printAddresses,
  save,
  waitForTx,
  wards,
  writeAddresses,
} from "./utils";

task("deploy-bridge", "Deploy bridge").setAction(async (_, hre) => {
  const [l1Signer] = await hre.ethers.getSigners();

  const { network, NETWORK } = getNetwork(hre);

  console.log(`Deploying bridge on: ${network}`);

  const TOKEN = getOptionalEnv(`${NETWORK}_TOKEN`);

  const deploymentOptions = TOKEN ? { token: TOKEN } : {};

  if (TOKEN) {
    console.log(`Using token: ${TOKEN}`);
  }

  const L1_DAI_ADDRESS = getRequiredEnv(`${NETWORK}_L1_DAI_ADDRESS`);
  save("DAI", { address: L1_DAI_ADDRESS }, network);

  const L1_STARKNET_ADDRESS = getRequiredEnv(`${NETWORK}_L1_STARKNET_ADDRESS`);
  const L1_PAUSE_PROXY_ADDRESS = getRequiredEnv(
    `${NETWORK}_L1_PAUSE_PROXY_ADDRESS`
  );
  const L1_ESM_ADDRESS = getRequiredEnv(`${NETWORK}_L1_ESM_ADDRESS`);
  const DENY_DEPLOYER = getRequiredEnv("DENY_DEPLOYER") === "true";

  // @ts-ignore
  const BLOCK_NUMBER = await l1Signer.provider.getBlockNumber();

  const deployer = await getAccount(
    "deployer",
    hre
  );
  console.log(
    `Deploying from account: ${deployer.starknetContract.address.toString()}`
  );
  save(
    "account-deployer",
    { address: deployer.starknetContract.address },
    network
  );

  console.log("From");
  console.log(`\tl2 account: ${deployer.starknetContract.address.toString()}`);
  console.log(
    `\tl1 account: ${(await hre.ethers.getSigners())[0].address.toString()}`
  );

  console.log("Deny deployer:", DENY_DEPLOYER);

  const L2_DAI_ADDRESS = getOptionalEnv(`${NETWORK}_L2_DAI_ADDRESS`);
  if (L2_DAI_ADDRESS) {
    save("dai", { address: L2_DAI_ADDRESS }, network);
  }

  const l2DAI = L2_DAI_ADDRESS
    ? await getL2ContractAt(hre, "dai", L2_DAI_ADDRESS)
    : await deployL2(
        hre,
        "dai",
        BLOCK_NUMBER,
        {
          ward: asDec(deployer.starknetContract.address),
        },
        deploymentOptions
      );

  const futureL1GovRelayAddress = await getAddressOfNextDeployedContract(
    l1Signer
  );
  const l2GovernanceRelay = await deployL2(
    hre,
    "l2_governance_relay",
    BLOCK_NUMBER,
    {
      l1_governance_relay: BigInt(futureL1GovRelayAddress).toString(),
    },
    deploymentOptions
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

  const REGISTRY_ADDRESS = getOptionalEnv(`${NETWORK}_REGISTRY_ADDRESS`);
  if (REGISTRY_ADDRESS) {
    save("registry", { address: REGISTRY_ADDRESS }, network);
  }

  const registry = REGISTRY_ADDRESS
    ? await getL2ContractAt(hre, "registry", REGISTRY_ADDRESS)
    : await deployL2(hre, "registry", BLOCK_NUMBER, {}, deploymentOptions);

  const l1Escrow = await deployL1(hre, "L1Escrow", BLOCK_NUMBER);

  const futureL1DAIBridgeAddress = await getAddressOfNextDeployedContract(
    l1Signer
  );
  const l2DAIBridge = await deployL2(
    hre,
    "l2_dai_bridge",
    BLOCK_NUMBER,
    {
      ward: asDec(deployer.starknetContract.address),
      dai: asDec(l2DAI.address),
      bridge: asDec(futureL1DAIBridgeAddress),
      registry: asDec(registry.address),
    },
    deploymentOptions
  );

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

  const gasPrice = getOptionalEnv(`${NETWORK}_GAS_PRICE`);
  const overrides = gasPrice
    ? { gasPrice: utils.parseUnits(gasPrice, "gwei") }
    : {};

  console.log("L1Escrow approving L1DAIBridge...");
  const MAX = BigInt(2 ** 256) - BigInt(1);
  await waitForTx(
    l1Escrow.approve(L1_DAI_ADDRESS, l1DAIBridge.address, MAX, overrides)
  );

  console.log("Finalizing permissions for L1Escrow...");
  await waitForTx(l1Escrow.rely(L1_PAUSE_PROXY_ADDRESS, overrides));
  await waitForTx(l1Escrow.rely(L1_ESM_ADDRESS, overrides));
  if (DENY_DEPLOYER) {
    await waitForTx(l1Escrow.deny(await l1Signer.getAddress(), overrides));
  }

  console.log("Finalizing permissions for L1DAIBridge...");
  await waitForTx(l1DAIBridge.rely(L1_PAUSE_PROXY_ADDRESS, overrides));
  await waitForTx(l1DAIBridge.rely(L1_ESM_ADDRESS, overrides));
  if (DENY_DEPLOYER) {
    await waitForTx(l1DAIBridge.deny(await l1Signer.getAddress(), overrides));
  }

  console.log("Finalizing permissions for L1GovernanceRelay...");
  await waitForTx(l1GovernanceRelay.rely(L1_PAUSE_PROXY_ADDRESS, overrides));
  await waitForTx(l1GovernanceRelay.rely(L1_ESM_ADDRESS, overrides));
  if (DENY_DEPLOYER) {
    await waitForTx(
      l1GovernanceRelay.deny(await l1Signer.getAddress(), overrides)
    );
  }

  console.log("Finalizing permissions for l2_dai...");
  await deployer.estimateAndInvoke(l2DAI, "rely", {
    user: asDec(l2DAIBridge.address),
  });
  await deployer.estimateAndInvoke(l2DAI, "rely", {
    user: asDec(l2GovernanceRelay.address),
  });
  if (DENY_DEPLOYER) {
    await deployer.estimateAndInvoke(l2DAI, "deny", {
      user: asDec(deployer.starknetContract.address),
    });
  }

  console.log("Finalizing permissions for l2_dai_bridge...");
  await deployer.invoke(l2DAIBridge, "rely", {
    user: asDec(l2GovernanceRelay.address),
  });
  if (DENY_DEPLOYER) {
    await deployer.invoke(l2DAIBridge, "deny", {
      user: asDec(deployer.starknetContract.address),
    });
  }

  console.log("L1 permission sanity checks...");
  let l1Wards;
  if (DENY_DEPLOYER) {
    l1Wards = [L1_PAUSE_PROXY_ADDRESS, L1_ESM_ADDRESS];
  } else {
    l1Wards = [l1Signer.address, L1_PAUSE_PROXY_ADDRESS, L1_ESM_ADDRESS];
  }
  expect(await getActiveWards(l1Escrow as any)).to.deep.eq(l1Wards);
  expect(await getActiveWards(l1DAIBridge as any)).to.deep.eq(l1Wards);
  expect(await getActiveWards(l1GovernanceRelay as any)).to.deep.eq(l1Wards);

  console.log("L2 bridge permission sanity checks...");
  expect(await wards(l2DAIBridge, l2GovernanceRelay)).to.deep.eq(BigInt(1));
  expect(await wards(l2DAIBridge, deployer.starknetContract)).to.deep.eq(
    BigInt(!DENY_DEPLOYER)
  );

  console.log("L2 dai permission sanity checks...");
  expect(await wards(l2DAI, l2GovernanceRelay)).to.deep.eq(BigInt(1));
  expect(await wards(l2DAI, l2DAIBridge)).to.deep.eq(BigInt(1));
  expect(await wards(l2DAI, deployer.starknetContract)).to.deep.eq(
    BigInt(!DENY_DEPLOYER)
  );

  printAddresses(hre);
  writeAddresses(hre);
});
