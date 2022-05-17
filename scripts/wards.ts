import axios from "axios";
import { task } from "hardhat/config";

import { getRequiredEnv } from "./utils";
import {BigNumberish, constants, Contract, utils} from "ethers";

const YELLOW = "\x1b[33m"
const RESET = "\x1b[0m"

async function inspectL2Wards(key: string) {
  const address = `0x${BigInt(getRequiredEnv(key)).toString(16)}`;

  const url = `http://starknet.events/api/v1/get_events?chain_id=mainnet&contract=${address}&from_block=0&name=Rely&name=Deny`;
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

async function inspectL1Wards(ethers: any, key: string) {

  const infuraApiKey = getRequiredEnv("INFURA_API_KEY");
  const provider = ethers.getDefaultProvider(`https://mainnet.infura.io/v3/${infuraApiKey}`);

  const address = getRequiredEnv(key)

  const abi = [
    "event Rely(address indexed)",
    "event Deny(address indexed)",
  ];


  const contract = new Contract(address, abi, provider);

  const relyEvents = await contract.queryFilter(contract.filters.Rely(), 14742550)
  const denyEvents = await contract.queryFilter(contract.filters.Deny(), 14742550)
  // const denyEvents = []

  const sorted = [...relyEvents, ...denyEvents].sort((a, b) =>
    a.blockNumber === b.blockNumber ?
      a.logIndex - b.logIndex :
      a.blockNumber - b.logIndex
  )

  provider.getBlock()

  const logs = await Promise.all(sorted.map(
    async (event: any) => {
      const timestamp = new Date(
        1000 * (await provider.getBlock(event.blockHash)).timestamp
      ).toISOString()
      return `${timestamp} - ${event.event} ${event.args[0]}`
    }
  ));

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
  console.log(logs.join('\n'))
  console.log("Wards");
  console.log(Array.from(wards).join("\n"));
}

function showNumber(n: BigNumberish) {
  if(constants.MaxUint256.eq(n)) {
    return 'MAX'
  }
  return utils.formatEther(n)
}

async function inspectL1EscrowAllowances(ethers: any) {

  const infuraApiKey = getRequiredEnv("INFURA_API_KEY");
  const provider = ethers.getDefaultProvider(`https://mainnet.infura.io/v3/${infuraApiKey}`);

  const escrowAddress = getRequiredEnv('ALPHA_MAINNET_L1_ESCROW_ADDRESS')
  const daiAddress = getRequiredEnv('ALPHA_MAINNET_L1_DAI_ADDRESS')

  const abi = [
    "event Approval(address indexed, address indexed, uint256)",
    "function allowance(address, address) view returns (uint256)"
  ];


  const dai = new Contract(daiAddress, abi, provider);

  const events = await dai.queryFilter(dai.filters.Approval(escrowAddress), 14742550)

  const logs = await Promise.all(events.map(
    async (event: any) => {
      const timestamp = new Date(
        1000 * (await provider.getBlock(event.blockHash)).timestamp
      ).toISOString()
      return `${timestamp} - ${event.event} ${event.args[1]}, ${showNumber(event.args[2])}`
    }
  ));

  const addresses = events.reduce((s: Set<string>, event: any) => s.add(event.args[1]), new Set());

  const allowances = await Promise.all(
    Array.from(addresses)
      .map(async a => `${a}: ${showNumber(await dai.allowance(escrowAddress, a))}`)
  )

  console.info(`${YELLOW}L1_DAI_ESCROW: ${escrowAddress}${RESET}`);
  console.log("Logs");
  console.log(logs.join('\n'))
  console.log("Allowance");
  console.log(Array.from(allowances).join("\n"));
}


task("inspect-wards", "Inspect wards").setAction(async (_, hre) => {

  await inspectL1EscrowAllowances(hre.ethers)

  await inspectL1Wards(hre.ethers,`ALPHA_MAINNET_L1_ESCROW_ADDRESS`);
  await inspectL1Wards(hre.ethers,`ALPHA_MAINNET_L1_DAI_BRIDGE`);
  await inspectL1Wards(hre.ethers,`ALPHA_MAINNET_L1_GOVERNANCE_RELAY`);

  await inspectL2Wards(`ALPHA_MAINNET_L2_DAI_ADDRESS`);
  await inspectL2Wards(`ALPHA_MAINNET_L2_DAI_BRIDGE`);
});
