import fs from "fs";
import { task } from "hardhat/config";

import { deployL1, getRequiredEnv, save } from "./utils";

task("deploy-spell", "Create and deploy spell").setAction(async (_, hre) => {
  const NETWORK = hre.network.name;

  const L1_ESCROW_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_ESCROW_ADDRESS`
  );
  const L1_DAI_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_DAI_ADDRESS`
  );
  const L1_DAI_WORMHOLE_BRIDGE_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_DAI_WORMHOLE_BRIDGE_ADDRESS`
  );

  const spellContract = `
      pragma solidity ^0.7.6;

      interface EscrowApprove {
        function approve(address, address, uint256) external;
      }

      contract EscrowApproveAction {
        function approve() external {
          address escrow = ${L1_ESCROW_ADDRESS};
          address token = ${L1_DAI_ADDRESS};
          address approvedAddress = ${L1_DAI_WORMHOLE_BRIDGE_ADDRESS};
          EscrowApprove(escrow).approve(token, approvedAddress, type(uint256).max);
        }
      }
    `;

  fs.writeFileSync("./contracts/l1/Spells.sol", spellContract);

  await hre.run("compile");

  const [l1Signer] = await hre.ethers.getSigners();

  // @ts-ignore
  const BLOCK_NUMBER = await l1Signer.provider.getBlockNumber();

  const spell = await deployL1(hre, "EscrowApproveAction", BLOCK_NUMBER, []);
  save("EscrowApproveAction", { address: spell.address }, NETWORK);
});
