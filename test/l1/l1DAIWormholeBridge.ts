import { smock } from "@defi-wonderland/smock";
import {
  assertPublicMutableMethods,
  simpleDeploy,
} from "@makerdao/hardhat-utils";
import { expect } from "chai";
import { parseEther } from "ethers/lib/utils";
import hre from "hardhat";

const allowanceLimit = 100;

describe.only("L1DAIWormholeBridge", () => {
  it("initializes properly", async () => {
    const {
      admin,
      dai,
      starkNetFake,
      escrow,
      l1WormholeBridge,
      l2WormholeBridgeAddress,
    } = await setupTest();

    expect(await l1WormholeBridge.starkNet()).to.be.eq(starkNetFake.address);
    expect(await l1WormholeBridge.dai()).to.be.eq(dai.address);
    expect(await l1WormholeBridge.l2DaiWormholeBridge()).to.be.eq(
      l2WormholeBridgeAddress
    );
    expect(await l1WormholeBridge.escrow()).to.be.eq(escrow.address);

    expect(await dai.balanceOf(admin.address)).to.be.eq(eth("1000000"));
  });
  it("has correct public interface", async () => {
    await assertPublicMutableMethods("L1DAIWormholeBridge", [
      "finalizeFlush(bytes32,uint256)",
      "finalizeRegisterWormhole((bytes32,bytes32,address,address,uint128))",
    ]);
  });
  describe("finalizeFlush", () => {
    it("finalizeFlush", async () => {
      const {
        admin,
        dai,
        escrow,
        starkNetFake,
        wormholeRouterFake,
        l1WormholeBridge,
        l2WormholeBridgeAddress,
      } = await setupTest();

      const daiToFlush = 1;
      await dai.connect(admin).transfer(escrow.address, daiToFlush);

      const targetDomain = hre.ethers.utils.formatBytes32String("optimism");
      await l1WormholeBridge.finalizeFlush(targetDomain, daiToFlush);

      expect(await dai.balanceOf(escrow.address)).to.be.eq(0);
      expect(await dai.balanceOf(l1WormholeBridge.address)).to.be.eq(
        daiToFlush
      );

      const HANDLE_FLUSH = 1;
      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledOnce;
      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledWith(
        l2WormholeBridgeAddress,
        [
          HANDLE_FLUSH,
          targetDomain,
          daiToFlush, // uint256.low
          0, // uint256.high
        ]
      );

      // check WormholeRouter.settle()
      expect(wormholeRouterFake.settle).to.have.been.calledOnce;
      expect(wormholeRouterFake.settle).to.have.been.calledWith(
        targetDomain,
        daiToFlush
      );
    });
  });

  describe("finalizeRegisterWormhole", () => {
    it("finalizeRegisterWormhole", async () => {
      const {
        l1WormholeBridge,
        l1Alice,
        l1Bob,
        dai,
        escrow,
        starkNetFake,
        l2WormholeBridgeAddress,
      } = await setupTest();

      expect(await dai.allowance(escrow.address, l1Alice.address)).to.be.eq(0);

      await escrow.approve(dai.address, l1Alice.address, allowanceLimit);

      expect(await dai.allowance(escrow.address, l1Alice.address)).to.be.eq(
        allowanceLimit
      );

      const wormhole = [
        hre.ethers.utils.formatBytes32String("starknet"), // sourceDomain
        hre.ethers.utils.formatBytes32String("optimism"), // targetDomain
        l1Alice.address, // receiver
        l1Bob.address, // operator
        0, // amount
      ];
      await l1WormholeBridge.finalizeRegisterWormhole(wormhole);
      const HANDLE_REGISTER_WORMHOLE = 0;
      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledOnce;
      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledWith(
        l2WormholeBridgeAddress,
        [
          HANDLE_REGISTER_WORMHOLE,
          ...wormhole,
          0, // uint256.high
        ]
      );
    });
  });
});

async function setupTest() {
  const [admin, l1Alice, l1Bob] = await hre.ethers.getSigners();

  const starkNetFake = await smock.fake("StarkNetLike");
  const wormholeRouterFake = await smock.fake("WormholeRouter");

  const dai = await simpleDeploy("DAIMock", []);

  const escrow: any = await simpleDeploy("L1Escrow", []);

  const L2_DAI_WORMHOLE_BRIDGE_ADDRESS = 31414;

  const l1WormholeBridge = await simpleDeploy("L1DAIWormholeBridge", [
    starkNetFake.address,
    dai.address,
    L2_DAI_WORMHOLE_BRIDGE_ADDRESS,
    escrow.address,
    wormholeRouterFake.address,
  ]);

  const MAX = BigInt(2 ** 256) - BigInt(1);
  await escrow
    .connect(admin)
    .approve(dai.address, l1WormholeBridge.address, MAX);

  return {
    admin: admin as any,
    l1Alice: l1Alice as any,
    l1Bob: l1Bob as any,
    dai: dai as any,
    escrow: escrow as any,
    starkNetFake: starkNetFake as any,
    wormholeRouterFake: wormholeRouterFake as any,
    l1WormholeBridge: l1WormholeBridge as any,
    l2WormholeBridgeAddress: L2_DAI_WORMHOLE_BRIDGE_ADDRESS,
  };
}

// units
export function eth(amount: string) {
  return parseEther(amount);
}
