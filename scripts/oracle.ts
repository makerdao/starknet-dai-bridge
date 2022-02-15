import fs from "fs";
import fetch from "node-fetch";
import assert from "assert";
import { task } from "hardhat/config";
import { BigNumber, Wallet } from "ethers";
import { arrayify, hashMessage, keccak256 } from "ethers/lib/utils";


interface WormholeGUID {
  source_domain: string
  target_domain: string
  receiver: string
  operator: string
  amount: string
  nonce: string
  timestamp: string
}

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  assert(value, `Please provide ${key} in .env file`);

  // @ts-ignore
  return value;
}

async function signWormholeData(
  wormholeData: string,
  signers: any,
): Promise<{ signHash: string; signatures: string }> {
  signers = signers.sort((s1: any, s2: any) => {
    const bn1 = BigNumber.from(s1.address)
    const bn2 = BigNumber.from(s2.address)
    if (bn1.lt(bn2)) return -1
    if (bn1.gt(bn2)) return 1
    return 0
  });

  const guidHash = keccak256(wormholeData);
  const sigs = await Promise.all(signers.map((signer: any) => signer.signMessage(arrayify(guidHash))));
  const signatures = `0x${sigs.map((sig: any) => sig.slice(2)).join('')}`;
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

async function getBlockNumber(network: string): Promise<number> {
    let domain;
    if (network === 'testnet') {
        domain = 'alpha4.starknet.io';
    } else if (network === 'localhost') {
        domain = 'localhost:5000';
    } else {
        domain = 'alpha-mainnet.starknet.io';
    }
    const res = await fetch(`https://${domain}/feeder_gateway/get_block`);
    const json = await res.json();
    return json.block_number;
}

function convert(parameters: any) {
  const res = {};
  parameters.forEach(({ name, value }: { name: string, value: any }) => {
    if (typeof value !== 'string') {
      // @ts-ignore
      res[name] = convert(value);
    } else {
      // @ts-ignore
      res[name] = value;
    }
  });
  return res;
}

async function getInitEvents(fromBlock: number, network: string) {
  const eventName = 'WormholeInitialized';
  const contractAddress = getAddress('l2_dai_wormhole_bridge', 'goerli');
  const contractAddressFilter = `0x${BigInt(contractAddress).toString(16)}`;
  const res = await fetch(`http://starknet.events/api/v1/get_events?from_block=${fromBlock}&name=${eventName}`);
  const json = await res.json();
  if (json.items) {
    const items = json.items.filter((_: any) => _.contract === contractAddressFilter && _.chain_id === network);
    const events: Record<string, object> = {};
    items.forEach((event: any) => {
      events[event.tx_hash] = convert(event.parameters);
    });
    return events;
  } else {
    return [];
  }
}

const network = 'testnet';
const fileName = './wormholeEvents.json';

async function recordEvents() {
  const blockNumber = await getBlockNumber(network);
  if (!fs.existsSync(fileName)) {
    const newJson = { events: {}, blockNumber };
    fs.writeFileSync(fileName, JSON.stringify(newJson));
  }
  const eventsJson = JSON.parse(fs.readFileSync(fileName).toString());
  const newEvents = await getInitEvents(900, network);
  Object.entries(newEvents).forEach(([key, value]) => {
    eventsJson.events[key] = value;
  });
  fs.writeFileSync(fileName, JSON.stringify(eventsJson));
}

async function generateAttestation(eventData: WormholeGUID): Promise<{ signatures: string, input: object }> {
  const sourceDomain = `0x${eventData.source_domain.slice(2).padStart(64, '0')}`;
  const targetDomain = `0x${eventData.target_domain.padStart(64, '0')}`;
  const receiver = `0x${eventData.receiver.slice(2).padStart(64, '0')}`;
  const operator = `0x${eventData.operator.padStart(64, '0')}`;
  const amount = `0x${parseInt(eventData.amount).toString(16)}`;
  const nonce = parseInt(eventData.nonce);
  const date = new Date(eventData.timestamp);
  const timestamp = date.getTime(); // format
  let message = '0x';
  message += sourceDomain.slice(2);
  message += targetDomain.slice(2);
  message += receiver.slice(2);
  message += operator.slice(2);
  message += amount.slice(2).padStart(64, '0');
  message += nonce.toString(16).padStart(64, '0');
  message += timestamp.toString(16).padStart(64, '0');

  const oracleMnemonic = getRequiredEnv('ORACLE_MNEMONIC');
  const oracleWallet = Wallet.fromMnemonic(oracleMnemonic);
  const { signatures } = await signWormholeData(message, [oracleWallet]);
  return { signatures, input: { sourceDomain, targetDomain, receiver, operator, amount, nonce, timestamp } };
}

async function getAttestation(data: any): Promise<{ signatures: string, input: object }> {
  const eventsJson = JSON.parse(fs.readFileSync(fileName).toString());
  const event = eventsJson.events[data];
  const attestation = await generateAttestation(event);
  return attestation;
}

async function sendAttestation(wormholeGUID: any, signatures: string, hre: any) {
  const wormholeOracleAuthAddress = getAddress("WormholeOracleAuth", "goerli");
  const wormholeOracleAuth = await getL1ContractAt("WormholeOracleAuth", wormholeOracleAuthAddress, hre);
  return wormholeOracleAuth.requestMint(wormholeGUID, signatures, 0, 0, { gasLimit: 10000000 });
}

task("oracle:recordEvents", "")
  .setAction(async () => {
    await recordEvents();
  });

task("oracle:getAttestation", "")
  .addParam("transaction", "")
  .setAction(async ({ transaction }) => {
    const attestation = await getAttestation(transaction);
    console.log(attestation);
  });

task("oracle:sendAttestation", "")
  .addParam("transaction", "")
  .setAction(async ({ transaction }, hre) => {
    const { signatures, input } = await getAttestation(transaction);
    const tx = await sendAttestation(input, signatures, hre);
    const response = await tx.wait();
    console.log(response);
  });
