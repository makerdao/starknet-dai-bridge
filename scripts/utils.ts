/**
 * Full goerli deploy including any permissions that need to be set.
 */
import { DEFAULT_STARKNET_NETWORK } from "@shardlabs/starknet-hardhat-plugin/dist/constants";
import { StarknetContract } from "@shardlabs/starknet-hardhat-plugin/dist/types";
import { ethers } from "ethers";
import { writeFileSync } from "fs";
import fs from "fs";
import { isEmpty } from "lodash";
import { ec, hash } from "starknet";
const { genKeyPair, getKeyPair, getStarkKey, sign, verify } = ec;
const { hashMessage } = hash;
import type { KeyPair, Signature } from "starknet";

const DEPLOYMENTS_DIR = `deployments`;
const MASK_250 = BigInt(2 ** 250 - 1);

export function getAddress(contract: string, network: string) {
  try {
    return JSON.parse(
      fs.readFileSync(`./deployments/${network}/${contract}.json`).toString()
    ).address;
  } catch (err) {
    throw Error(
      `${contract} deployment on ${network} not found, run 'yarn deploy:${network}'`
    );
  }
}

function getAccounts(network: string) {
  const files = fs.readdirSync(`./deployments/${network}`);
  return files
    .filter((file) => file.slice(0, 7) === "account")
    .map((file) => {
      return file.split("-")[1].split(".")[0];
    });
}

export function parseCalldataL1(calldata: string, network: string) {
  const _calldata = calldata ? calldata.split(",") : [];
  const accounts = getAccounts(network);
  return _calldata.map((input: string) => {
    if (accounts.includes(input)) {
      return BigInt(getAddress(`account-${input}`, network)).toString();
    } else if (input === "l2_dai_bridge") {
      return getAddress("l2_dai_bridge", network);
    } else if (input === "L1DAIBridge") {
      return getAddress("L1DAIBridge", network);
    } else {
      return input;
    }
  });
}

function getInputAbi(contract: string, func: string) {
  const abi = JSON.parse(
    fs
      .readFileSync(
        `./starknet-artifacts/contracts/l2/${contract}.cairo/${contract}.json`
      )
      .toString()
  )["abi"];
  let res: any[] = [];
  abi.forEach((_: any) => {
    if (_.name === func) {
      res = _.inputs;
    }
  });
  return res;
}

export function parseCalldataL2(
  calldata: string,
  network: string,
  contract: any,
  func: string
) {
  const _calldata = calldata ? calldata.split(",") : [];
  const accounts = getAccounts(network);
  const res: Record<string, any> = {};
  const inputs = getInputAbi(contract, func);
  for (let i = 0; i < _calldata.length; i++) {
    const input = _calldata[i];
    const inputName: string = inputs[i].name;
    const inputType: string = inputs[i].type;
    if (accounts.includes(input)) {
      res[inputName] = BigInt(
        getAddress(`account-${input}`, network)
      ).toString();
    } else if (input === "l2_dai_bridge") {
      res[inputName] = BigInt(getAddress("l2_dai_bridge", network)).toString();
    } else if (input === "L1DAIBridge") {
      res[inputName] = BigInt(getAddress("L1DAIBridge", network)).toString();
    } else if (inputType === "Uint256") {
      res[inputName] = [input, _calldata[i + 1]];
      i++;
    } else {
      res[inputName] = input;
    }
  }
  return res;
}

export function save(
  name: string,
  contract: any,
  network: string,
  block?: number
) {
  if (!fs.existsSync(`${DEPLOYMENTS_DIR}/${network}`)) {
    fs.mkdirSync(`${DEPLOYMENTS_DIR}/${network}`, { recursive: true });
  }
  fs.writeFileSync(
    `${DEPLOYMENTS_DIR}/${network}/${name}.json`,
    JSON.stringify({
      address: contract.address,
      block,
    })
  );
}

function getSelectorFromName(name: string) {
  return (
    BigInt(ethers.utils.keccak256(Buffer.from(name))) % MASK_250
  ).toString();
}

function flatten(calldata: any): any[] {
  const res: any = [];
  Object.values(calldata).forEach((data: any) => {
    if (typeof data === "object") {
      res.push(...data);
    } else {
      res.push(data);
    }
  });
  return res;
}

export class Signer {
  privateKey;
  keyPair: KeyPair;
  publicKey;

