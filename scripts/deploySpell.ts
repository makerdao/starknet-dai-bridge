import { getRequiredEnv } from "@makerdao/hardhat-utils";
import hre from "hardhat";
import fs from "fs";

import { deployL1, printAddresses, save } from "./utils";

async function deploySpell(): Promise<void> {
  const [l1Signer] = await hre.ethers.getSigners();

  const NETWORK = hre.network.name;

  // @ts-ignore
  const BLOCK_NUMBER = await l1Signer.provider.getBlockNumber();

  const spell = await deployL1(hre, "EscrowApproveAction", BLOCK_NUMBER, []);
  save("EscrowApproveAction", { address: spell.address }, NETWORK);
}

deploySpell()
  .then(() => console.log("Successfully deployed"))
  .then(() => printAddresses(hre))
  .catch((err) => console.log(err));
