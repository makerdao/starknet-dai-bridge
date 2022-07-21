import {
  getAddressOfNextDeployedContract,
  simpleDeploy,
} from "@makerdao/hardhat-utils";
import { expect } from "chai";
import { ethers, network, starknet } from "hardhat";
import { HttpNetworkConfig } from "hardhat/types";
import axios from "axios";
import hre from "hardhat";

import {
  asDec,
  eth,
  l2Eth,
  SplitUint,
  toBytes32,
} from "../utils";
import {
  getRequiredEnv,
  getRequiredEnvDeployments,
  getNetwork,
  waitForTx,
  getAccount,
} from "../../scripts/utils";

const L1_TARGET_DOMAIN = ethers.utils.formatBytes32String("GOERLI-MASTER-1");
const L2_TARGET_DOMAIN = `0x${Buffer.from("GOERLI-MASTER-1", "utf8").toString("hex")}`;
const L1_SOURCE_DOMAIN = ethers.utils.formatBytes32String("ALHPA_GOERLI-SLAVE-STARKNET-1");
const L2_SOURCE_DOMAIN = `0x${Buffer.from("ALPHA_GOERLI-SLAVE-STARKNET-1", "utf8").toString("hex")}`;

const MAX = BigInt(2 ** 256) - BigInt(1);
const MAX_HALF = BigInt(2 ** 128) - BigInt(1);

async function waitForL2Tx(
  txHash: Promise<string>
): Promise<any> {
  console.log(`Sending transaction...`);
  const resolvedTxHash = await txHash;
  let status: string = "";
  console.log(`Waiting for tx: ${resolvedTxHash}`);
  while (status !== "ACCEPTED_ON_L2") {
    ({ status } = await hre.starknet.getTransaction(resolvedTxHash));
  }
  return txHash;
}


interface Attestation {
  timestamp: number;
  data: any;
  signatures: any;
}

function parseTeleportGUID(event: string): string[] {
  return [
    `0x${event.slice(0, 64)}`,
    `0x${event.slice(64, 128)}`,
    `0x${event.slice(128, 192)}`, 
    `0x${event.slice(192, 256)}`,
    `0x${event.slice(256, 320)}`,
    `0x${event.slice(320, 384)}`,
    `0x${event.slice(384, 448)}`,
  ];
};

function getAddress(contract: string, NETWORK: string): string {
  return getRequiredEnvDeployments(`${NETWORK}_${contract}`);
}

async function getL1Contract(contract: string, contractAddress: string, NETWORK: string) {
  const address = getAddress(contractAddress, NETWORK);
  const contractFactory = await hre.ethers.getContractFactory(contract);
  return contractFactory.attach(address);
}

async function getL2Contract(contract: string, contractAddress: string, NETWORK: string) {
  const address = getAddress(contractAddress, NETWORK);
  const contractFactory = await hre.starknet.getContractFactory(contract);
  return contractFactory.getContractAt(address);
}