  constructor(privateKey: string) {
    this.privateKey = privateKey;
    this.keyPair = getKeyPair(this.privateKey);
    this.publicKey = getStarkKey(this.keyPair);
  }

  sign(msgHash: string): Signature {
    return sign(this.keyPair, msgHash);
  }

  verify(msgHash: string, sig: Signature): boolean {
    return verify(this.keyPair, msgHash, sig);
  }

  async sendTransaction(
    caller: StarknetContract,
    contract: StarknetContract,
    selectorName: string,
    calldata: any[] | any,
    nonce: number = 0
  ) {
    if (nonce === 0) {
      const executionInfo = await caller.call("get_nonce");
      nonce = executionInfo.res;
    }

    const selector = getSelectorFromName(selectorName);
    const contractAddress = BigInt(contract.address).toString();
    const _calldata = flatten(calldata);
    const msgHash = hashMessage(
      caller.address,
      contract.address,
      selector,
      _calldata,
      nonce.toString()
    );

    const sig = this.sign(msgHash);
    // const verified = this.verify(msgHash, sig);

    return caller.invoke(
      "execute",
      {
        to: contractAddress,
        selector,
        calldata: _calldata,
      },
      [sig.r, sig.s]
    );
  }
}

export async function genAndSaveKeyPair(): Promise<KeyPair> {
  const keyPair = genKeyPair();
  writeFileSync(
    ".env.deployer",
    `DEPLOYER_ECDSA_PRIVATE_KEY=${keyPair.priv.toString()}`
  );
  return keyPair;
}

export function printAddresses(hre: any) {
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

export function writeAddresses(hre: any) {

  const NETWORK = hre.network.name;

  const variables = [
    ["L1_ESCROW_ADDRESS", "L1Escrow"],
    ["L2_DAI_ADDRESS", "l2_dai_bridge"],
    ["L1_GOVERNANCE_RELAY_ADDRESS", "L1GovernanceRelay"],
    ["L2_GOVERNANCE_RELAY_ADDRESS", "l2_governance_relay"],
    ["L1_DAI_BRIDGE_ADDRESS", "L1DAIBridge"],
    ["L2_DAI_BRIDGE_ADDRESS", "l2_dai_bridge"],
    ["L1_DAI_WORMHOLE_BRIDGE_ADDRESS", "L1DAIWormholeBridge"],
    ["L2_DAI_WORMHOLE_BRIDGE_ADDRESS", "l2_dai_wormhole_bridge"],
  ];

  const addresses = variables.reduce(
    (a, c) => {
      const address = getAddress(c[1], NETWORK);
      if (address) {
        return `${a}${NETWORK.toUpperCase()}_${c[0]}=${address}\n`;
      } else {
        return a;
      }
    },
    "",
  );

  fs.writeFileSync(".env.deployments", addresses);
}

export async function wards(
  authable: StarknetContract,
  ward: StarknetContract
) {
  return (await authable.call("wards", { user: asDec(ward.address) })).res;
}

export function asDec(address: string): string {
  return BigInt(address).toString();
}

export async function getL1ContractAt(hre: any, name: string, address: string) {
  console.log(`Using existing contract: ${name} at: ${address}`);
  const contractFactory = await hre.ethers.getContractFactory(name);
  return contractFactory.attach(address);
}

export async function getL2ContractAt(hre: any, name: string, address: string) {
  console.log(`Using existing contract: ${name} at: ${address}`);
  const contractFactory = await hre.starknet.getContractFactory(name);
  return contractFactory.getContractAt(address);
}

export async function deployL2(
  hre: any,
  name: string,
  blockNumber: number,
  calldata: any = {},
  saveName?: string
) {
  const STARKNET_NETWORK = hre.starknet.network || DEFAULT_STARKNET_NETWORK;
  console.log(`Deploying: ${name}${(saveName && "/" + saveName) || ""}...`);
  const contractFactory = await hre.starknet.getContractFactory(name);

  const contract = await contractFactory.deploy(calldata);
  save(saveName || name, contract, hre.network.name, blockNumber);

  console.log(`Deployed: ${saveName || name} to: ${contract.address}`);
  console.log(
    `To verify: npx hardhat starknet-verify --starknet-network ${STARKNET_NETWORK} --path contracts/l2/${name}.cairo --address ${contract.address}`
  );
  return contract;
}

export async function deployL1(
  hre: any,
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
