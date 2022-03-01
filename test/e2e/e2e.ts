import {
  getAddressOfNextDeployedContract,
  simpleDeploy,
} from "@makerdao/hardhat-utils";
import { expect } from "chai";
import { parseEther } from "ethers/lib/utils";
import { ethers, network, starknet } from "hardhat";
import { HttpNetworkConfig, StarknetContract } from "hardhat/types";

import { Signer } from "../../scripts/utils";

function toSplitUint(value: any) {
  const bits = value.toBigInt().toString(16).padStart(64, "0");
  return [BigInt(`0x${bits.slice(32)}`), BigInt(`0x${bits.slice(0, 32)}`)];
}

export function eth(amount: string) {
  return parseEther(amount);
}

export function l2Eth(amount: string) {
  return toSplitUint(parseEther(amount));
}

async function simpleDeployL2(
  name: string,
  args: object
): Promise<StarknetContract> {
  const factory = await starknet.getContractFactory(name);
  return factory.deploy(args);
}

function checkL2Balance(actualBalance: any, expectedBalance: any) {
  expect(actualBalance.res.low).to.be.eq(expectedBalance[0]);
  expect(actualBalance.res.high).to.be.eq(expectedBalance[1]);
}

function asDec(input: string | number | bigint): string {
  return BigInt(input).toString();
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
  let l2Bridge: any;
  let l2Dai: any;

  before(async function () {
    const networkUrl: string = (network.config as HttpNetworkConfig).url;
    [admin, l1Alice, l1Bob] = await ethers.getSigners();
    const KEY = "1";
    l2Signer = new Signer(KEY);
    l2Auth = await simpleDeployL2("account", {
      _public_key: BigInt(l2Signer.publicKey),
    });

    const mockStarknetMessaging = await starknet.devnet.loadL1MessagingContract(
      networkUrl
    );

    dai = (await simpleDeploy("DAIMock", [])) as any;

    escrow = (await simpleDeploy("L1Escrow", [])) as any;

    const registry = await simpleDeployL2("registry", []);
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

    /*
    const futureL1DAIWormholeBridgeAddress = await getAddressOfNextDeployedContract(admin);
    const l2WormholeBridge = await simpleDeployL2("l2_dai_wormhole_bridge", {
      ward: asDec(l2Auth.address),
      dai: asDec(l2Dai.address),
      wormhole_bridge: asDec(futureL1DAIWormholeBridgeAddress),
      registry: asDec(registry.address),
    });
    const l1WormholeBridge = (await simpleDeploy("L1DAIWormholeBridge", [
      mockStarknetMessaging.address,
      dai.address,
      l2WormholeBridge.address,
      escrow.address,
      wormhole.address,
    ])) as any;
    */

    const MAX = BigInt(2 ** 256) - BigInt(1);
    const MAX_HALF = BigInt(2 ** 128) - BigInt(1);
    await escrow.connect(admin).approve(dai.address, l1Bridge.address, MAX);

    await l1Bridge.connect(admin).setCeiling(MAX);
    await dai.connect(admin).approve(l1Bridge.address, MAX);
    await l2Signer.sendTransaction(l2Auth, l2Dai, "rely", [
      asDec(l2Bridge.address),
    ]);
    await l2Signer.sendTransaction(l2Auth, l2Dai, "approve", [
      asDec(l2Bridge.address),
      MAX_HALF,
      MAX_HALF,
    ]);
    await dai.connect(l1Alice).approve(l1Bridge.address, MAX);
    await dai.connect(l1Bob).approve(l1Bridge.address, MAX);
  });

  it("deposit", async () => {
    const depositAmountL1 = eth("100");
    const depositAmountL2 = l2Eth("100");

    await dai.connect(admin).transfer(l1Alice.address, depositAmountL1);
    await l1Bridge.connect(l1Alice).deposit(depositAmountL1, l2Auth.address);
    await starknet.devnet.flush();

    expect(await dai.balanceOf(l1Alice.address)).to.be.eq(eth("0"));
    checkL2Balance(
      await l2Dai.call("balanceOf", {
        user: asDec(l2Auth.address),
      }),
      depositAmountL2
    );
  });

  it("withdraw", async () => {
    const withdrawAmountL1 = eth("100");
    const withdrawAmountL2 = l2Eth("100");
    await l2Signer.sendTransaction(l2Auth, l2Bridge, "initiate_withdraw", [
      asDec(l1Alice.address),
      ...withdrawAmountL2.map(asDec),
    ]);
    await starknet.devnet.flush();
    await l1Bridge.connect(l1Alice).withdraw(withdrawAmountL1, l1Alice.address);
    checkL2Balance(
      await l2Dai.call("balanceOf", {
        user: asDec(l2Auth.address),
      }),
      l2Eth("0")
    );
    expect(await dai.balanceOf(l1Alice.address)).to.be.eq(withdrawAmountL1);
  });
});
