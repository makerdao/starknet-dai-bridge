import assert from "assert";
import { BigNumber, Wallet } from "ethers";
import { arrayify, hashMessage, keccak256 } from "ethers/lib/utils";
import fs from "fs";
import { task } from "hardhat/config";
import fetch from "node-fetch";

// get_selector_from_name('WormholeInitialized')
const eventKey =
  "1345515244988659859228254809159403205747553036527527466027467944744859901062";

interface WormholeGUID {
  sourceDomain: string;
  targetDomain: string;
  receiver: string;
  operator: string;
  amount: string;
  nonce: number;
  timestamp: number;
}

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  assert(value, `Please provide ${key} in .env file`);

  // @ts-ignore
  return value;
}

async function signWormholeData(
  wormholeData: string,
  signers: any
): Promise<{ signHash: string; signatures: string }> {
  signers = signers.sort((s1: any, s2: any) => {
    const bn1 = BigNumber.from(s1.address);
    const bn2 = BigNumber.from(s2.address);
    if (bn1.lt(bn2)) return -1;
    if (bn1.gt(bn2)) return 1;
    return 0;
  });

  const guidHash = keccak256(wormholeData);
  const sigs = await Promise.all(
    signers.map((signer: any) => signer.signMessage(arrayify(guidHash)))
  );
  const signatures = `0x${sigs.map((sig: any) => sig.slice(2)).join("")}`;
  const signHash = hashMessage(arrayify(guidHash));
  return { signHash, signatures };
}

async function getL1ContractAt(name: string, address: string, hre: any) {
  console.log(`Using existing contract: ${name} at: ${address}`);
  const contractFactory = await hre.ethers.getContractFactory(name);
  return contractFactory.attach(address);
}

function getAddress(contract: string, network: string) {
  try {
    return JSON.parse(
      fs.readFileSync(`./deployments/${network}/${contract}.json`).toString()
    ).address;
  } catch (err) {
    throw Error(
      `${contract} deployment on ${network} not found, run 'yarn deploy:${network}'`
    );
  }
}

async function generateAttestation(
  eventData: any[]
): Promise<{ signatures: string; wormholeGUID: WormholeGUID }> {
  const sourceDomain = `0x${BigInt(eventData[0])
    .toString(16)
    .padStart(64, "0")}`;
  const targetDomain = `0x${BigInt(eventData[1])
    .toString(16)
    .padStart(64, "0")}`;
  const receiver = `0x${BigInt(eventData[2]).toString(16).padStart(64, "0")}`;
  const operator = `0x${BigInt(eventData[3]).toString(16).padStart(64, "0")}`;
  const amount = `0x${BigInt(eventData[4]).toString(16)}`;
  const nonce = parseInt(eventData[5]);
  const date = new Date(parseInt(eventData[6]));
  const timestamp = date.getTime();
  let message = "0x";
  message += sourceDomain.slice(2);
  message += targetDomain.slice(2);
  message += receiver.slice(2);
  message += operator.slice(2);
  message += amount.slice(2).padStart(64, "0");
  message += nonce.toString(16).padStart(64, "0");
  message += timestamp.toString(16).padStart(64, "0");

  const oracleMnemonic = getRequiredEnv("ORACLE_MNEMONIC");
  const oracleWallet = Wallet.fromMnemonic(oracleMnemonic);
  const { signatures } = await signWormholeData(message, [oracleWallet]);
  return {
    signatures,
    wormholeGUID: {
      sourceDomain,
      targetDomain,
      receiver,
      operator,
      amount,
      nonce,
      timestamp,
    },
  };
}

async function getAttestation(
  transaction: string,
  hre: any
): Promise<{ signatures: string; wormholeGUID: WormholeGUID }> {
  /*
  const contractAddress = getAddress('l2_dai_wormhole_bridge', 'goerli');
  const contractAddressFilter = `0x${BigInt(contractAddress).toString(16)}`;
  */
  const contractAddressFilter =
    "0x30c9c37aeda61d4d2e9f094cd1227e9f8d7f1354bf3f398fe1af918296da37d";

  let domain;
  if (hre.network.name === "mainnet") {
    domain = "https://alpha-mainnet.starknet.io";
  } else if (hre.network.name === "goerli") {
    domain = "https://alpha4.starknet.io";
  } else {
    domain = "http://localhost:9545";
  }
  const res = await fetch(
    `${domain}/feeder_gateway/get_transaction_receipt?transactionHash=${transaction}`
  );
  const json = await res.json();

  const event = json.events.filter(
    (_: any) =>
      _.from_address === contractAddressFilter && _.keys[0] === eventKey
  )[0];
  const attestation = await generateAttestation(event.data);
  return attestation;
}

async function sendAttestation(
  wormholeGUID: WormholeGUID,
  signatures: string,
  hre: any
) {
  const wormholeOracleAuthAddress = getAddress(
    "WormholeOracleAuth",
    hre.network.name
  );
  const wormholeOracleAuth = await getL1ContractAt(
    "WormholeOracleAuth",
    wormholeOracleAuthAddress,
    hre
  );
  return wormholeOracleAuth.requestMint(wormholeGUID, signatures, 0, 0, {
    gasLimit: 10000000,
  });
}

task("oracle:getAttestation", "")
  .addParam("transaction", "")
  .setAction(async ({ transaction }, hre) => {
    const attestation = await getAttestation(transaction, hre);
    console.log(attestation);
  });

task("oracle:sendAttestation", "Generate and send attestation to L1 ")
  .addParam("transaction", "Transaction hash")
  .setAction(async ({ transaction }, hre) => {
    const { signatures, wormholeGUID } = await getAttestation(transaction, hre);
    const tx = await sendAttestation(wormholeGUID, signatures, hre);
    const response = await tx.wait();
    console.log(response);
  });
