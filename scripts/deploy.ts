/**
 * Full goerli deploy including any permissions that need to be set.
 */
import {
  getActiveWards,
  getAddressOfNextDeployedContract,
  getRequiredEnv,
  waitForTx,
} from "@makerdao/hardhat-utils";
import { getOptionalEnv } from "@makerdao/hardhat-utils/dist/env";
import { DEFAULT_STARKNET_NETWORK } from "@shardlabs/starknet-hardhat-plugin/dist/constants";
import { StarknetContract } from "@shardlabs/starknet-hardhat-plugin/dist/types";
import { expect } from "chai";
import { writeFileSync } from "fs";
import hre from "hardhat";
import { isEmpty } from "lodash";
import { ec, KeyPair } from "starknet";

const { genKeyPair, getStarkKey } = ec;

import { getAddress, save, Signer } from "./utils";

async function genAndSaveKeyPair(): Promise<KeyPair> {
  const keyPair = genKeyPair();
  writeFileSync(
    ".env.deployer",
    `DEPLOYER_ECDSA_PRIVATE_KEY=${keyPair.priv.toString()}`
  );
  return keyPair;
}

export async function deployDeployer() {
  const NETWORK = hre.network.name;

  const STARKNET_NETWORK =
    hre.config.mocha.starknetNetwork || DEFAULT_STARKNET_NETWORK;

  const [l1Signer] = await hre.ethers.getSigners();

  // @ts-ignore
  const BLOCK_NUMBER = await l1Signer.provider.getBlockNumber();

  console.log(`Deploying deployer on ${NETWORK}/${STARKNET_NETWORK}`);

  const keyPair = await genAndSaveKeyPair();
  const publicKey = BigInt(getStarkKey(keyPair));

  const deployer = await deployL2(
    STARKNET_NETWORK,
    "account",
    BLOCK_NUMBER,
    { _public_key: publicKey },
    "account-deployer"
  );

  writeFileSync(
    "deployer-key.json",
    JSON.stringify({ priv: keyPair.priv.toString() })
  );

  console.log(
    `Deployer private key is in deployer-key.json. It should be added to .env under DEPLOYER_ECDSA_PRIVATE_KEY`
  );

  console.log(`Next steps:`);
  console.log(`If You want to deploy dai contract now:`);
  console.log(
    `STARKNET_NETWORK=${STARKNET_NETWORK} starknet deploy --inputs ${deployer.address} --contract starknet-artifacts/contracts/l2/dai.cairo/dai.json --salt <insert salt here>`
  );
  console.log(
    `After manual dai deployment dai contract address should be added to .env:`
  );
  console.log(`${STARKNET_NETWORK.toUpperCase()}_L2_DAI_ADDRESS=...`);

  console.log(
    `To verify dai: npx hardhat starknet-verify --starknet-network ${STARKNET_NETWORK} --path contracts/l2/dai.cairo --address <L2_DAI_ADDRESS>`
  );

  console.log(
    "To find salt that will result in dai address staring with 'da1' prefix:"
  );
  console.log(`./scripts/vanity.py --ward ${deployer.address}`);
}

