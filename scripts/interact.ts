import { task } from 'hardhat/config';
import { callFrom, getSelectorFromName, getAddress } from './utils';

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
    const ContractFactory = await hre.starknet.getContractFactory(contract);
    const Contract = await ContractFactory.getContractAt(address);
    const _name = name ? name : 'auth';
    const accountAddress = getAddress(`Account-${_name}`, NETWORK);
    const AccountFactory = await hre.starknet.getContractFactory('Account');
    const Account = await AccountFactory.getContractAt(accountAddress);

    const _calldata = calldata ? calldata.split(',') : [];
    const res = await callFrom(
      Contract,
      func,
      _calldata,
      Account,
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
    const ContractFactory = await hre.starknet.getContractFactory(contract);
    const Contract = await ContractFactory.getContractAt(address);

    const _calldata = calldata ? calldata.split(',') : [];
    const res = await Contract.call(func, _calldata);
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
    const ContractFactory = await hre.ethers.getContractFactory(contract);
    const Contract = await ContractFactory.attach(address);

    const _calldata = calldata ? calldata.split(',') : [];
    const res = await Contract[func](..._calldata);
    console.log('Response:', res);
});
