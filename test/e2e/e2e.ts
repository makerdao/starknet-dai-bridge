import {
  getAddressOfNextDeployedContract,
  simpleDeploy,
} from "@makerdao/hardhat-utils";
import { expect } from "chai";
import { parseEther } from "ethers/lib/utils";
import { ethers, network, starknet } from "hardhat";
import { HttpNetworkConfig, StarknetContract } from "hardhat/types";
import fetch from "node-fetch";

import { getSelectorFromName, L2Signer } from "../../scripts/utils";

const TARGET_DOMAIN = "1";
const SOURCE_DOMAIN = "2";
const VALID_DOMAINS = "9379074284324409537785911406195";

function toSplitUint(value: any) {
  const bits = value.padStart(64, "0");
  return [BigInt(`0x${bits.slice(32)}`), BigInt(`0x${bits.slice(0, 32)}`)];
}

function toUint(value: BigInt[]) {
  return BigInt(`0x${value[1].toString(16)}${value[0].toString(16)}`);
}

function splitAdd(a: any, b: any) {
  return toSplitUint((toUint(a) + toUint(b)).toString(16));
}

function splitSub(a: any, b: any) {
  return toSplitUint((toUint(a) - toUint(b)).toString(16));
}

function asDec(input: string | number | bigint): string {
  return BigInt(input).toString();
}

function eth(amount: string) {
  return parseEther(amount);
}

function l2Eth(amount: string) {
  return toSplitUint(parseEther(amount).toBigInt().toString(16));
}

