import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import fs from 'fs';

const contractName = 'L1DAITokenBridge';
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy },
    getNamedAccounts,
  } = hre;
  const { deployer } = await getNamedAccounts();
  const network = hre.hardhatArguments.network ? hre.hardhatArguments.network : hre.config.defaultNetwork;

  const starknetCoreAddress = '0x5e6229F2D4d977d20A50219E521dE6Dd694d45cc';
  const escrowContract = fs.readFileSync(`./deployments/${network}/L1Escrow.json`).toString();
  const escrowAddress = JSON.parse(escrowContract).address;

  console.log(`Deploying ${contractName} with parameters:`);
  console.log('  starknetCoreAddress:', starknetCoreAddress);
  console.log('  escrowAddress:', escrowAddress);
  console.log();

  await deploy(contractName, {
    from: deployer,
    args: [starknetCoreAddress, escrowAddress],
    log: true,
  });
};

export default func;
func.tags = [contractName];
