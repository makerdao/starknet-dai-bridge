import "hardhat-gas-reporter";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "solidity-coverage";
import "@shardlabs/starknet-hardhat-plugin";
import "./scripts/deployBridge";
import "./scripts/deployBridgeUpgrade";
import "./scripts/deployEscrowMom";
import "./scripts/deployTeleport";
import "./scripts/wards";
import "./scripts/testIntegration";
import "./scripts/deployGovRelayUpgrade";

import { config as dotenvConfig } from "dotenv";
import { NetworkUserConfig } from "hardhat/types";
import { resolve } from "path";

dotenvConfig({ path: resolve(__dirname, "./.env") });

const chainIds = {
  "alpha-mainnet": 1,
  "alpha-goerli": 5,
  localhost: 31337,
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

function getStarknetNetwork() {
  const i = process.argv.indexOf("--network");
  if (i === -1) {
    return "alpha-goerli";
  }
  const network = process.argv[i + 1];
  if (["alpha-goerli", "alpha-mainnet", "localhost"].indexOf(network) === -1) {
    throw new Error(`Wrong network: ${network}`);
  }

  if (network === "localhost") {
    return "devnet";
  }

  return network;
}

let test: string;
if (process.env.TEST_ENV === "e2e") {
  test = "e2e";
} else {
  test = "l1:*";
}

function getChainConfig(network: keyof typeof chainIds): NetworkUserConfig {
  const url: string = `https://${
    network.split("-")[1]
  }.infura.io/v3/${infuraApiKey}`;

  const common = {
    chainId: chainIds[network],
    url,
    gasMultiplier: 1.5,
  };
  const ALPHA_MAINNET_PK = process.env["ALPHA_MAINNET_DEPLOYER_PRIVATE_KEY"];
  if (network === "alpha-mainnet" && ALPHA_MAINNET_PK) {
    return {
      ...common,
      accounts: [ALPHA_MAINNET_PK],
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

console.log("getStarknetNetwork", getStarknetNetwork());

const config = {
  defaultNetwork: "hardhat",
  networks: {
    "alpha-goerli": getChainConfig("alpha-goerli"),
    "alpha-mainnet": getChainConfig("alpha-mainnet"),
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    devnet: {
      //starknet devnet endpoint
      url: "http://127.0.0.1:5050",
    },
  },
  starknet: {
    dockerizedVersion: "0.10.0",
    network: getStarknetNetwork(),
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
