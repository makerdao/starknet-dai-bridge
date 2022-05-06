import { smock } from "@defi-wonderland/smock";
import {
  assertPublicMutableMethods,
  simpleDeploy,
} from "@makerdao/hardhat-utils";
import { expect } from "chai";
import { parseEther } from "ethers/lib/utils";
import hre from "hardhat";

const allowanceLimit = 100;
const INITIAL_ESCROW_BALANCE = BigInt(eth("100").toString());
const HANDLE_REGISTER_WORMHOLE = 0;
const HANDLE_FLUSH = 1;
const AMOUNT = BigInt(10);
const L1_TARGET_DOMAIN = hre.ethers.utils.formatBytes32String("1");
const L2_TARGET_DOMAIN = `0x${Buffer.from("1", "utf8").toString("hex")}`;
const L1_SOURCE_DOMAIN = hre.ethers.utils.formatBytes32String("2");
const L2_SOURCE_DOMAIN = `0x${Buffer.from("2", "utf8").toString("hex")}`;

describe("l1:L1DAIWormholeGateway", () => {
  it("initializes properly", async () => {
    const {
      admin,
      dai,
      starkNetFake,
      escrow,
      l1WormholeGateway,
      l2WormholeGatewayAddress,
    } = await setupTest();

    expect(await l1WormholeGateway.starkNet()).to.be.eq(starkNetFake.address);
    expect(await l1WormholeGateway.dai()).to.be.eq(dai.address);
    expect(await l1WormholeGateway.l2DaiWormholeGateway()).to.be.eq(
      l2WormholeGatewayAddress
    );
    expect(await l1WormholeGateway.escrow()).to.be.eq(escrow.address);

    expect(await dai.balanceOf(admin.address)).to.be.eq(
      eth((1000000 - 100).toString())
    );
  });

  it("has correct public interface", async () => {
    await assertPublicMutableMethods("L1DAIWormholeGateway", [
      "finalizeFlush(bytes32,uint256)",
      "finalizeRegisterWormhole((bytes32,bytes32,bytes32,bytes32,uint128,uint80,uint48))",
    ]);
  });

  describe("finalizeFlush", () => {
    it("calls the router to settle the dai debt", async () => {
      const {
        dai,
        escrow,
        starkNetFake,
        wormholeRouterFake,
        l1WormholeGateway,
        l2WormholeGatewayAddress,
      } = await setupTest();

      await l1WormholeGateway.finalizeFlush(
        L1_TARGET_DOMAIN,
        AMOUNT
      );

      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledOnce;
      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledWith(
        l2WormholeGatewayAddress,
        [
          HANDLE_FLUSH,
          L2_TARGET_DOMAIN,
          AMOUNT, // uint256.low
          0, // uint256.high
        ]
      );

      expect(wormholeRouterFake.settle).to.have.been.calledOnce;
      expect(wormholeRouterFake.settle).to.have.been.calledWith(
        L1_TARGET_DOMAIN,
        AMOUNT
      );
      expect(await dai.balanceOf(escrow.address)).to.be.eq(
        INITIAL_ESCROW_BALANCE - AMOUNT
      );
    });
  });

  describe("finalizeRegisterWormhole", () => {
    it("calls the router to request DAI", async () => {
      const {
        l1WormholeGateway,
        l1Alice,
        l1Bob,
        dai,
        escrow,
        starkNetFake,
        wormholeRouterFake,
        l2WormholeGatewayAddress,
      } = await setupTest();

      expect(await dai.allowance(escrow.address, l1Alice.address)).to.be.eq(0);

      await escrow.approve(dai.address, l1Alice.address, allowanceLimit);

      expect(await dai.allowance(escrow.address, l1Alice.address)).to.be.eq(
        allowanceLimit
      );

      const l1Wormhole = [
        L1_SOURCE_DOMAIN, // sourceDomain
        L1_TARGET_DOMAIN, // targetDomain
        `0x${l1Alice.address.slice(2).padStart(64, "0")}`, // receiver
        `0x${l1Bob.address.slice(2).padStart(64, "0")}`, // operator
        AMOUNT, // amount
        0, // nonce
        0, // timestamp
      ];
      const l2Wormhole = [
        L2_SOURCE_DOMAIN, // sourceDomain
        L2_TARGET_DOMAIN, // targetDomain
        `0x${l1Alice.address.slice(2).padStart(64, "0")}`, // receiver
        `0x${l1Bob.address.slice(2).padStart(64, "0")}`, // operator
        AMOUNT, // amount
        0, // nonce
        0, // timestamp
      ];
      await l1WormholeGateway.finalizeRegisterWormhole(l1Wormhole);
      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledOnce;
      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledWith(
        l2WormholeGatewayAddress,
        [HANDLE_REGISTER_WORMHOLE, ...l2Wormhole]
      );

      expect(wormholeRouterFake.requestMint).to.have.been.calledOnce;
      /*
      expect(wormholeRouterFake.requestMint).to.have.been.calledWith(
        {
           sourceDomain: wormhole[0],
           targetDomain: wormhole[1],
           receiver: wormhole[2],
           operator: wormhole[3],
           amount: wormhole[4]
        },
        0,
        0
      );
      */
    });
  });
});

async function setupTest() {
  const [admin, l1Alice, l1Bob] = await hre.ethers.getSigners();

  const starkNetFake = await smock.fake(
    "./contracts/l1/L1DAIWormholeGateway.sol:StarkNetLike"
  );
  const wormholeRouterFake = await smock.fake("WormholeRouter");

  const dai: any = await simpleDeploy("DAIMock", []);

  const escrow: any = await simpleDeploy("L1Escrow", []);

  const L2_DAI_WORMHOLE_GATEWAY_ADDRESS = 31414;

  const l1WormholeGateway = await simpleDeploy("L1DAIWormholeGateway", [
    starkNetFake.address,
    dai.address,
    L2_DAI_WORMHOLE_GATEWAY_ADDRESS,
    escrow.address,
    wormholeRouterFake.address,
  ]);

  const MAX = BigInt(2 ** 256) - BigInt(1);
  await escrow
    .connect(admin)
    .approve(dai.address, l1WormholeGateway.address, MAX);
  await dai.connect(admin).transfer(escrow.address, INITIAL_ESCROW_BALANCE);

  return {
    admin: admin as any,
    l1Alice: l1Alice as any,
    l1Bob: l1Bob as any,
    dai: dai as any,
    escrow: escrow as any,
    starkNetFake: starkNetFake as any,
    wormholeRouterFake: wormholeRouterFake as any,
    l1WormholeGateway: l1WormholeGateway as any,
    l2WormholeGatewayAddress: L2_DAI_WORMHOLE_GATEWAY_ADDRESS,
  };
}

// units
export function eth(amount: string) {
  return parseEther(amount);
}