function toBytes32(value: string): string {
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

async function getEvent(eventName: string, contractAddress: string) {
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

async function checkL2Balance(
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

async function simpleDeployL2(
  name: string,
  args: object
): Promise<StarknetContract> {
  const factory = await starknet.getContractFactory(name);
  return factory.deploy(args);
}

describe("e2e", async function () {
  this.timeout(900_000); // eslint-disable-line
  let admin: any;
  let l1Alice: any;
  let l1Bob: any;
  let l2Signer: any;
  let l2Auth: any;
  let dai: any;
  let escrow: any;
  let l1Bridge: any;
  let l1WormholeBridge: any;
  let l2Bridge: any;
  let l2WormholeBridge: any;
  let l2Dai: any;
  let wormholeRouterFake: any;

  before(async function () {
    const networkUrl: string = (network.config as HttpNetworkConfig).url;
    [admin, l1Alice, l1Bob] = await ethers.getSigners();
    const KEY = "1";
    l2Signer = new L2Signer(KEY);
    l2Auth = await simpleDeployL2("account", {
      _public_key: BigInt(l2Signer.publicKey),
    });

    const mockStarknetMessaging = await starknet.devnet.loadL1MessagingContract(
      networkUrl
    );
    wormholeRouterFake = (await simpleDeploy("WormholeRouterMock", [])) as any;

    dai = (await simpleDeploy("DAIMock", [])) as any;

    escrow = (await simpleDeploy("L1Escrow", [])) as any;

    const registry = await simpleDeployL2("registry", {});
    l2Dai = await simpleDeployL2("dai", { ward: asDec(l2Auth.address) });

    const futureL1DAIBridgeAddress = await getAddressOfNextDeployedContract(
      admin
    );
    l2Bridge = await simpleDeployL2("l2_dai_bridge", {
      ward: asDec(l2Auth.address),
      dai: asDec(l2Dai.address),
      bridge: asDec(futureL1DAIBridgeAddress),
      registry: asDec(registry.address),
    });
    l1Bridge = (await simpleDeploy("L1DAIBridge", [
      mockStarknetMessaging.address,
      dai.address,
      l2Dai.address,
      escrow.address,
      l2Bridge.address,
    ])) as any;

    const futureL1DAIWormholeBridgeAddress =
      await getAddressOfNextDeployedContract(admin);
    l2WormholeBridge = await simpleDeployL2("l2_dai_wormhole_bridge", {
      ward: asDec(l2Auth.address),
      dai: asDec(l2Dai.address),
      wormhole_bridge: asDec(futureL1DAIWormholeBridgeAddress),
      domain: SOURCE_DOMAIN,
    });
    l1WormholeBridge = (await simpleDeploy("L1DAIWormholeBridge", [
      mockStarknetMessaging.address,
      dai.address,
      l2WormholeBridge.address,
      escrow.address,
      wormholeRouterFake.address,
    ])) as any;

    const MAX = BigInt(2 ** 256) - BigInt(1);
    const MAX_HALF = BigInt(2 ** 128) - BigInt(1);
    await escrow.connect(admin).approve(dai.address, l1Bridge.address, MAX);
    await escrow
      .connect(admin)
      .approve(dai.address, l1WormholeBridge.address, MAX);

    await l2Signer.sendTransaction(l2Auth, l2WormholeBridge, "file", [
      VALID_DOMAINS,
      TARGET_DOMAIN,
      1,
    ]);
    await l1Bridge.connect(admin).setCeiling(MAX);
    await dai.connect(admin).approve(l1Bridge.address, MAX);
    await l2Signer.sendTransaction(l2Auth, l2Dai, "mint", [
      asDec(l2Auth.address),
      ...l2Eth("10000").map(asDec),
    ]);
    await l2Signer.sendTransaction(l2Auth, l2Dai, "rely", [
      asDec(l2Bridge.address),
    ]);
    await l2Signer.sendTransaction(l2Auth, l2Dai, "approve", [
      asDec(l2Bridge.address),
      MAX_HALF,
      MAX_HALF,
    ]);
    await l2Signer.sendTransaction(l2Auth, l2Dai, "approve", [
      asDec(l2WormholeBridge.address),
      MAX_HALF,
      MAX_HALF,
    ]);
    await dai.connect(l1Alice).approve(l1Bridge.address, MAX);
    await dai.connect(l1Bob).approve(l1Bridge.address, MAX);
  });

  it("deposit", async () => {
    const depositAmountL1 = eth("100");
    const depositAmountL2 = l2Eth("100");
    const { res: l2AuthBalance } = await l2Dai.call("balanceOf", {
      user: asDec(l2Auth.address),
    });

    await dai.connect(admin).transfer(l1Alice.address, depositAmountL1);
    await l1Bridge.connect(l1Alice).deposit(depositAmountL1, l2Auth.address);
    await starknet.devnet.flush();

    expect(await dai.balanceOf(l1Alice.address)).to.be.eq(eth("0"));
    await checkL2Balance(
      l2Dai,
      l2Auth,
      splitAdd(depositAmountL2, Object.values(l2AuthBalance))
    );
  });

  it("withdraw", async () => {
    const withdrawAmountL1 = eth("100");
    const withdrawAmountL2 = l2Eth("100");
    const { res: l2AuthBalance } = await l2Dai.call("balanceOf", {
      user: asDec(l2Auth.address),
    });
    await l2Signer.sendTransaction(l2Auth, l2Bridge, "initiate_withdraw", [
      asDec(l1Alice.address),
      ...withdrawAmountL2.map(asDec),
    ]);
    await starknet.devnet.flush();
    await l1Bridge.connect(l1Alice).withdraw(withdrawAmountL1, l1Alice.address);
    await checkL2Balance(
      l2Dai,
      l2Auth,
      splitSub(Object.values(l2AuthBalance), withdrawAmountL2)
    );
    expect(await dai.balanceOf(l1Alice.address)).to.be.eq(withdrawAmountL1);
  });

  it("wormhole", async () => {
    const wormholeAmountL1 = eth("100");
    const wormholeAmountL2 = l2Eth("100");
    await l2Signer.sendTransaction(
      l2Auth,
      l2WormholeBridge,
      "initiate_wormhole",
      [
        TARGET_DOMAIN, // target_domain
        asDec(l1Alice.address), // receiver
        asDec(wormholeAmountL2[0]), // amount (limited to 2**128)
        asDec(l1Alice.address), // operator
      ]
    );
    const event = await getEvent(
      "WormholeInitialized",
      l2WormholeBridge.address
    );
    await l2Signer.sendTransaction(
      l2Auth,
      l2WormholeBridge,
      "finalize_register_wormhole",
      [
        TARGET_DOMAIN, // target_domain
        asDec(l1Alice.address), // receiver
        asDec(wormholeAmountL2[0]), // amount
        asDec(l1Alice.address), // operator
        event[5], // nonce
        event[6], // timestamp
      ]
    );
    await starknet.devnet.flush();

    const wormholeGUID = {
      sourceDomain: toBytes32(SOURCE_DOMAIN), // bytes32
      targetDomain: toBytes32(TARGET_DOMAIN), // bytes32
      receiver: toBytes32(l1Alice.address), // bytes32
      operator: toBytes32(l1Alice.address), // bytes32
      amount: wormholeAmountL1, // uint128
      nonce: event[5], // uint80
      timestamp: event[6], // uint48
    };
    await l1WormholeBridge
      .connect(l1Alice)
      .finalizeRegisterWormhole(wormholeGUID);

    /*
    expect(wormholeRouterFake.requestMint).to.have.been.calledOnce;
    expect(wormholeRouterFake.requestMint).to.have.been.calledWith(
      wormholeGUID,
      0,
      0,
    );
    */
  });

  it("settle", async () => {
    const depositAmountL1 = eth("100");
    await l1Bridge.connect(l1Alice).deposit(depositAmountL1, l2Auth.address);
    const { res: daiToFlush } = await l2WormholeBridge.call(
      "batched_dai_to_flush",
      {
        domain: TARGET_DOMAIN,
      }
    );
    await l2Signer.sendTransaction(l2Auth, l2WormholeBridge, "flush", [
      TARGET_DOMAIN,
    ]);
    await l1WormholeBridge
      .connect(l1Alice)
      .finalizeFlush(
        toBytes32(TARGET_DOMAIN),
        toUint(Object.values(daiToFlush))
      );
    await starknet.devnet.flush();

    /*
    expect(wormholeRouterFake.settle).to.have.been.calledOnce;
    expect(wormholeRouterFake.settle).to.have.been.calledWith(
      TARGET_DOMAIN,
      daiToFlush,
    );
    */
  });
});
