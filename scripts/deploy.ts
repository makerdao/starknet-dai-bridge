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

  const l1Escrow = await deploy(hre, 'L1Escrow', 1, []);

  const account = await deploy(hre, 'Account', 2, [], 'Account-auth');

  const l2DAIBridge = await deploy(hre, 'l2_dai_bridge', 2, []);

  const l1DAIBridge = await deploy(hre, 'L1DAIBridge', 1, [
    L1_GOERLI_STARKNET_ADDRESS,
    L1_GOERLI_DAI_ADDRESS,
    l1Escrow.address,
    l2DAIBridge.address,
  ]);

  const l2DAI = await deploy(hre, 'dai', 2, []);

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

  const l2GovernanceRelay = await deploy(hre, 'L2GovernanceRelay', 2, []);

  const l1GovernanceRelay = await deploy(hre, 'L1GovernanceRelay', 1, [
    L1_GOERLI_STARKNET_ADDRESS,
    l2GovernanceRelay.address,
  ]);

  console.log('Initializing L2GovernanceRelay');
  await l2GovernanceRelay.invoke('initialize', [
    l1GovernanceRelay.address,
    l2DAI.address,
    l2DAIBridge.address,
  ]);
});

async function deploy(hre: any, contractName: string, layer: 1 | 2, calldata: any[], saveName?: string) {
  const network = layer === 1 ? 'ethers' : 'starknet';
  console.log(`Deploying ${contractName}`);
  const contractFactory = await hre[network].getContractFactory(contractName);
  const contract = await contractFactory.deploy(...calldata);
  const fileName = saveName || contractName;
  save(fileName, contract, NETWORK);
  if (layer === 1) {
    await contract.deployed();
  }
  return contract;
}
