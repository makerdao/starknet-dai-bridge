import { OpenZeppelinAccount } from "@shardlabs/starknet-hardhat-plugin/dist/src/account";
import {
  DeployOptions,
  StarknetContract,
  StringMap,
} from "@shardlabs/starknet-hardhat-plugin/dist/src/types";
import dotenv from "dotenv";
import {
  BaseContract,
  BigNumber,
  CallOverrides,
  ContractTransaction,
  ethers,
  Event,
  EventFilter,
  Overrides,
  providers,
  Signer,
} from "ethers";
import { getContractAddress, Result } from "ethers/lib/utils";
import fs from "fs";
import { isEmpty } from "lodash";
import os from "os";
import { assert } from "ts-essentials";

const MASK_250 = BigInt(2 ** 250 - 1);

export function l1String(str: string): string {
  return ethers.utils.formatBytes32String(str);
}

export function l2String(str: string): string {
  return `0x${Buffer.from(str, "utf8").toString("hex")}`;
}

export function toBytes32(x: string): string {
  return `0x${x.slice(2).padStart(64, "0")}`;
}

export function getRequiredEnv(key: string): string {
  const value = process.env[key];
  assert(value, `Please provide ${key} in .env file`);

  return value;
}

export function getRequiredEnvDeployments(key: string): string {
  const env = dotenv.config({ path: ".env.deployments" });
  assert(env.parsed, ".env.deployments file not found");
  const value = env.parsed[key];
  assert(value, `Please provide ${key} in .env file`);

  return value;
}

export function getRequiredEnvDeployer(key: string): string {
  const env = dotenv.config({ path: ".env.deployer" });
  assert(env.parsed, ".env.deployer file not found");
  const value = env.parsed[key];
  assert(value, `Please provide ${key} in .env file`);

  return value;
}

export function getOptionalEnv(key: string): string | undefined {
  return process.env[key];
}

export function getOptionalEnvDeployments(key: string): string | undefined {
  const env = dotenv.config({ path: ".env.deployments" });
  assert(env.parsed, ".env.deployer file not found");
  return env.parsed[key];
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

class CustomAccount extends OpenZeppelinAccount {
  async estimateAndInvoke(
    toContract: StarknetContract,
    functionName: string,
    calldata?: StringMap,
    options: any = {}
  ) {
    const { amount } = await this.estimateFee(
      toContract,
      functionName,
      calldata,
      options
    );
    const feeMultiplier = BigInt(getRequiredEnv("FEE_MULTIPLIER"));
    return this.invoke(toContract, functionName, calldata, {
      maxFee: amount * feeMultiplier,
    });
  }
}

export async function getAccount(
  name: string,
  hre: any
): Promise<CustomAccount> {
  const { network } = getNetwork(hre);
  const { address, private_key } = JSON.parse(
    fs
      .readFileSync(
        `${os.homedir()}/.starknet_accounts/starknet_open_zeppelin_accounts.json`
      )
      .toString()
  )[network][name];
  const account = (await hre.starknet.getAccountFromAddress(
    address,
    private_key,
    "OpenZeppelin"
  )) as CustomAccount;
  account["estimateAndInvoke"] = CustomAccount.prototype.estimateAndInvoke;
  return account;
}

export function parseCalldataL1(calldata: string, network: string) {
  const _calldata = calldata ? calldata.split(",") : [];
  return _calldata.map((input: string) => {
    if (input === "l2_dai_bridge") {
      return getAddress("l2_dai_bridge", network);
    } else if (input === "L1DAIBridge") {
      return getAddress("L1DAIBridge", network);
    } else if (input === "L1DAITeleportGateway") {
      return getAddress("L1DAITeleportGateway", network);
    } else if (input === "L1Escrow") {
      return getAddress("L1Escrow", network);
    } else if (input === "DAI") {
      return getAddress("DAI", network);
    } else if (input === "GOERLI-MASTER-1") {
      return l1String(input);
    } else if (input === "GOERLI-SLAVE-STARKNET-1") {
      return l1String(input);
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
  const res: Record<string, any> = {};
  const inputs = getInputAbi(contract, func);
  for (let i = 0; i < _calldata.length; i++) {
    const input = _calldata[i];
    const inputName: string = inputs[i].name;
    const inputType: string = inputs[i].type;
    if (input === "L1DAIBridge") {
      res[inputName] = BigInt(getAddress("L1DAIBridge", network)).toString();
    } else if (input === "l2_dai_bridge") {
      res[inputName] = BigInt(getAddress("l2_dai_bridge", network)).toString();
    } else if (input === "l2_dai_teleport_gateway") {
      res[inputName] = BigInt(
        getAddress("l2_dai_teleport_gateway", network)
      ).toString();
    } else if (input === "GOERLI-MASTER-1") {
      res[inputName] = l2String(input);
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

export function getSelectorFromName(name: string) {
  return (
    BigInt(ethers.utils.keccak256(Buffer.from(name))) % MASK_250
  ).toString();
}

export function printAddresses(hre: any, addresses: Record<string, string>) {
  const { NETWORK } = getNetwork(hre);

  const result: Record<string, string> = {};
  Object.keys(addresses).forEach(key => {
    result[`${NETWORK}_${key}`] = addresses[key];
  });

  console.log(result);
}

export function writeAddresses(hre: any, addresses: Record<string, string>) {
  const { NETWORK } = getNetwork(hre);

  const result = JSON.parse(fs.readFileSync(".env.deployments").toString());

  Object.keys(addresses).forEach(key => {
    result[`${NETWORK}_${key}`] = addresses[key];
  });

  fs.writeFileSync(".env.deployments", JSON.stringify(result));
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
  calldata: any = [],
  overrides: any = {},
) {
  console.log(`Deploying: ${name}...`);

  const contractFactory = await hre.ethers.getContractFactory(name);
  const contract = await contractFactory.deploy(...calldata, overrides);

  await contract.deployed();

  console.log(`Deployed: ${name} to: ${contract.address}`);
  console.log(
    `To verify: npx hardhat verify ${contract.address} ${calldata
      .filter((a: any) => !isEmpty(a))
      .join(" ")}`
  );
  await contract.deployed();
  return contract;
}

export async function deployL2(
  hre: any,
  name: string,
  calldata: any = {},
  options: DeployOptions = {},
) {
  const { network } = getNetwork(hre);

  console.log(`Deploying: ${name}...`);
  const contractFactory = await hre.starknet.getContractFactory(name);

  const contract = await contractFactory.deploy(calldata, options);

  console.log(`Deployed: ${name} to: ${contract.address}`);
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
