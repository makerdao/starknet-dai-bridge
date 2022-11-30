import axios from "axios";
import { ethers, BigNumber } from "ethers";
import { task, types } from "hardhat/config";

import { asDec } from "../test/utils";
import {
  getAccount,
  getNetwork,
  getRequiredEnv,
  l2String,
  waitForTx,
} from "./utils";

const oracleAuthIface = new ethers.utils.Interface([
  "function requestMint((bytes32, bytes32, bytes32, bytes32, uint128, uint80, uint48), bytes, uint256, uint256)",
  "function signers(address) view returns (uint256)",
  "function threshold() view returns (uint256)",
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

task("teleport-initiate", "Test Fast Withdrawal Integration")
  .addParam("amount", "FW amount", undefined, types.int)
  .setAction(async ({ amount }, hre) => {
    const { network, NETWORK } = getNetwork(hre);

    const [signer] = await hre.ethers.getSigners();
    const l2Auth = await getAccount("deployer", hre);

    const TRG_DOMAIN = getRequiredEnv(`${NETWORK}_TRG_DOMAIN`);

    console.log(`Testing teleport on:`, network);

    console.log("From");
    console.log(`\tl2 account: ${l2Auth.starknetContract.address.toString()}`);
    console.log(`\tl1 account: ${signer.address.toString()}`);
    console.log(`\tamount: ${amount}`);

    const l1Dai = await getL1Contract(
      "DAIMock",
      getAddress("L1_DAI", NETWORK),
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
      getAddress("TELEPORT_ORACLE_AUTH", NETWORK),
      oracleAuthIface,
      signer
    );

    const transferAmount = BigInt(amount);

    const { res: l2GatewayAllowance } = await l2Dai.call("allowance", {
      owner: l2Auth.starknetContract.address,
      spender: l2TeleportGateway.address,
    });

    if (transferAmount > l2GatewayAllowance) {
      console.log("\nApproving L2 Teleport Gateway");
      await l2Auth.estimateAndInvoke(l2Dai, "approve", {
        spender: asDec(l2TeleportGateway.address),
        amount: transferAmount,
      });
    }

    const l1Balance = await l1Dai.balanceOf(signer.address);

    console.log(`\nInitiating teleport to: ${TRG_DOMAIN}`);
    const tx = await waitForL2Tx(
      l2Auth.estimateAndInvoke(l2TeleportGateway, "initiate_teleport", {
        target_domain: l2String(TRG_DOMAIN),
        receiver: signer.address,
        amount: BigInt(amount),
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
  });

task("teleport-requestMint", "mint teleport")
  .addParam("tx", "Tx hash amount")
  .setAction(async ({ tx }, hre) => {
    const { network, NETWORK } = getNetwork(hre);

    const [signer] = await hre.ethers.getSigners();

    console.log(`Testing requestMint on:`, network);

    console.log("From");
    console.log(`\tl1 account: ${signer.address.toString()}`);

    console.log(`\nGetting attestation for tx: ${tx}`);
    const oracleUrlKey = getRequiredEnv(`${NETWORK}_ORACLE_URL`);
    const url = `${oracleUrlKey}/?type=teleport_starknet&index=${tx}`;
    let attestations: Attestation[] = [];
    while (attestations.length === 0) {
      const response = await axios.get(url);
      attestations = response.data as Attestation[];
    }

    console.log(`\nGot ${attestations.length} attestations`);

    const l1OracleAuth = new ethers.Contract(
      getAddress("TELEPORT_ORACLE_AUTH", NETWORK),
      oracleAuthIface,
      signer
    );

    const threshold = await l1OracleAuth.threshold();

    if (attestations.length < threshold) {
      console.warn(
        `\nNumer of attestations below the threshold(${threshold})!`
      );
      return;
    }

    console.log("\nCalling oracle auth");

    const signatures = attestations
    .map((_) => _.signatures.ethereum)
    .sort((a, b) => (BigNumber.from(`0x${a.signer}`).lt(BigNumber.from(`0x${b.signer}`)) ? -1 : 1))
    .map((_) => _.signature)

    await waitForTx(
      l1OracleAuth.requestMint(
        Object.values(parseTeleportGUID(attestations[0].data.event)),
        `0x${signatures.join("")}`,
        "0x0",
        "0x0"
      )
    );
  });

task("teleport-finalizeFlush", "Finalize flush")
  .addParam("amount", "Flush amount", undefined, types.int)
  .setAction(async ({ amount }, hre) => {
    const { network, NETWORK } = getNetwork(hre);

    const [signer] = await hre.ethers.getSigners();

    const TRG_DOMAIN = getRequiredEnv(`${NETWORK}_TRG_DOMAIN`);

    const l1TeleportGateway = await getL1Contract(
      "L1DAITeleportGateway",
      getRequiredEnv(`${NETWORK}_L1_DAI_TELEPORT_GATEWAY_ADDRESS`),
      hre
    );

    console.log(`Testing settle on:`, network);

    console.log("From");
    console.log(`\tl1 account: ${signer.address.toString()}`);
    console.log(`teleport debt: ${await l1TeleportGateway.debt()}`);

    console.log("Finalising flush");
    await waitForTx(l1TeleportGateway.finalizeFlush(TRG_DOMAIN, amount));
  });

task("teleport-finalizeRegisterTeleport", "Finalize register teleport")
  .addParam("tx", "Tx hash amount")
  .setAction(async ({ tx }, hre) => {
    const { network, NETWORK } = getNetwork(hre);

    const [signer] = await hre.ethers.getSigners();

    console.log(`Testing finalizeRegisterTeleport on:`, network);

    console.log("From");
    console.log(`\tl1 account: ${signer.address.toString()}`);

    const l1TeleportGateway = await getL1Contract(
      "L1DAITeleportGateway",
      getRequiredEnv(`${NETWORK}_L1_DAI_TELEPORT_GATEWAY_ADDRESS`),
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

    console.log(`\nFinalising RegisterTeleport for ${tx}`);
    await waitForTx(
      l1TeleportGateway.finalizeRegisterTeleport(
        Object.values(parseTeleportGUID(attestations[0].data.event))
      )
    );
  });
