import { sleep } from "@eth-optimism/core-utils";
import axios from "axios";
import { ethers } from "ethers";
import { task } from "hardhat/config";

import { asDec, SplitUint } from "../test/utils";
import {getAccount, getRequiredEnv, waitForTx} from "./utils";

const L2_TARGET_DOMAIN = `0x${Buffer.from("GOERLI-MASTER-1", "utf8").toString(
  "hex"
)}`;

const MAX = BigInt(2 ** 256) - BigInt(1);
const MAX_HALF = BigInt(2 ** 128) - BigInt(1);

const oracleAuthIface = new ethers.utils.Interface([
  "function requestMint((bytes32, bytes32, bytes32, bytes32, uint128, uint80, uint48), bytes, uint256, uint256)",
  "function signers(address) view returns (uint256)",
]);

async function waitForL2Tx(txHash: Promise<string>, hre: any): Promise<any> {
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
}

function getAddress(contract: string, NETWORK: string): string {
  return getRequiredEnv(`${NETWORK}_${contract}_ADDRESS`);
}

async function getL1Contract(
  contract: string,
  contractAddress: string,
  hre: any
) {
  const contractFactory = await hre.ethers.getContractFactory(contract);
  return contractFactory.attach(contractAddress);
}

async function getL2Contract(
  contract: string,
  contractAddress: string,
  hre: any
) {
  const contractFactory = await hre.starknet.getContractFactory(contract);
  return contractFactory.getContractAt(contractAddress);
}

task("integration", "Test Fast Withdrawal Integration").setAction(
  async (_, hre) => {
    const NETWORK = "ALPHA_GOERLI_INT";
    const [signer] = await hre.ethers.getSigners();
    const l2Auth = await getAccount("user", hre);

    console.log("From");
    console.log(`\tl2 account: ${l2Auth.starknetContract.address.toString()}`);
    console.log(`\tl1 account: ${signer.address.toString()}`);

    const l1Dai = await getL1Contract(
      "DAIMock",
      getRequiredEnv(`${NETWORK}_L1_DAI_ADDRESS`),
      hre
    );
    const l2Dai = await getL2Contract(
      "dai",
      getAddress("L2_DAI", NETWORK),
      hre
    );

    const l2TeleportGateway = await getL2Contract(
      "l2_dai_teleport_gateway",
      getAddress("L2_DAI_TELEPORT_GATEWAY", NETWORK),
      hre
    );

    const l1Bridge = await getL1Contract(
      "L1DAIBridge",
      getAddress("L1_DAI_BRIDGE", NETWORK),
      hre
    );

    const l1OracleAuth = new ethers.Contract(
      getRequiredEnv(`${NETWORK}_TELEPORT_ORACLE_AUTH_ADDRESS`),
      oracleAuthIface,
      signer
    );
    //
    const transferAmount = 100;

    const l1BridgeAllowance = await l1Dai.allowance(
      signer.address,
      l1Bridge.address
    );

    if (l1BridgeAllowance < transferAmount) {
      console.log("\nApproving L1 Bridge");
      await waitForTx(l1Dai.approve(l1Bridge.address, MAX));
    }

    const { res: _l2GatewayAllowance } = await l2Dai.call("allowance", {
      owner: l2Auth.starknetContract.address,
      spender: l2TeleportGateway.address,
    });
    const l2GatewayAllowance = new SplitUint(_l2GatewayAllowance);

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
    let l2Balance = new SplitUint(_l2Balance);

    if (l2Balance.toUint() < transferAmount) {
      console.log("\nBridging DAI to L2");
      await waitForTx(
        l1Bridge.deposit(transferAmount, l2Auth.starknetContract.address)
      );
      l2Balance = l2Balance.add(transferAmount);
      let newL2Balance = SplitUint.fromUint(0);
      while (newL2Balance.toUint() < transferAmount) {
        console.log("Waiting for deposit to reach l2...");
        await sleep(2000);
        const { res: _newL2Balance } = await l2Dai.call("balanceOf", {
          user: l2Auth.starknetContract.address,
        });
        newL2Balance = new SplitUint(_newL2Balance);
      }
    }
    const l1Balance = await l1Dai.balanceOf(signer.address);

    console.log("\nInitiating teleport");
    const tx = await waitForL2Tx(
      l2Auth.estimateAndInvoke(l2TeleportGateway, "initiate_teleport", {
        target_domain: L2_TARGET_DOMAIN,
        receiver: signer.address,
        amount: transferAmount,
        operator: signer.address,
      }),
      hre
    );

    console.log(`\nGetting attestation for tx: ${tx}`);
    const oracleUrlKey = getRequiredEnv(`${NETWORK}_ORACLE_URL`);
    const url = `${oracleUrlKey}/?type=teleport_starknet&index=${tx}`;
    let attestations: Attestation[] = [];
    while (attestations.length === 0) {
      const response = await axios.get(url);
      attestations = response.data as Attestation[];
    }

    console.log("\nCalling oracle");
    await waitForTx(
      l1OracleAuth.requestMint(
        Object.values(parseTeleportGUID(attestations[0].data.event)),
        `0x${attestations
          .map((_) => _.signatures.ethereum.signature)
          .join("")}`,
        "0x0",
        "0x0"
      )
    );

    const { res: _newL2Balance } = await l2Dai.call("balanceOf", {
      user: l2Auth.starknetContract.address,
    });
    const newL2Balance = new SplitUint(_newL2Balance);
    const newL1Balance = await l1Dai.balanceOf(signer.address);
    console.log(`\nL1 Balance:
    Before: ${BigInt(l1Balance.toHexString())}
    After: ${BigInt(newL1Balance.toHexString())}`);
    console.log(`\nL2 Balance:
    Before: ${l2Balance.toUint()}
    After: ${newL2Balance.toUint()}`);
  }
);
