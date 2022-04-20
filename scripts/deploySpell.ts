import { task } from "hardhat/config";

import { deployL1, deployL2 } from "./utils";

task("deploy-spell-l2", "Deploy L2 spell").setAction(async (_, hre) => {
  const spell = await deployL2(hre, "L2GoerliAddWormholeDomainSpell", 0, {});
  console.log(`Spell deployed at ${spell.address}`);
});

task("deploy-spell", "Deploy spell").setAction(async (_, hre) => {
  const [l1Signer] = await hre.ethers.getSigners();

  // @ts-ignore
  const BLOCK_NUMBER = await l1Signer.provider.getBlockNumber();

  const spell = await deployL1(
    hre,
    "L1GoerliAddWormholeDomainSpell",
    BLOCK_NUMBER,
    []
  );
  console.log(`Spell deployed at ${spell.address}`);
});
