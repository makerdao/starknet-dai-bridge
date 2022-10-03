import "hardhat-gas-reporter";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "solidity-coverage";
import "@shardlabs/starknet-hardhat-plugin";
import "./scripts/deploySpell";
import "./scripts/deployBridge";
import "./scripts/deployBridgeUpgrade";
import "./scripts/deployEscrowMom";
import "./scripts/deployTeleport";
import "./scripts/wards";
import "./scripts/testIntegration";

import { config as dotenvConfig } from "dotenv";
import { NetworkUserConfig } from "hardhat/types";
import { resolve } from "path";

dotenvConfig({ path: resolve(__dirname, "./.env") });

const chainIds = {
  goerli: 5,
  hardhat: 31337,
  kovan: 42,
  mainnet: 1,
  rinkeby: 4,
  ropsten: 3,
};

// Ensure that we have all the environment variables we need.
const mnemonic: string | undefined = process.env.MNEMONIC;
if (!mnemonic) {
  throw new Error("Please set your MNEMONIC in a .env file");
}

const infuraApiKey: string | undefined = process.env.INFURA_API_KEY;
if (!infuraApiKey) {
  throw new Error("Please set your INFURA_API_KEY in a .env file");
}

let test: string;
if (process.env.TEST_ENV === "e2e") {
  test = "e2e";
} else {
  test = "l1:*";
}

function getChainConfig(network: keyof typeof chainIds): NetworkUserConfig {
  const url: string = `https://${network}.infura.io/v3/${infuraApiKey}`;

  const common = {
    chainId: chainIds[network],
    url,
    gasMultiplier: 1.5,
  };
  if (
    network === "mainnet" &&
    process.env.STARKNET_NETWORK === "alpha-mainnet" &&
    process.env["ALPHA_MAINNET_DEPLOYER_PRIVATE_KEY"]
  ) {
    return {
      ...common,
      accounts: [process.env["ALPHA_MAINNET_DEPLOYER_PRIVATE_KEY"]],
      gasMultiplier: 3,
    };
  }

  return {
    ...common,
    accounts: {
      count: 10,
      mnemonic,
      path: "m/44'/60'/0'/0",
    },
  };
}

// const config: HardhatUserConfig = {
const config = {
  defaultNetwork: "hardhat",
  networks: {
    goerli: getChainConfig("goerli"),
    mainnet: getChainConfig("mainnet"),
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    devnet: {
      url: "http://127.0.0.1:5050",
    },
    hardhat: {
      accounts: {
        count: 10,
        mnemonic,
        path: "m/44'/60'/0'/0",
      },
    },
  },
  starknet: {
    dockerizedVersion: "0.10.0",
    network: process.env.STARKNET_NETWORK,
    wallets: {
      user: {
        accountName: "user",
        modulePath:
          "starkware.starknet.wallets.open_zeppelin.OpenZeppelinAccount",
        accountPath: "~/.starknet_accounts",
      },
      deployer: {
        accountName: "deployer",
        modulePath:
          "starkware.starknet.wallets.open_zeppelin.OpenZeppelinAccount",
        accountPath: "~/.starknet_accounts",
      },
    },
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
    starknetSources: "./contracts",
    starknetArtifacts: "./starknet-artifacts",
  },
  mocha: {
    grep: test,
  },
  solidity: {
    compilers: [
      {
        version: "0.8.14",
        settings: {
          metadata: {
            // Not including the metadata hash
            // https://github.com/paulrberg/solidity-template/issues/31
            bytecodeHash: "none",
          },
          // Disable the optimizer when debugging
          // https://hardhat.org/hardhat-network/#solidity-optimizer-support
          optimizer: {
            enabled: true,
            runs: 800,
          },
        },
      },
    ],
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};

export default config;
