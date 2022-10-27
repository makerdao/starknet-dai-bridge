import axios from "axios";
import { BigNumberish, constants, Contract, utils } from "ethers";
import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getNetwork, getRequiredEnv } from "./utils";

const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

function chainId(network: string) {
  return network.indexOf("MAINNET") >= 0 ? "mainnet" : "testnet";
}

async function inspectL2Wards(network: string, key: string) {
  // const address = `0x${BigInt(getRequiredEnv(key)).toString(16)}`;
  const address = getRequiredEnv(key);

  const url = `http://starknet.events/api/v1/get_events?chain_id=${chainId(
    network
  )}&contract=${address}&from_block=0&name=Rely&name=Deny`;
  const response: any = await axios.get(url);
  const log = response.data.items.map(
    (event: any) =>
      `${event.timestamp} - ${event.name} ${event.parameters[0].value}`
  );
  const wards = response.data.items.reduce((s: Set<string>, event: any) => {
    if (event.name === "Rely") {
      s.add(event.parameters[0].value);
    } else {
      s.delete(event.parameters[0].value);
    }
    return s;
  }, new Set());

  console.info(`${YELLOW}${key}: ${address}${RESET}`);
  console.log("Logs");
  console.log(log.join("\n"));
  console.log("Wards");
  console.log(Array.from(wards).join("\n"));
}

type HREEthers = HardhatRuntimeEnvironment["ethers"];

async function inspectL1Wards(
  ethers: HREEthers,
  key: string,
  startingBlock: number
) {
  const address = getRequiredEnv(key);

  const abi = ["event Rely(address indexed)", "event Deny(address indexed)"];

  const contract = new Contract(address, abi, ethers.provider);

  const relyEvents = await contract.queryFilter(
    contract.filters.Rely(),
    startingBlock
  );
  const denyEvents = await contract.queryFilter(
    contract.filters.Deny(),
    startingBlock
  );

  const sorted = [...relyEvents, ...denyEvents].sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? a.logIndex - b.logIndex
      : a.blockNumber - b.logIndex
  );

  const logs = await Promise.all(
    sorted.map(async (event: any) => {
      const timestamp = new Date(
        1000 * (await ethers.provider.getBlock(event.blockHash)).timestamp
      ).toISOString();
      return `${timestamp} - ${event.event} ${event.args[0]}`;
    })
  );

  const wards = sorted.reduce((s: Set<string>, event: any) => {
    if (event.event === "Rely") {
      s.add(event.args[0]);
    } else {
      s.delete(event.args[0]);
    }
    return s;
  }, new Set());

  console.info(`${YELLOW}${key}: ${address}${RESET}`);
  console.log("Logs");
  console.log(logs.join("\n"));
  console.log("Wards");
  console.log(Array.from(wards).join("\n"));
}

function showNumber(n: BigNumberish) {
  if (constants.MaxUint256.eq(n)) {
    return "MAX";
  }
  return utils.formatEther(n);
}

async function inspectL1EscrowAllowances(
  network: string,
  ethers: HREEthers,
  startingBlock: number
) {
  const escrowAddress = getRequiredEnv(`${network}_L1_ESCROW_ADDRESS`);
  const daiAddress = getRequiredEnv(`${network}_L1_DAI_ADDRESS`);

  const abi = [
    "event Approval(address indexed, address indexed, uint256)",
    "function allowance(address, address) view returns (uint256)",
  ];

  const dai = new Contract(daiAddress, abi, ethers.provider);

  const events = await dai.queryFilter(
    dai.filters.Approval(escrowAddress),
    startingBlock
  );

  const logs = await Promise.all(
    events.map(async (event: any) => {
      const timestamp = new Date(
        1000 * (await ethers.provider.getBlock(event.blockHash)).timestamp
      ).toISOString();
      return `${timestamp} - ${event.event} ${event.args[1]}, ${showNumber(
        event.args[2]
      )}`;
    })
  );

  const addresses = events.reduce(
    (s: Set<string>, event: any) => s.add(event.args[1]),
    new Set()
  );

  const allowances = await Promise.all(
    Array.from(addresses).map(
      async (a) => `${a}: ${showNumber(await dai.allowance(escrowAddress, a))}`
    )
  );

  console.info(`${YELLOW}L1_DAI_ESCROW: ${escrowAddress}${RESET}`);
  console.log("Logs");
  console.log(logs.join("\n"));
  console.log("Allowance");
  console.log(Array.from(allowances).join("\n"));
}

task("inspect-wards", "Inspect wards").setAction(async (_, hre) => {
  const { NETWORK } = getNetwork(hre);

  const startingBlock = Number.parseInt(
    getRequiredEnv(`${NETWORK}_STARTING_BLOCK`)
  );

  await inspectL1EscrowAllowances(NETWORK, hre.ethers, startingBlock);

  await inspectL1Wards(
    hre.ethers,
    `${NETWORK}_L1_ESCROW_ADDRESS`,
    startingBlock
  );
  await inspectL1Wards(hre.ethers, `${NETWORK}_L1_DAI_BRIDGE_ADDRESS`, startingBlock);
  await inspectL1Wards(
    hre.ethers,
    `${NETWORK}_L1_GOVERNANCE_RELAY_ADDRESS`,
    startingBlock
  );

  await inspectL2Wards(NETWORK, `${NETWORK}_L2_DAI_ADDRESS`);
  await inspectL2Wards(NETWORK, `${NETWORK}_L2_DAI_BRIDGE_ADDRESS`);
});
