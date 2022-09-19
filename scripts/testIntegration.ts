import axios from "axios";
import { ethers } from "ethers";
import { task } from "hardhat/config";

import { asDec } from "../test/utils";
import { getAccount, getRequiredEnv, waitForTx } from "./utils";

const L2_TARGET_DOMAIN = `0x${Buffer.from("GOERLI-MASTER-1", "utf8").toString(
  "hex"
)}`;

const L1_TARGET_DOMAIN = ethers.utils.formatBytes32String("GOERLI-MASTER-1");

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

    const l1OracleAuth = new ethers.Contract(
      getRequiredEnv(`${NETWORK}_TELEPORT_ORACLE_AUTH_ADDRESS`),
      oracleAuthIface,
      signer
    );

    // const transferAmount = 100;
    // const transferAmount = asDec(1000000000000000000);
    const transferAmount = asDec("4000000000000000000");

    const { res: _l2GatewayAllowance } = await l2Dai.call("allowance", {
      owner: l2Auth.starknetContract.address,
      spender: l2TeleportGateway.address,
    });

    console.log("\nApproving L2 Teleport Gateway");
    await l2Auth.estimateAndInvoke(l2Dai, "approve", {
      spender: asDec(l2TeleportGateway.address),
      amount: transferAmount,
    });

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

    console.log("\nCalling oracle auth");
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

    const newL1Balance = await l1Dai.balanceOf(signer.address);
    console.log(`\nL1 Balance:
    Before: ${BigInt(l1Balance.toHexString())}
    After: ${BigInt(newL1Balance.toHexString())}`);
  }
);

task("settle", "Settle").setAction(async (_, hre) => {
  const NETWORK = "ALPHA_GOERLI_INT";
  const [signer] = await hre.ethers.getSigners();

  const l1TeleportGateway = await getL1Contract(
    "L1DAITeleportGateway",
    getRequiredEnv(`${NETWORK}_L1_DAI_TELEPORT_GATEWAY_ADDRESS`),
    hre
  );

  console.log("From");
  console.log(`\tl1 account: ${signer.address.toString()}`);
  console.log(`teleport debt: ${await l1TeleportGateway.debt()}`);

  console.log("Finalising flush");
  await waitForTx(l1TeleportGateway.finalizeFlush(L1_TARGET_DOMAIN, 200));
});

task("finalizeRegisterTeleport", "Finalize register teleport").setAction(
  async (_, hre) => {
    const NETWORK = "ALPHA_GOERLI_INT";
    const [signer] = await hre.ethers.getSigners();

    console.log("From");
    console.log(`\tl1 account: ${signer.address.toString()}`);

    const l1TeleportGateway = await getL1Contract(
      "L1DAITeleportGateway",
      getRequiredEnv(`${NETWORK}_L1_DAI_TELEPORT_GATEWAY_ADDRESS`),
      hre
    );

    const tx =
      "0x5241661da4c4f224d18f4d430d1f74087d5fc3e13a842fe0f73019314e8d8e6";

    console.log(`\nGetting attestation for tx: ${tx}`);
    const oracleUrlKey = getRequiredEnv(`${NETWORK}_ORACLE_URL`);
    const url = `${oracleUrlKey}/?type=teleport_starknet&index=${tx}`;
    let attestations: Attestation[] = [];
    while (attestations.length === 0) {
      const response = await axios.get(url);
      attestations = response.data as Attestation[];
    }

    console.log(`\nFinalising RegisterTeleport for ${tx}`);
    await waitForTx(
      l1TeleportGateway.finalizeRegisterTeleport(
        Object.values(parseTeleportGUID(attestations[0].data.event))
      )
    );
  }
);
