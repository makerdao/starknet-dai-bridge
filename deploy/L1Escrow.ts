import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const contractName = 'L1Escrow';
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy },
    getNamedAccounts,
  } = hre;
  const { deployer } = await getNamedAccounts();

  const daiAddress = '0x6b175474e89094c44da98b954eedeac495271d0f';
  console.log(`Deploying ${contractName} with parameters:`);
  console.log('  daiAddress:', daiAddress);
  console.log();

  await deploy(contractName, {
    from: deployer,
    args: [daiAddress],
    log: true,
  });
};

export default func;
func.tags = [contractName];
