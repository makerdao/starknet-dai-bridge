import { expect } from "chai";
import { parseEther } from "ethers/lib/utils";
import { starknet } from "hardhat";
import { StarknetContract } from "hardhat/types";
import fetch from "node-fetch";

import { getSelectorFromName } from "../scripts/utils";

export function toSplitUint(value: any) {
  const bits = value.padStart(64, "0");
  return [BigInt(`0x${bits.slice(32)}`), BigInt(`0x${bits.slice(0, 32)}`)];
}

export function toUint(value: BigInt[]) {
  return BigInt(`0x${value[1].toString(16)}${value[0].toString(16)}`);
}

export function splitAdd(a: any, b: any) {
  return toSplitUint((toUint(a) + toUint(b)).toString(16));
}

export function splitSub(a: any, b: any) {
  return toSplitUint((toUint(a) - toUint(b)).toString(16));
}

export function asDec(input: string | number | bigint): string {
  return BigInt(input).toString();
}

export function asHex(input: string | number | bigint | any): string {
  return BigInt(input).toString(16);
}

export function eth(amount: string) {
  return parseEther(amount);
}

export function l2Eth(amount: string) {
  return toSplitUint(parseEther(amount).toBigInt().toString(16));
}

export function toBytes32(value: string): string {
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
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

export async function checkL2Balance(
  daiContract: any,
  accountContract: any,
  expectedBalance: any
) {
  const actualBalance = await daiContract.call("balanceOf", {
    user: asDec(accountContract.address),
  });
  expect(actualBalance.res.low).to.be.eq(expectedBalance[0]);
  expect(actualBalance.res.high).to.be.eq(expectedBalance[1]);
}

export async function simpleDeployL2(
  name: string,
  args: object
): Promise<StarknetContract> {
  const factory = await starknet.getContractFactory(name);
  return factory.deploy(args);
}
