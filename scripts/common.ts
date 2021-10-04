import { Signer } from "@ethersproject/abstract-signer";
import { ethers } from "hardhat";
import { Interface } from "@ethersproject/abi";
import { isEmpty } from "lodash";

interface Options {
  l1Deployer: Signer;
  L1_DAI_ADDRESS: string;
  L1_STARKNET_ADDRESS: string;
  L2_DAI_BRIDGE_ADDRESS: string;
  L1_TX_OPTS: Object;
}

type ContractLike = {
  readonly address: string;
  readonly interface: Interface;
  readonly signer: Signer;
};

type ContractFactoryLike = {
  interface: any;
  bytecode: any;
  deploy(...args: Array<any>): Promise<ContractLike>;
};

async function deployUsingFactory<T extends ContractFactoryLike>(
  signer: Signer,
  factory: T,
  args: Parameters<T["deploy"]>
): Promise<ReturnType<T["deploy"]>> {
  const contractFactory = new ethers.ContractFactory(
    factory.interface,
    factory.bytecode,
    signer
  );
  const contractDeployed = await contractFactory.deploy(...(args as any));

  await contractDeployed.deployed();

  console.log(
    `npx hardhat --network NETWORK_NAME_HERE verify ${
      contractDeployed.address
    } ${args
      .filter((a: any) => a.gasPrice === undefined && !isEmpty(a))
      .join(" ")}`
  );

  return contractDeployed as any;
}

export async function deploy(opts: Options) {
  const l1Escrow = await deployUsingFactory(
    opts.l1Deployer,
    await ethers.getContractFactory("L1Escrow"),
    [opts.L1_TX_OPTS]
  );

  const l1DAITokenBridge = await deployUsingFactory(
    opts.l1Deployer,
    await ethers.getContractFactory("L1DAITokenBridge"),
    [
      opts.L1_DAI_ADDRESS,
      l1Escrow.address,
      opts.L1_STARKNET_ADDRESS,
      opts.L2_DAI_BRIDGE_ADDRESS,
      opts.L1_TX_OPTS,
    ]
  );

  return {
    l1Escrow,
    l1DAITokenBridge,
  };
}
