/**
 * Full goerli deploy including any permissions that need to be set.
 */
import { task } from 'hardhat/config';
import fs from 'fs';
import { save, callFrom, getSelectorFromName, getAddress } from './utils';

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
  const L1EscrowFactory = await hre.ethers.getContractFactory('L1Escrow');
  const L1Escrow = await L1EscrowFactory.deploy();
  await L1Escrow.deployed();
  save('L1Escrow', L1Escrow, NETWORK);

  console.log('Deploying Account');
  const AccountFactory = await hre.starknet.getContractFactory('Account');
  const Account = await AccountFactory.deploy();
  save('Account-auth', Account, NETWORK);

  console.log('Deploying l2_dai_bridge');
  const L2DAIBridgeFactory = await hre.starknet.getContractFactory('l2_dai_bridge');
  const L2DAIBridge = await L2DAIBridgeFactory.deploy();
  save('l2_dai_bridge', L2DAIBridge, NETWORK);
  const L1DAIBridgeFactory = await hre.ethers.getContractFactory('L1DAIBridge');
  const L1DAIBridge = await L1DAIBridgeFactory.deploy(
    L1_GOERLI_STARKNET_ADDRESS,
    L1_GOERLI_DAI_ADDRESS,
    L1Escrow.address,
    L2DAIBridge.address,
  );
  await L1DAIBridge.deployed();
  save('L1DAIBridge', L1DAIBridge, NETWORK);

  console.log('Deploying dai');
  const L2DAIFactory = await hre.starknet.getContractFactory('dai');
  const L2DAI = await L2DAIFactory.deploy();
  save('dai', L2DAI, NETWORK);

  console.log('Initializing dai');
  await callFrom(L2DAI, 'initialize', [], Account);
  await callFrom(L2DAI, 'rely', [L2DAIBridge.address], Account);
  console.log('Initializing l2_dai_bridge');
  await callFrom(
    L2DAIBridge,
    'initialize',
    [BigInt(L2DAI.address).toString(), BigInt(L1DAIBridge.address).toString()],
    Account,
  );

  const DAIAddress = getAddress('DAI', NETWORK);
  const MAX = BigInt(2**256)-BigInt(1);
  await L1Escrow.approve(DAIAddress, L1DAIBridge.address, MAX);
});
