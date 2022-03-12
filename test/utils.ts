import { BigNumber } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { starknet } from "hardhat";
import { StarknetContract } from "hardhat/types";
import fetch from "node-fetch";

import { getSelectorFromName } from "../scripts/utils";

type SplitUintType = { low: bigint; high: bigint };

export class SplitUint {
  res: SplitUintType;

  constructor(res: SplitUintType) {
    this.res = res;
  }

  static fromUint(a: string | number | bigint | BigNumber): SplitUint {
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
    return BigInt(`0x${_a[1].toString(16)}${_a[0].toString(16)}`);
  }

  add(a: SplitUint): SplitUint {
    return SplitUint.fromUint(this.toUint() + a.toUint());
  }

  sub(a: SplitUint): SplitUint {
    return SplitUint.fromUint(this.toUint() - a.toUint());
  }

  toDec(): string[] {
    return this.toArray().map(asDec);
  }
}

function asHex(a: string | number | bigint | BigNumber): string {
  return BigNumber.isBigNumber(a) ? a.toHexString() : BigInt(a).toString(16);
}

export function split(a: BigNumber): bigint[] {
  return SplitUint.fromUint(a).toArray();
}

export function toBytes32(a: string): string {
  return `0x${BigInt(a).toString(16).padStart(64, "0")}`;
}

export function eth(amount: string) {
  return parseEther(amount);
}

export function l2Eth(amount: string): SplitUint {
  return SplitUint.fromUint(parseEther(amount).toHexString());
}

export function asDec(a: string | number | bigint): string {
  return BigInt(a).toString();
}

export async function getEvent(eventName: string, contractAddress: string) {
  const _contractAddress = `0x${BigInt(contractAddress).toString(16)}`;
  const eventKey = getSelectorFromName(eventName);
  const res = await fetch(`http://localhost:5000/feeder_gateway/get_block`);
  const json = await res.json();
  const [event] = json["transaction_receipts"][0]["events"].filter(
    (event: any) => {
      return (
        event.keys[0] === eventKey && event.from_address === _contractAddress
      );
    }
  );
  if (!event) {
    throw Error("Event not found");
  }
  return event.data;
}

export async function simpleDeployL2(
  name: string,
  args: object
): Promise<StarknetContract> {
  const factory = await starknet.getContractFactory(name);
  return factory.deploy(args);
}
