import fs from 'fs';
import { task } from 'hardhat/config';
import { save, getAddress } from './utils';


let NETWORK: string;

task('account:get', 'Get L2 account information')
  .addOptionalParam('name', 'Account name')
  .setAction(async ({ name }, hre) => {
    const [signer] = await hre.ethers.getSigners();
    if (signer.provider) {
      const network = await signer.provider.getNetwork();
      NETWORK = network.name;
    }
    console.log(`Calling on ${NETWORK}`);

    const _name = name ? name : 'auth';
    const accountAddress = getAddress(`Account-${_name}`, NETWORK);
    console.log(`Account-${_name} L2 address:`, accountAddress);
});

task('account:create', 'Create new L2 account')
  .addParam('name', 'Name of account')
  .setAction(async ({ name }, hre) => {
    const [signer] = await hre.ethers.getSigners();
    if (signer.provider) {
      const network = await signer.provider.getNetwork();
      NETWORK = network.name;
    }
    console.log(`Deploying on ${NETWORK}`);

    console.log('Deploying Account');
    const AccountFactory = await hre.starknet.getContractFactory('Account');
    const Account = await AccountFactory.deploy();
    save(`Account-${name}`, Account, NETWORK);
    console.log(`Account-${name} L2 address:`, Account.address);
});

