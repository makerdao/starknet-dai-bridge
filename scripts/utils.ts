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

export function getAccounts(network: string) {
  const files = fs.readdirSync(`./deployments/${network}`);
  return files.filter(file => file.slice(0, 7) === 'Account').map(file => {
    return file.split('-')[1].split('.')[0];
  });
}

export function parseCalldata(calldata: string, layer: number, network: string) {
  const _calldata = calldata ? calldata.split(',') : [];
  const accounts = getAccounts(network);
  return _calldata.map((input: string) => {
    if (accounts.includes(input)) {
      return BigInt(getAddress(`Account-${input}`, network)).toString();
    } else if (input === 'l2_dai_bridge') {
      if (layer === 1) {
        return getAddress('l2_dai_bridge', network);
      } else {
        return BigInt(getAddress('l2_dai_bridge', network)).toString();
      }
    } else if (input === 'L1DAIBridge') {
      if (layer == 1) {
        return getAddress('L1DAIBridge', network);
      } else {
        return BigInt(getAddress('L1DAIBridge', network)).toString();
      }
    } else {
      return input;
    }
  });
}

export function save(name: string, contract: any, network: string) {
  fs.writeFileSync(`${DEPLOYMENTS_DIR}/${network}/${name}.json`, JSON.stringify({
    'address': contract.address,
  }));
}

export function getSelectorFromName(name: string) {
  return (BigInt(ethers.utils.keccak256(Buffer.from(name))) % MASK_250).toString();
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

