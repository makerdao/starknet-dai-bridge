import {
  getAddressOfNextDeployedContract,
  simpleDeploy,
} from "@makerdao/hardhat-utils";
import { expect } from "chai";
import { ethers, network, starknet } from "hardhat";
import { HttpNetworkConfig } from "hardhat/types";

import { L2Signer } from "../../scripts/utils";
import {
  asDec,
  checkL2Balance,
  eth,
  getEvent,
  l2Eth,
  simpleDeployL2,
  splitAdd,
  splitSub,
  toBytes32,
  toUint,
} from "../utils";

const TARGET_DOMAIN = "1";
const SOURCE_DOMAIN = "2";
const VALID_DOMAINS = "9379074284324409537785911406195";

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

  it("slow path", async () => {
    const wormholeAmountL1 = eth("100");
    const wormholeAmountL2 = l2Eth("100");
    const { res: l2AuthBalance } = await l2Dai.call("balanceOf", {
      user: asDec(l2Auth.address),
    });
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
      nonce: parseInt(event[5]), // uint80
      timestamp: parseInt(event[6]), // uint48
    };
    await expect(
      l1WormholeBridge.connect(l1Alice).finalizeRegisterWormhole(wormholeGUID)
    )
      .to.emit(wormholeRouterFake, "RequestMint")
      .withArgs(Object.values(wormholeGUID), eth("0"), eth("0"));

    expect(await dai.balanceOf(l1Alice.address)).to.be.eq(wormholeAmountL1);
    await checkL2Balance(
      l2Dai,
      l2Auth,
      splitSub(Object.values(l2AuthBalance), wormholeAmountL2)
    );
  });

  it("settle", async () => {
    const depositAmountL1 = eth("100");
    await l1Bridge.connect(l1Alice).deposit(depositAmountL1, l2Auth.address);
    const escrowBalance = await dai.balanceOf(escrow.address);
    const { res: daiToFlush } = await l2WormholeBridge.call(
      "batched_dai_to_flush",
      {
        domain: TARGET_DOMAIN,
      }
    );
    await l2Signer.sendTransaction(l2Auth, l2WormholeBridge, "flush", [
      TARGET_DOMAIN,
    ]);
    await expect(
      l1WormholeBridge
        .connect(l1Alice)
        .finalizeFlush(
          toBytes32(TARGET_DOMAIN),
          toUint(Object.values(daiToFlush))
        )
    )
      .to.emit(wormholeRouterFake, "Settle")
      .withArgs(toBytes32(TARGET_DOMAIN), toUint(Object.values(daiToFlush)));

    await starknet.devnet.flush();

    expect(await dai.balanceOf(escrow.address)).to.be.eq(
      BigInt(escrowBalance) - toUint(Object.values(daiToFlush))
    );
    const { res: daiToFlushPost } = await l2WormholeBridge.call(
      "batched_dai_to_flush",
      {
        domain: TARGET_DOMAIN,
      }
    );
    expect(daiToFlushPost.low).to.be.eq(eth("0"));
    expect(daiToFlushPost.high).to.be.eq(eth("0"));
  });
});