describe("integration", async function () {
  this.timeout(900_000); // eslint-disable-line
  let signer: any;
  let l2Auth: any;
  let l1Dai: any;
  let l2Dai: any;
  let l1Bridge: any;
  let l1OracleAuth: any;
  let l1TeleportGateway: any;
  let l2Bridge: any;
  let l2TeleportGateway: any;

  it("e2e", async function () {
    const { NETWORK } = getNetwork(hre);
    
    [signer] = await hre.ethers.getSigners();
    l2Auth = await getAccount("user", hre);

    l1Dai = await getL1Contract("DAIMock", "L1_DAI", NETWORK);
    l2Dai = await getL2Contract("dai", "L2_DAI", NETWORK);

    l2Bridge = await getL2Contract("l2_dai_bridge", "L2_DAI_BRIDGE", NETWORK);
    l2TeleportGateway = await getL2Contract("l2_dai_teleport_gateway", "L2_DAI_TELEPORT_GATEWAY", NETWORK);
    l1Bridge = await getL1Contract("L1DAIBridge", "L1_DAI_BRIDGE", NETWORK);
    l1TeleportGateway = await getL1Contract("L1DAITeleportGateway", "L1_DAI_TELEPORT_GATEWAY", NETWORK);
    const iface = new ethers.utils.Interface([
      "function requestMint((bytes32, bytes32, bytes32, bytes32, uint128, uint80, uint48), bytes, uint256, uint256)",
      "function signers(address) view returns (uint256)",
    ]);
    l1OracleAuth = new ethers.Contract(getRequiredEnv(`${NETWORK}_TELEPORT_ORACLE_AUTH`), iface, signer);

    const transferAmount = 100;

    const l1BridgeAllowance = await l1Dai.allowance(signer.address, l1Bridge.address);
    const l1GatewayAllowance = await l1Dai.allowance(signer.address, l1Bridge.address);
    if (l1BridgeAllowance < transferAmount) {
      console.log("\nApproving L1 Bridge");
      await waitForTx(l1Dai.approve(l1Bridge.address, MAX));
    }
    if (l1GatewayAllowance < transferAmount) {
      console.log("\nApproving L1 Teleport Gateway");
      await waitForTx(l1Dai.approve(l1TeleportGateway.address, MAX));
    }

    const { res: _l2BridgeAllowance } = await l2Dai.call("allowance", {
      owner: l2Auth.starknetContract.address,
      spender: l2Bridge.address,
    });
    const l2BridgeAllowance = new SplitUint(_l2BridgeAllowance);
    const { res: _l2GatewayAllowance } = await l2Dai.call("allowance", {
      owner: l2Auth.starknetContract.address,
      spender: l2TeleportGateway.address,
    });
    const l2GatewayAllowance = new SplitUint(_l2GatewayAllowance);
    if (l2BridgeAllowance.toUint() < transferAmount) {
      console.log("\nApproving L2 Bridge");
      await l2Auth.estimateAndInvoke(l2Dai, "approve", {
        spender: asDec(l2Bridge.address),
        amount: {
          low: MAX_HALF,
          high: MAX_HALF,
        },
      });
    }
    if (l2GatewayAllowance.toUint() < transferAmount) {
      console.log("\nApproving L2 Teleport Gateway");
      await l2Auth.estimateAndInvoke(l2Dai, "approve", {
        spender: asDec(l2TeleportGateway.address),
        amount: {
          low: MAX_HALF,
          high: MAX_HALF,
        },
      });
    }

    const { res: _l2Balance } = await l2Dai.call("balanceOf", {
      user: l2Auth.starknetContract.address,
    });
    const l2Balance = new SplitUint(_l2Balance);
    if (l2Balance.toUint() < transferAmount) {
      console.log("\nDepositing DAI to L2");
      await waitForTx(l1Bridge.deposit(transferAmount, l2Auth.starknetContract.address));
      l2Balance.add(transferAmount);
      let newL2Balance = SplitUint.fromUint(0);
      while (newL2Balance.toUint() < transferAmount) {
        const { res: _newL2Balance } = await l2Dai.call("balanceOf", {
            user: l2Auth.starknetContract.address,
          });
        newL2Balance = new SplitUint(_newL2Balance);
      }
    }
    const l1Balance = l1Dai.balanceOf(signer.address);

    console.log("\nInitiating teleport");
    const tx = await waitForL2Tx(l2Auth.estimateAndInvoke(l2TeleportGateway, "initiate_teleport", {
      target_domain: L2_TARGET_DOMAIN,
      receiver: signer.address,
      amount: transferAmount,
      operator: signer.address,
    }));
    const delay = (ms: number) => {
      return new Promise((resolve) => {
        setTimeout(resolve, ms);
      });
    }
    await delay(25000);

    console.log(`\nGetting attestation for tx: ${tx}`);
    const url = `http://52.42.179.195:8080/?type=teleport_starknet&index=${tx}`;
    const response = await axios.get(url);
    const data = response.data as Attestation[];
    if (data.length === 0) {
      throw new Error("Teleport event not found");
    }

    console.log("\nCalling oracle");
    await waitForTx(l1OracleAuth.requestMint(
      Object.values(parseTeleportGUID(data[0].data.event)),
      `0x${data.map(_ => _.signatures.ethereum.signature).join('')}`,
      "0x0",
      "0x0",
    ));

    const { res: _newBalance } = await l2Dai.call("balanceOf", {
      user: l2Auth.starknetContract.address,
    });
    const newBalance = new SplitUint(_newBalance);
    expect(newBalance.toUint()).to.equal(l2Balance.sub(transferAmount).toUint());
    expect(await l1Dai.balanceOf(signer.address)).to.equal(l1Balance.add(100));
  });
});
