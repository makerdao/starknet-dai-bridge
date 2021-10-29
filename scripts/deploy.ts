/**
 * Full goerli deploy including any permissions that need to be set.
 */
import { task } from 'hardhat/config';
import fs from 'fs';
import { save, callFrom, getAddress } from './utils';

const L1_GOERLI_DAI_ADDRESS = '0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844';
const L1_GOERLI_STARKNET_ADDRESS = '0x5e6229F2D4d977d20A50219E521dE6Dd694d45cc';
let NETWORK: string;

task('deploy', 'Full deployment', async (_taskArgs, hre) => {
  const [signer] = await hre.ethers.getSigners();
  if (signer.provider) {
    const network = await signer.provider.getNetwork();
    NETWORK = network.name;
  }
  console.log(`Deploying on ${NETWORK}`);

  if (!fs.existsSync(`./deployments/${NETWORK}`)) {
    fs.mkdirSync(`./deployments/${NETWORK}`);
  }
  save('DAI', { address: L1_GOERLI_DAI_ADDRESS }, NETWORK);

  console.log('Deploying L1Escrow');
  const l1EscrowFactory = await hre.ethers.getContractFactory('L1Escrow');
  const l1Escrow = await l1EscrowFactory.deploy();
  await l1Escrow.deployed();
  save('L1Escrow', l1Escrow, NETWORK);

  console.log('Deploying Account');
  const accountFactory = await hre.starknet.getContractFactory('Account');
  const account = await accountFactory.deploy();
  save('Account-auth', account, NETWORK);

  console.log('Deploying l2_dai_bridge');
  const l2DAIBridgeFactory = await hre.starknet.getContractFactory('l2_dai_bridge');
  const l2DAIBridge = await l2DAIBridgeFactory.deploy();
  save('l2_dai_bridge', l2DAIBridge, NETWORK);
  const l1DAIBridgeFactory = await hre.ethers.getContractFactory('L1DAIBridge');
  const l1DAIBridge = await l1DAIBridgeFactory.deploy(
    L1_GOERLI_STARKNET_ADDRESS,
    L1_GOERLI_DAI_ADDRESS,
    l1Escrow.address,
    l2DAIBridge.address,
  );
  await l1DAIBridge.deployed();
  save('L1DAIBridge', l1DAIBridge, NETWORK);

  console.log('Deploying dai');
  const l2DAIFactory = await hre.starknet.getContractFactory('dai');
  const l2DAI = await l2DAIFactory.deploy();
  save('dai', l2DAI, NETWORK);

  console.log('Initializing dai');
  await callFrom(l2DAI, 'initialize', [], account);
  await callFrom(l2DAI, 'rely', [l2DAIBridge.address], account);
  console.log('Initializing l2_dai_bridge');
  await callFrom(
    l2DAIBridge,
    'initialize',
    [BigInt(l2DAI.address).toString(), BigInt(l1DAIBridge.address).toString()],
    account,
  );

  const DAIAddress = getAddress('DAI', NETWORK);
  const MAX = BigInt(2**256)-BigInt(1);
  await l1Escrow.approve(DAIAddress, l1DAIBridge.address, MAX);
});
