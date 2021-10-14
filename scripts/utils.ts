import fs from 'fs';
import { ethers } from 'ethers';
import { StarknetContract, StarknetContractFactory } from 'hardhat/types/runtime';


const DEPLOYMENTS_DIR = `deployments`;
const MASK_250 = BigInt(2**250 - 1);

export function getAddress(contract: string, network: string) {
  try {
    return JSON.parse(fs.readFileSync(`./deployments/${network}/${contract}.json`).toString()).address;
  } catch (err) {
    throw Error(`${contract} deployment on ${network} not found, run 'yarn deploy:${network}'`);
  }
}

export function save(name: string, contract: any, network: string) {
  fs.writeFileSync(`${DEPLOYMENTS_DIR}/${network}/${name}.json`, JSON.stringify({
    'address': contract.address,
  }));
}

export function getSelectorFromName(name: string) {
  return BigInt(ethers.utils.keccak256(Buffer.from(name))) % MASK_250
}

export async function callFrom(
  contract: StarknetContract,
  call: string,
  calldata: any[],
  caller: StarknetContract,
) {
  const selector = getSelectorFromName(call);
  return caller.invoke('execute', [
    contract.address,
    selector,
    calldata.length,
    ...calldata,
  ]);
}