export async function deployBridge(): Promise<void> {
  const [l1Signer] = await hre.ethers.getSigners();

  let NETWORK;
  if (hre.network.name === "fork") {
    NETWORK = "mainnet";
  } else {
    NETWORK = hre.network.name;
  }
  const STARKNET_NETWORK = hre.starknet.network || DEFAULT_STARKNET_NETWORK;

  const L1_DAI_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_DAI_ADDRESS`
  );
  const L1_STARKNET_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_STARKNET_ADDRESS`
  );

  const L2_DAI_ADDRESS = getOptionalEnv(
    `${STARKNET_NETWORK.toUpperCase()}_L2_DAI_ADDRESS`
  );

  // @ts-ignore
  const BLOCK_NUMBER = await l1Signer.provider.getBlockNumber();

  console.log(`Deploying bridge on ${NETWORK}/${STARKNET_NETWORK}`);

  const DEPLOYER_KEY = getRequiredEnv(`DEPLOYER_ECDSA_PRIVATE_KEY`);
  const l2Signer = new Signer(DEPLOYER_KEY);

  const deployer = await getL2ContractAt(
    "account",
    getAddress("account-deployer", NETWORK)
  );

  console.log(`Deploying from account: ${deployer.address.toString()}`);

  save("DAI", { address: L1_DAI_ADDRESS }, NETWORK);
  const DAIAddress = getAddress("DAI", NETWORK);

  const futureL1GovRelayAddress = await getAddressOfNextDeployedContract(
    l1Signer
  );

  const l2GovernanceRelay = await deployL2(
    STARKNET_NETWORK,
    "l2_governance_relay",
    BLOCK_NUMBER,
    {
      l1_governance_relay: BigInt(futureL1GovRelayAddress).toString(),
    }
  );

  const l1GovernanceRelay = await deployL1(
    NETWORK,
    "L1GovernanceRelay",
    BLOCK_NUMBER,
    [L1_STARKNET_ADDRESS, l2GovernanceRelay.address]
  );

  expect(
    futureL1GovRelayAddress === l1GovernanceRelay.address,
    "futureL1GovRelayAddress != l1GovernanceRelay.address"
  );

  if (L2_DAI_ADDRESS) {
    save("dai", { address: L2_DAI_ADDRESS }, NETWORK);
  }

  const l2DAI = L2_DAI_ADDRESS
    ? await getL2ContractAt("dai", L2_DAI_ADDRESS)
    : await deployL2(STARKNET_NETWORK, "dai", BLOCK_NUMBER, {
        ward: asDec(deployer.address),
      });

  const REGISTRY_ADDRESS = getOptionalEnv(
    `${NETWORK.toUpperCase()}_REGISTRY_ADDRESS`
  );

  if (REGISTRY_ADDRESS) {
    save("registry", { address: REGISTRY_ADDRESS }, NETWORK);
  }

  const registry = REGISTRY_ADDRESS
    ? await getL2ContractAt("registry", REGISTRY_ADDRESS)
    : await deployL2(STARKNET_NETWORK, "registry", BLOCK_NUMBER);

  const l1Escrow = await deployL1(NETWORK, "L1Escrow", BLOCK_NUMBER);

  const futureL1DAIBridgeAddress = await getAddressOfNextDeployedContract(
    l1Signer
  );

  const l2DAIBridge = await deployL2(
    STARKNET_NETWORK,
    "l2_dai_bridge",
    BLOCK_NUMBER,
    {
      ward: asDec(deployer.address),
      dai: asDec(l2DAI.address),
      bridge: asDec(futureL1DAIBridgeAddress),
      registry: asDec(registry.address),
    }
  );

  const futureL1DAIWormholeBridgeAddress =
    await getAddressOfNextDeployedContract(l1Signer);
  const l2DAIWormholeBridge = await deployL2(
    STARKNET_NETWORK,
    "l2_dai_wormhole_bridge",
    BLOCK_NUMBER,
    {
      ward: asDec(deployer.address),
      dai: asDec(l2DAI.address),
      wormhole_bridge: asDec(futureL1DAIWormholeBridgeAddress),
      domain: asDec(l2DAI.address),
    }
  );

  const l1DAIBridge = await deployL1(NETWORK, "L1DAIBridge", BLOCK_NUMBER, [
    L1_STARKNET_ADDRESS,
    L1_DAI_ADDRESS,
    l2DAI.address,
    l1Escrow.address,
    l2DAIBridge.address,
  ]);
  expect(
    futureL1DAIBridgeAddress === l1DAIBridge.address,
    "futureL1DAIBridgeAddress != l1DAIBridge.address"
  );

  const l1DAI = await deployL1(
    NETWORK,
    "DAIMock",
    BLOCK_NUMBER,
    [],
  );

  const l1WormholeJoin = await deployL1(
    NETWORK,
    "WormholeJoin",
    BLOCK_NUMBER,
    [
      l1DAI.address,
      hre.ethers.utils.formatBytes32String('1'), // domain
    ],
  );

  const l1WormholeRouter = await deployL1(
    NETWORK,
    "WormholeRouter",
    BLOCK_NUMBER,
    [l1DAI.address],
  );

  const l1WormholeOracleAuth = await deployL1(
    NETWORK,
    "WormholeOracleAuth",
    BLOCK_NUMBER,
    [l1WormholeJoin.address],
  );
  const oracleWallets = [...Array(1)].map(() => hre.ethers.Wallet.fromMnemonic('agent ancient glass legal group enact leaf impose canyon valid nest glimpse'))
  await l1WormholeOracleAuth.addSigners([oracleWallets[0].address]);
  // await l1WormholeOracleAuth.file("threshold", 1);

  await l1WormholeJoin.rely(l1WormholeOracleAuth.address);
  await l1WormholeJoin.rely(l1WormholeRouter.address);

  const l1DAIWormholeBridge = await deployL1(
    NETWORK,
    "L1DAIWormholeBridge",
    BLOCK_NUMBER,
    [
      L1_STARKNET_ADDRESS,
      L1_DAI_ADDRESS,
      l2DAIWormholeBridge.address,
      l1Escrow.address,
      l1WormholeRouter.address,
    ]
  );
  expect(
    futureL1DAIWormholeBridgeAddress === l1DAIWormholeBridge.address,
    "futureL1DAIWormholeBridgeAddress != l1DAIWormholeBridge.address"
  );

  const MAX = BigInt(2 ** 256) - BigInt(1);
  await l1Escrow.approve(DAIAddress, l1DAIBridge.address, MAX);
  await l1Escrow.approve(DAIAddress, l1DAIWormholeBridge.address, MAX);

  const L1_PAUSE_PROXY_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_PAUSE_PROXY_ADDRESS`
  );

  const L1_ESM_ADDRESS = getRequiredEnv(
    `${NETWORK.toUpperCase()}_L1_ESM_ADDRESS`
  );

  console.log("Finalizing permissions for L1Escrow...");
  await waitForTx(l1Escrow.rely(L1_PAUSE_PROXY_ADDRESS));
  await waitForTx(l1Escrow.rely(L1_ESM_ADDRESS));
  await waitForTx(l1Escrow.deny(await l1Signer.getAddress()));

  console.log("Finalizing permissions for L1DAIBridge...");
  await waitForTx(l1DAIBridge.rely(L1_PAUSE_PROXY_ADDRESS));
  await waitForTx(l1DAIBridge.rely(L1_ESM_ADDRESS));
  await waitForTx(l1DAIBridge.deny(await l1Signer.getAddress()));

  console.log("Finalizing permissions for L1GovernanceRelay...");
  await waitForTx(l1GovernanceRelay.rely(L1_PAUSE_PROXY_ADDRESS));
  await waitForTx(l1GovernanceRelay.rely(L1_ESM_ADDRESS));
  await waitForTx(l1GovernanceRelay.deny(await l1Signer.getAddress()));

  console.log("Finalizing permissions for L2DAI...");
  await l2Signer.sendTransaction(deployer, l2DAI, "rely", [
    asDec(l2DAIBridge.address),
  ]);
  await l2Signer.sendTransaction(deployer, l2DAI, "rely", [
    asDec(l2GovernanceRelay.address),
  ]);
  await l2Signer.sendTransaction(deployer, l2DAI, "deny", [
    asDec(deployer.address),
  ]);

  console.log("Finalizing permissions for L2DAITokenBridge...");
  await l2Signer.sendTransaction(deployer, l2DAIBridge, "rely", [
    asDec(l2GovernanceRelay.address),
  ]);
  await l2Signer.sendTransaction(deployer, l2DAIBridge, "deny", [
    asDec(deployer.address),
  ]);

  console.log("Finalizing permissions for L2DAIWormholeBridge...");
  await l2Signer.sendTransaction(deployer, l2DAIWormholeBridge, "rely", [
    asDec(l2GovernanceRelay.address),
  ]);
  await l2Signer.sendTransaction(deployer, l2DAIWormholeBridge, "deny", [
    asDec(deployer.address),
  ]);

  console.log("L1 permission sanity checks...");
  expect(await getActiveWards(l1Escrow as any)).to.deep.eq([
    L1_PAUSE_PROXY_ADDRESS,
    L1_ESM_ADDRESS,
  ]);
  expect(await getActiveWards(l1DAIBridge as any)).to.deep.eq([
    L1_PAUSE_PROXY_ADDRESS,
    L1_ESM_ADDRESS,
  ]);
  expect(await getActiveWards(l1GovernanceRelay as any)).to.deep.eq([
    L1_PAUSE_PROXY_ADDRESS,
    L1_ESM_ADDRESS,
  ]);

  console.log("L2 bridge permission sanity checks...");
  expect(await wards(l2DAIBridge, l2GovernanceRelay)).to.deep.eq(BigInt(1));
  expect(await wards(l2DAIBridge, deployer)).to.deep.eq(BigInt(0));

  console.log("L2 wormhole bridge permission sanity checks...");
  expect(await wards(l2DAIWormholeBridge, l2GovernanceRelay)).to.deep.eq(
    BigInt(1)
  );
  expect(await wards(l2DAIWormholeBridge, deployer)).to.deep.eq(BigInt(0));

  console.log("L2 dai permission sanity checks...");
  expect(await wards(l2DAI, l2GovernanceRelay)).to.deep.eq(BigInt(1));
  expect(await wards(l2DAI, l2DAIBridge)).to.deep.eq(BigInt(1));
  expect(await wards(l2DAI, l2DAIWormholeBridge)).to.deep.eq(BigInt(1));
  expect(await wards(l2DAI, deployer)).to.deep.eq(BigInt(0));
}

export function printAddresses() {
  const NETWORK = hre.network.name;

  const contracts = [
    "account-deployer",
    "dai",
    "registry",
    "L1Escrow",
    "l2_dai_bridge",
    "L1DAIBridge",
    "l2_governance_relay",
    "L1GovernanceRelay",
  ];

  const addresses = contracts.reduce(
    (a, c) => Object.assign(a, { [c]: getAddress(c, NETWORK) }),
    {}
  );

  console.log(addresses);
}

async function wards(authable: StarknetContract, ward: StarknetContract) {
  return (await authable.call("wards", { user: asDec(ward.address) })).res;
}

function asDec(address: string): string {
  return BigInt(address).toString();
}

async function getL2ContractAt(name: string, address: string) {
  console.log(`Using existing contract: ${name} at: ${address}`);
  const contractFactory = await hre.starknet.getContractFactory(name);
  return contractFactory.getContractAt(address);
}

async function deployL2(
  network: string,
  name: string,
  blockNumber: number,
  calldata: any = {},
  saveName?: string
) {
  console.log(`Deploying: ${name}${(saveName && "/" + saveName) || ""}...`);
  const contractFactory = await hre.starknet.getContractFactory(name);

  const contract = await contractFactory.deploy(calldata);
  save(saveName || name, contract, hre.network.name, blockNumber);

  console.log(`Deployed: ${saveName || name} to: ${contract.address}`);
  console.log(
    `To verify: npx hardhat starknet-verify --starknet-network ${network} --path contracts/l2/${name}.cairo --address ${contract.address}`
  );
  return contract;
}

async function deployL1(
  network: string,
  name: string,
  blockNumber: number,
  calldata: any = [],
  saveName?: string
) {
  console.log(`Deploying: ${name}${(saveName && "/" + saveName) || ""}...`);
  const contractFactory = await hre.ethers.getContractFactory(name);
  const contract = await contractFactory.deploy(...calldata);
  save(saveName || name, contract, hre.network.name, blockNumber);

  console.log(`Deployed: ${saveName || name} to: ${contract.address}`);
  console.log(
    `To verify: npx hardhat verify ${contract.address} ${calldata
      .filter((a: any) => !isEmpty(a))
      .join(" ")}`
  );
  await contract.deployed();
  return contract;
}
