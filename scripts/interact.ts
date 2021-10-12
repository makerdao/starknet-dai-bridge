import { task } from 'hardhat/config';
import { StarknetContract, StarknetContractFactory } from 'hardhat/types/runtime';
import { ethers } from 'ethers';
import fs from 'fs';

const MASK_250 = BigInt(2**250 - 1);
let NETWORK: string;
const DEPLOYMENTS_DIR = `deployments`;

function getSelectorFromName(name: string) {
  return BigInt(ethers.utils.keccak256(Buffer.from(name))) % MASK_250
}

async function call_from(
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

function getAddress(contract: string) {
    return JSON.parse(fs.readFileSync(`./deployments/${NETWORK}/${contract}.json`).toString()).address;
}

task('invoke:l2', '')
  .addParam('contract', 'Contract to call')
  .addParam('function', 'Function to call')
  .addOptionalParam('calldata', 'Inputs to the function')
  .setAction(async (_taskArgs, hre) => {
    const [signer] = await hre.ethers.getSigners();
    if (signer.provider) {
      const network = await signer.provider.getNetwork();
      NETWORK = network.name;
    }
    console.log(`Calling on ${NETWORK}`);

    const address = getAddress(_taskArgs.contract);
    const contractFactory = await hre.starknet.getContractFactory(_taskArgs.contract);
    const contract = await contractFactory.getContractAt(address);
    const accountAddress = getAddress('Account');
    const Account = await hre.starknet.getContractFactory('Account');
    const account = await Account.getContractAt(accountAddress);

    let res;
    if (_taskArgs.calldata) {
      res = await call_from(
        contract,
        _taskArgs.function,
        _taskArgs.calldata.split(','),
        account,
      );
    } else {
      res = await call_from(
        contract,
        _taskArgs.function,
        [],
        account,
      );
    }
    console.log(res);
});

task('call:l2', '')
  .addParam('contract', 'Contract to call')
  .addParam('function', 'Function to call')
  .addOptionalParam('calldata', 'Inputs to the function')
  .setAction(async (_taskArgs, hre) => {
    const [signer] = await hre.ethers.getSigners();
    if (signer.provider) {
      const network = await signer.provider.getNetwork();
      NETWORK = network.name;
    }
    console.log(`Calling on ${NETWORK}`);

    const address = getAddress(_taskArgs.contract);
    const contractFactory = await hre.starknet.getContractFactory(_taskArgs.contract);
    const contract = await contractFactory.getContractAt(address);
    const accountAddress = getAddress('Account');
    const Account = await hre.starknet.getContractFactory('Account');
    const account = await Account.getContractAt(accountAddress);

    let res;
    if (_taskArgs.calldata) {
      res = await contract.call(_taskArgs.function, _taskArgs.calldata.split(','));
    } else {
      res = await contract.call(_taskArgs.function, []);
    }
    console.log(res);
});

task('call:l1', '')
  .addParam('contract', 'Contract to call')
  .addParam('function', 'Function to call')
  .addOptionalParam('calldata', 'Inputs to the function')
  .setAction(async (_taskArgs, hre) => {
    const [signer] = await hre.ethers.getSigners();
    if (signer.provider) {
      const network = await signer.provider.getNetwork();
      NETWORK = network.name;
    }
    console.log(`Calling on ${NETWORK}`);

    const address = getAddress(_taskArgs.contract);
    const contractFactory = await hre.ethers.getContractFactory(_taskArgs.contract);
    const contract = await contractFactory.attach(address);

    let res;
    if (_taskArgs.calldata) {
      res = await contract[_taskArgs.function](..._taskArgs.calldata.split(','));
    } else {
      res = await contract[_taskArgs.function]();
    }
    console.log(res);
});
