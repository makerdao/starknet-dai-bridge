/**
 * Full goerli deploy including any permissions that need to be set.
 */
require('dotenv').config()
import { JsonRpcProvider } from '@ethersproject/providers'
import { getRequiredEnv } from '@makerdao/hardhat-utils'
import hre from 'hardhat'
import { mapValues } from 'lodash'

import { deploy } from './common'

const L1_GOERLI_RPC_URL = getRequiredEnv('L1_GOERLI_RPC_URL')
const L1_GOERLI_DEPLOYER_PRIV_KEY = getRequiredEnv('L1_GOERLI_DEPLOYER_PRIV_KEY')

const L1_GOERLI_DAI_ADDRESS = '0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844'
const L1_GOERLI_STARKNET_ADDRESS = '0x5e6229F2D4d977d20A50219E521dE6Dd694d45cc'

const L2_DAI_BRIDGE_ADDRESS = '12345'

async function main() {
  console.log('Deploying on goerli')

  const l1Provider = new JsonRpcProvider(L1_GOERLI_RPC_URL)
  const l1Deployer = new hre.ethers.Wallet(L1_GOERLI_DEPLOYER_PRIV_KEY, l1Provider)

  const deploymentInfo = await deploy({
    l1Deployer: l1Deployer,
    L1_DAI_ADDRESS: L1_GOERLI_DAI_ADDRESS,
    L1_STARKNET_ADDRESS: L1_GOERLI_STARKNET_ADDRESS,
    L2_DAI_BRIDGE_ADDRESS: L2_DAI_BRIDGE_ADDRESS,
    L1_TX_OPTS: {
      gasPrice: 3000000000, // 3 gwei
    },
  })

  const allContractInfo = {
    l1Dai: L1_GOERLI_DAI_ADDRESS,
    ...mapValues(deploymentInfo, (v) => v.address),
  }

  console.log(JSON.stringify(allContractInfo, null, 2))
}

main()
  .then(() => console.log('DONE'))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
