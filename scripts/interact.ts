import { task } from 'hardhat/config';
import { callFrom, getSelectorFromName, getAddress, parseCalldata } from './utils';

let NETWORK: string;

task('invoke:l2', 'Invoke an L2 contract')
  .addParam('contract', 'Contract to call')
  .addParam('func', 'Function to call')
  .addOptionalParam('calldata', 'Inputs to the function')
  .addOptionalParam('name', 'Account name to execute from')
  .setAction(async ({ contract, func, calldata, name }, hre) => {
    const [signer] = await hre.ethers.getSigners();
    if (signer.provider) {
      const network = await signer.provider.getNetwork();
      NETWORK = network.name;
    }
    console.log(`Calling on ${NETWORK}`);

    const address = getAddress(contract, NETWORK);
    const contractFactory = await hre.starknet.getContractFactory(contract);
    const contractInstance = await contractFactory.getContractAt(address);
    const _name = name ? name : 'auth';
    const accountAddress = getAddress(`Account-${_name}`, NETWORK);
    const accountFactory = await hre.starknet.getContractFactory('Account');
    const accountInstance = await accountFactory.getContractAt(accountAddress);

    const _calldata = parseCalldata(calldata, 2, NETWORK);
    const res = await callFrom(
      contractInstance,
      func,
      _calldata,
      accountInstance,
    );
    console.log('Response:', res);
});

task('call:l2', 'Call an L2 contract')
  .addParam('contract', 'Contract to call')
  .addParam('func', 'Function to call')
  .addOptionalParam('calldata', 'Inputs to the function')
  .setAction(async ({ contract, func, calldata }, hre) => {
    const [signer] = await hre.ethers.getSigners();
    if (signer.provider) {
      const network = await signer.provider.getNetwork();
      NETWORK = network.name;
    }
    console.log(`Calling on ${NETWORK}`);

    const address = getAddress(contract, NETWORK);
    const contractFactory = await hre.starknet.getContractFactory(contract);
    const contractInstance = await contractFactory.getContractAt(address);

    const _calldata = parseCalldata(calldata, 2, NETWORK);
    const res = await contractInstance.call(func, _calldata);
    console.log('Response:', res);
});

task('call:l1', 'Call an L1 contract')
  .addParam('contract', 'Contract to call')
  .addParam('func', 'Function to call')
  .addOptionalParam('calldata', 'Inputs to the function')
  .setAction(async ({ contract, func, calldata }, hre) => {
    const [signer] = await hre.ethers.getSigners();
    if (signer.provider) {
      const network = await signer.provider.getNetwork();
      NETWORK = network.name;
    }
    console.log(`Calling on ${NETWORK}`);

    const address = getAddress(contract, NETWORK);
    const contractFactory = await hre.ethers.getContractFactory(contract) as any;
    const contractInstance = await contractFactory.attach(address);

    const _calldata = parseCalldata(calldata, 1, NETWORK);
    const res = await contractInstance[func](..._calldata);
    console.log('Response:', res);
});
