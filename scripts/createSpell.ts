import { getRequiredEnv } from "@makerdao/hardhat-utils";
import hre from "hardhat";
import fs from "fs";

async function createSpell(): Promise<void> {
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
}

createSpell()
  .then(() => console.log("Successfully created"));
