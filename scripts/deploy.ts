/**
 * Full goerli deploy including any permissions that need to be set.
 */
import { task } from 'hardhat/config';
import { StarknetContract, StarknetContractFactory } from 'hardhat/types/runtime';
import { ethers } from 'ethers';
import fs from 'fs';

const L1_GOERLI_DAI_ADDRESS = '0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844';
const L1_GOERLI_STARKNET_ADDRESS = '0x5e6229F2D4d977d20A50219E521dE6Dd694d45cc';
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

function save(name: string, contract: any) {
  fs.writeFileSync(`${DEPLOYMENTS_DIR}/${NETWORK}/${name}.json`, JSON.stringify({
    'address': contract.address,
    'abi': contract.abi,
  }));
}

task('deploy', '', async (_taskArgs, hre) => {
  const [signer] = await hre.ethers.getSigners();
  if (signer.provider) {
    const network = await signer.provider.getNetwork();
    NETWORK = network.name;
  }
  console.log(`Deploying on ${NETWORK}`);

  console.log('Deploying L1Escrow');
  const L1Escrow = await hre.ethers.getContractFactory('L1Escrow');
  const l1Escrow = await L1Escrow.deploy();
  await l1Escrow.deployed();
  save('L1Escrow', l1Escrow);

  console.log('Deploying Account');
  const Account = await hre.starknet.getContractFactory('Account');
  const account = await Account.deploy();
  save('Account', account);
  const publicKey = 1
  const l1Address = 0
  account.invoke('initialize', [publicKey, l1Address]);

  console.log('Deploying l2_dai_bridge');
  const L2DaiBridge = await hre.starknet.getContractFactory('l2_dai_bridge');
  const l2DaiBridge = await L2DaiBridge.deploy();
  save('l2_dai_bridge', l2DaiBridge);
  const L1DaiBridge = await hre.ethers.getContractFactory('L1DAIBridge');
  const l1DaiBridge = await L1DaiBridge.deploy(
    L1_GOERLI_STARKNET_ADDRESS,
    L1_GOERLI_DAI_ADDRESS,
    l1Escrow.address,
    l2DaiBridge.address,
  );
  await l1DaiBridge.deployed();
  save('L1DAIBridge', l1DaiBridge);

  console.log('Deploying dai');
  const l2DaiContractFactory = await hre.starknet.getContractFactory('dai');
  const l2DaiContract = await l2DaiContractFactory.deploy();
  save('dai', l2DaiContract);
  await call_from(
    l2DaiBridge,
    'initialize',
    [l2DaiContract.address, l1DaiBridge.address],
    account,
  );

  await call_from(l2DaiContract, 'initialize', [], account);
});
