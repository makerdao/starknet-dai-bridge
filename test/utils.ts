import hre from "hardhat";
import { BigNumber } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { Account, StarknetContract } from "hardhat/types";
import fetch from "node-fetch";

import { getSelectorFromName } from "../scripts/utils";

type SplitUintType = { low: bigint; high: bigint };
type numberish = string | number | bigint | BigNumber;

export class SplitUint {
  res: SplitUintType;

  constructor(res: SplitUintType) {
    this.res = res;
  }

  static fromUint(a: numberish): SplitUint {
    const bits = asHex(a).padStart(64, "0");
    const res = {
      low: BigInt(`0x${bits.slice(32)}`),
      high: BigInt(`0x${bits.slice(0, 32)}`),
    };
    return new SplitUint(res);
  }

  toArray(): bigint[] {
    return Object.values(this.res);
  }

  toUint(): bigint {
    const _a = this.toArray();
    return _a[0] + 2n ** 128n * _a[1];
  }

  add(_a: SplitUint | numberish): SplitUint {
    let a = _a as SplitUint;
    if (!_a.hasOwnProperty("res")) {
      a = SplitUint.fromUint(_a as numberish);
    }
    return SplitUint.fromUint(this.toUint() + a.toUint());
  }

  sub(_a: SplitUint | numberish): SplitUint {
    let a = _a as SplitUint;
    if (!_a.hasOwnProperty("res")) {
      a = SplitUint.fromUint(_a as numberish);
    }
    return SplitUint.fromUint(this.toUint() - a.toUint());
  }

  toDec(): string[] {
    return this.toArray().map(asDec);
  }
}

function asHex(a: string | number | bigint | BigNumber): string {
  return BigNumber.isBigNumber(a)
    ? a.toHexString().slice(2)
    : BigInt(a).toString(16);
}

export function split(a: numberish): bigint[] {
  return SplitUint.fromUint(a).toArray();
}

export function toBytes32(a: string): string {
  return `0x${BigInt(a).toString(16).padStart(64, "0")}`;
}

export function eth(amount: string) {
  return parseEther(amount).toBigInt();
}

export function asDec(a: string | number | bigint): string {
  return BigInt(a).toString();
}

export async function getEvent(eventName: string, contractAddress: string) {
  const _contractAddress = `0x${BigInt(contractAddress).toString(16)}`;
  const eventKey = getSelectorFromName(eventName);
  const res = await fetch(`http://localhost:5050/feeder_gateway/get_block`);
  const json = await res.json();
  const [event] = json["transaction_receipts"][0]["events"].filter(
    (event: any) => {
      return (
        BigInt(event.keys[0]).toString() === eventKey &&
        event.from_address === _contractAddress
      );
    }
  );
  if (!event) {
    throw Error("Event not found");
  }
  return event.data;
}

export async function simpleDeployL2(
  account: Account,
  name: string,
  args: object,
  hre: any
): Promise<StarknetContract> {
  // const factory = await hre.starknet.getContractFactory(name);
  // return factory.deploy(args);

  const contractFactory = await hre.starknet.getContractFactory(name);
  const txHash = await account.declare(contractFactory, {
    maxFee: 10000000000000000,
  });
  const classHash = await contractFactory.getClassHash();

  return await account.deploy(contractFactory, args, {
    maxFee: 10000000000000000,
  });
}

export function strToFelt(str: string): string {
  const substr = str.split("");
  return (
    "0x" + substr.reduce((memo, c) => memo + c.charCodeAt(0).toString(16), "")
  );
}

export const MAX = 2n ** 256n - 1n;
