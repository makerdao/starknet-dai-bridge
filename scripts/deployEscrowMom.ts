import { sleep } from "@eth-optimism/core-utils";
import { expect } from "chai";
import { utils } from "ethers";
import { task } from "hardhat/config";

import {
  deployL1,
  getL1ContractAt,
  getNetwork,
  getOptionalEnv,
  getRequiredEnv,
  waitForTx,
} from "./utils";

task("deploy-escrow-mom", "Deploy L1EscrowMom").setAction(async (_, hre) => {
  const [l1Signer] = await hre.ethers.getSigners();

  const { network, NETWORK } = getNetwork(hre);

  console.log(`Deploying escrow mom on: ${network}`);

  const L1_DAI_ADDRESS = getRequiredEnv(`${NETWORK}_L1_DAI_ADDRESS`);
  const L1_ESCROW_ADDRESS = getRequiredEnv(`${NETWORK}_L1_ESCROW_ADDRESS`);
  // const L1_CHIEF_ADDRESS = getRequiredEnv(`${NETWORK}_L1_CHIEF_ADDRESS`);

  const L1_PAUSE_PROXY_ADDRESS = getRequiredEnv(
    `${NETWORK}_L1_PAUSE_PROXY_ADDRESS`
  );

  console.log("From");
  console.log(
    `\tl1 account: ${(await hre.ethers.getSigners())[0].address.toString()}`
  );

  const gasPrice = getOptionalEnv(`${NETWORK}_GAS_PRICE`);
  const gasOverrides = gasPrice
    ? { gasPrice: utils.parseUnits(gasPrice, "gwei") }
    : {};

  if (gasOverrides.gasPrice) {
    console.log("Gas price:", gasOverrides.gasPrice.toString());
  }

  const l1EscrowMom = await deployL1(
    hre,
    "L1EscrowMom",
    [L1_ESCROW_ADDRESS, L1_DAI_ADDRESS],
    gasOverrides
  );

  console.log("Finalizing permissions for L1EscrowMom...");
  // To be done in a gov spell
  // await waitForTx(l1EscrowMom.setAuthority(L1_CHIEF_ADDRESS, gasOverrides))
  await waitForTx(l1EscrowMom.setOwner(L1_PAUSE_PROXY_ADDRESS, gasOverrides));

  const l1Escrow = await getL1ContractAt(hre, "L1Escrow", L1_ESCROW_ADDRESS);
  // await waitForTx(l1Escrow.rely(l1EscrowMom.address, gasOverrides))

  await sleep(1000);
  console.log("L1EscrowMom permission sanity checks...");
  expect(await l1EscrowMom.owner()).to.deep.eq(L1_PAUSE_PROXY_ADDRESS);
  // expect(await l1EscrowMom.authority()).to.deep.eq(L1_CHIEF_ADDRESS);
  expect(await l1Escrow.wards(l1EscrowMom.address)).to.deep.eq(BigInt(1));

  console.log({ l1EscrowMom: l1EscrowMom.address });
});
