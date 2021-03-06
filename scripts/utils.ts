/**
 * Full goerli deploy including any permissions that need to be set.
 */

import {
  DeployOptions,
  StarknetContract,
} from "@shardlabs/starknet-hardhat-plugin/dist/src/types";
import { ethers } from "ethers";
import {
  BaseContract,
  BigNumber,
  CallOverrides,
  ContractTransaction,
  Event,
  EventFilter,
  Overrides,
  providers,
  Signer,
} from "ethers";
import { getContractAddress, Result } from "ethers/lib/utils";
import fs from "fs";
import { isEmpty } from "lodash";
import { assert } from "ts-essentials";

const DEPLOYMENTS_DIR = `deployments`;
const MASK_250 = BigInt(2 ** 250 - 1);

export function getRequiredEnv(key: string): string {
  const value = process.env[key];
  assert(value, `Please provide ${key} in .env file`);

  return value;
}

export function getOptionalEnv(key: string): string | undefined {
  return process.env[key];
}

interface TypedEventFilter<_EventArgsArray, _EventArgsObject>
  extends EventFilter {}

interface TypedEvent<EventArgs extends Result> extends Event {
  args: EventArgs;
}

interface AuthableLike {
  deny: any;
  rely: any;
}

interface AuthableContract extends BaseContract {
  queryFilter<EventArgsArray extends Array<any>, EventArgsObject>(
    event: TypedEventFilter<EventArgsArray, EventArgsObject>,
    fromBlockOrBlockhash?: string | number | undefined,
    toBlock?: string | number | undefined
  ): Promise<Array<TypedEvent<EventArgsArray & EventArgsObject>>>;
  deny(
    usr: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;
  rely(
    usr: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;
  wards(arg0: string, overrides?: CallOverrides): Promise<BigNumber>;

  filters: {
    Deny(usr?: string | null): TypedEventFilter<[string], { usr: string }>;
    Rely(usr?: string | null): TypedEventFilter<[string], { usr: string }>;
  };
}

export async function getActiveWards(
  _authContract: AuthableLike,
  fromBlockOrBlockhash?: string | number
): Promise<string[]> {
  const authContract = _authContract as AuthableContract;
  const relyEvents = await authContract.queryFilter(
    authContract.filters.Rely(),
    fromBlockOrBlockhash
  );

  const relies = relyEvents.map((r) => r.args.usr);

  const statusOfRelies = await Promise.all(
    relies.map(async (usr) => ({ usr, active: await authContract.wards(usr) }))
  );

  const activeRelies = statusOfRelies
    .filter((s) => s.active.toNumber() === 1)
    .map((s) => s.usr);

  return activeRelies;
}

export async function getAddressOfNextDeployedContract(
  signer: Signer,
  offset: number = 0
): Promise<string> {
  return getContractAddress({
    from: await signer.getAddress(),
    nonce: (await signer.getTransactionCount()) + offset,
  });
}

export async function waitForTx(
  tx: Promise<any>
): Promise<providers.TransactionReceipt> {
  console.log(`Sending transaction...`);
  const resolvedTx = await tx;
  console.log(`Waiting for tx: ${resolvedTx.hash}`);
  return await resolvedTx.wait();
}

export function getAddress(contract: string, network: string) {
  console.log(`reading: ./deployments/${network}/${contract}.json`);
  try {
    return JSON.parse(
      fs.readFileSync(`./deployments/${network}/${contract}.json`).toString()
    ).address;
  } catch (err) {
    if (process.env[`${getNetworkUpperCase(network)}_${contract}`]) {
      return process.env[`${getNetworkUpperCase(network)}_${contract}`];
    } else {
      throw Error(
        `${contract} deployment on ${network} not found, run 'yarn deploy:${network}'`
      );
    }
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
    } else if (input === "L1DAIWormholeGateway") {
      return getAddress("L1DAIWormholeGateway", network);
    } else if (input === "L1Escrow") {
      return getAddress("L1Escrow", network);
    } else if (input === "DAI") {
      return getAddress("DAI", network);
    } else if (input === "MAX") {
      return "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
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
    } else if (input === "L1DAIBridge") {
      res[inputName] = BigInt(getAddress("L1DAIBridge", network)).toString();
    } else if (input === "l2_dai_bridge") {
      res[inputName] = BigInt(getAddress("l2_dai_bridge", network)).toString();
    } else if (input === "l2_dai_wormhole_gateway") {
      res[inputName] = BigInt(
        getAddress("l2_dai_wormhole_gateway", network)
      ).toString();
    } else if (input === "GOERLI-MASTER-1") {
      res[inputName] = `0x0${ethers.utils
        .formatBytes32String("GOERLI-MASTER-1")
        .slice(2, 65)}`;
    } else if (inputType === "Uint256") {
      const low =
        input === "MAX_HALF" ? "0xffffffffffffffffffffffffffffffff" : input;
      const high =
        _calldata[i + 1] === "MAX_HALF"
          ? "0xffffffffffffffffffffffffffffffff"
          : _calldata[i + 1];
      res[inputName] = { low, high };
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

export function getSelectorFromName(name: string) {
  return (
    BigInt(ethers.utils.keccak256(Buffer.from(name))) % MASK_250
  ).toString();
}

export function printAddresses(
  network: string,
  includeWormhole: boolean = false
) {
  let contracts = [
    "account-deployer",
    "dai",
    "registry",
    "L1Escrow",
    "L1DAIBridge",
    "l2_dai_bridge",
    "L1GovernanceRelay",
    "l2_governance_relay",
  ];

  if (includeWormhole) {
    contracts = [
      ...contracts,
      "L1DAIWormholeGateway",
      "l2_dai_wormhole_gateway",
    ];
  }

  const addresses = contracts.reduce(
    (a, c) => Object.assign(a, { [c]: getAddress(c, network) }),
    {}
  );

  console.log(addresses);
}

//TODO: handle addresses here
export function writeAddresses(hre: any, includeWormhole: boolean = false) {
  const NETWORK = hre.network.name;
  let ADDRESS_NETWORK: string;
  if (NETWORK === "fork") {
    ADDRESS_NETWORK = getRequiredEnv("FORK_NETWORK").toUpperCase();
  } else {
    ADDRESS_NETWORK = NETWORK.toUpperCase();
  }

  let variables = [
    ["L1_ESCROW_ADDRESS", "L1Escrow"],
    ["L2_DAI_ADDRESS", "dai"],
    ["L1_GOVERNANCE_RELAY_ADDRESS", "L1GovernanceRelay"],
    ["L2_GOVERNANCE_RELAY_ADDRESS", "l2_governance_relay"],
    ["L1_DAI_BRIDGE_ADDRESS", "L1DAIBridge"],
    ["L2_DAI_BRIDGE_ADDRESS", "l2_dai_bridge"],
    ["REGISTRY_ADDRESS", "registry"],
  ];

  if (includeWormhole) {
    variables = [
      ...variables,
      ["L1_DAI_WORMHOLE_GATEWAY_ADDRESS", "L1DAIWormholeGateway"],
      ["L2_DAI_WORMHOLE_GATEWAY_ADDRESS", "l2_dai_wormhole_gateway"],
    ];
  }

  const addresses = variables.reduce((a, c) => {
    const address = getAddress(c[1], NETWORK);
    if (address) {
      return `${a}${ADDRESS_NETWORK}_${c[0]}=${address}\n`;
    } else {
      return a;
    }
  }, "");

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

export async function deployL1(
  hre: any,
  name: string,
  blockNumber: number,
  calldata: any = [],
  overrides: any = {},
  saveName?: string
) {
  console.log(`Deploying: ${name}${(saveName && "/" + saveName) || ""}...`);

  const { network } = getNetwork(hre);

  const contractFactory = await hre.ethers.getContractFactory(name);
  const contract = await contractFactory.deploy(...calldata, overrides);
  save(saveName || name, contract, network, blockNumber);

  await contract.deployed();

  console.log(`Deployed: ${saveName || name} to: ${contract.address}`);
  console.log(
    `To verify: npx hardhat verify ${contract.address} ${calldata
      .filter((a: any) => !isEmpty(a))
      .join(" ")}`
  );
  return contract;
}

export async function deployL2(
  hre: any,
  name: string,
  blockNumber: number,
  calldata: any = {},
  options: DeployOptions = {},
  saveName?: string
) {
  const { network } = getNetwork(hre);

  console.log(`Deploying: ${name}${(saveName && "/" + saveName) || ""}...`);
  const contractFactory = await hre.starknet.getContractFactory(name);

  const contract = await contractFactory.deploy(calldata, options);
  save(saveName || name, contract, network, blockNumber);

  console.log(`Deployed: ${saveName || name} to: ${contract.address}`);
  console.log(
    `To verify: npx hardhat starknet-verify --starknet-network ${network} --path contracts/l2/${name}.cairo --address ${contract.address}`
  );
  return contract;
}

export function getNetwork(hre: any) {
  const network = hre.config.starknet.network!;
  assert(
    network === "alpha-mainnet" || network === "alpha-goerli",
    "Network not properly set!"
  );
  const NETWORK = getNetworkUpperCase(network);
  return { network, NETWORK };
}

function getNetworkUpperCase(network: string) {
  return network.toUpperCase().replace(/[-]/g, "_")!;
}
