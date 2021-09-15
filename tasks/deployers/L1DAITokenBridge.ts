import { task } from 'hardhat/config';
import { TaskArguments } from 'hardhat/types';

const contractName = 'L1DAITokenBridge';
task(`deploy:${contractName}`)
  .setAction(async function (taskArguments: TaskArguments, { ethers }) {
    const contractFactory = await ethers.getContractFactory(contractName);
    const contract = await contractFactory.deploy();
    await contract.deployed();
    console.log(`${contractName} deploy to:`, contract.address);
  });
