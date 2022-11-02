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
const HANDLE_REGISTER_TELEPORT = 0;
const HANDLE_FLUSH = 1;
const AMOUNT = BigInt(10);
const L1_TARGET_DOMAIN = hre.ethers.utils.formatBytes32String("1");
const L2_TARGET_DOMAIN = `0x${Buffer.from("1", "utf8").toString("hex")}`;
const L1_SOURCE_DOMAIN = hre.ethers.utils.formatBytes32String("2");
const L2_SOURCE_DOMAIN = `0x${Buffer.from("2", "utf8").toString("hex")}`;

describe("l1:L1DAITeleportGateway", () => {
  it("initializes properly", async () => {
    const {
      admin,
      dai,
      starkNetFake,
      escrow,
      l1TeleportGateway,
      l2TeleportGatewayAddress,
      teleportRouterFake,
    } = await setupTest();

    expect(await l1TeleportGateway.starkNet()).to.be.eq(starkNetFake.address);
    expect(await l1TeleportGateway.l1Token()).to.be.eq(dai.address);
    expect(await l1TeleportGateway.l2TeleportGateway()).to.be.eq(
      l2TeleportGatewayAddress
    );
    expect(await l1TeleportGateway.l1Escrow()).to.be.eq(escrow.address);
    expect(await l1TeleportGateway.l1TeleportRouter()).to.be.eq(
      teleportRouterFake.address
    );

    expect(await dai.balanceOf(admin.address)).to.be.eq(
      eth((1000000 - 100).toString())
    );
  });

  it("has correct public interface", async () => {
    await assertPublicMutableMethods("L1DAITeleportGateway", [
      "finalizeFlush(bytes32,uint256)",
      "finalizeRegisterTeleport((bytes32,bytes32,bytes32,bytes32,uint128,uint80,uint48))",
    ]);
  });

  describe("finalizeFlush", () => {
    it("calls the router to settle the dai debt", async () => {
      const {
        dai,
        escrow,
        starkNetFake,
        teleportRouterFake,
        l1TeleportGateway,
        l2TeleportGatewayAddress,
      } = await setupTest();

      await l1TeleportGateway.finalizeFlush(L1_TARGET_DOMAIN, AMOUNT);

      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledOnce;
      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledWith(
        l2TeleportGatewayAddress,
        [
          HANDLE_FLUSH,
          L2_TARGET_DOMAIN,
          AMOUNT, // uint256.low
          0, // uint256.high
        ]
      );

      expect(teleportRouterFake.settle).to.have.been.calledOnce;
      expect(teleportRouterFake.settle).to.have.been.calledWith(
        L1_TARGET_DOMAIN,
        AMOUNT
      );
      expect(await dai.balanceOf(escrow.address)).to.be.eq(
        INITIAL_ESCROW_BALANCE - AMOUNT
      );
    });
  });

  describe("finalizeRegisterTeleport", () => {
    it("calls the router to request DAI", async () => {
      const {
        l1TeleportGateway,
        l1Alice,
        l1Bob,
        dai,
        escrow,
        starkNetFake,
        teleportRouterFake,
        l2TeleportGatewayAddress,
      } = await setupTest();

      expect(await dai.allowance(escrow.address, l1Alice.address)).to.be.eq(0);

      await escrow.approve(dai.address, l1Alice.address, allowanceLimit);

      expect(await dai.allowance(escrow.address, l1Alice.address)).to.be.eq(
        allowanceLimit
      );

      const l1Teleport = [
        L1_SOURCE_DOMAIN, // sourceDomain
        L1_TARGET_DOMAIN, // targetDomain
        `0x${l1Alice.address.slice(2).padStart(64, "0")}`, // receiver
        `0x${l1Bob.address.slice(2).padStart(64, "0")}`, // operator
        AMOUNT, // amount
        0, // nonce
        0, // timestamp
      ];
      const l2Teleport = [
        L2_SOURCE_DOMAIN, // sourceDomain
        L2_TARGET_DOMAIN, // targetDomain
        `0x${l1Alice.address.slice(2).padStart(64, "0")}`, // receiver
        `0x${l1Bob.address.slice(2).padStart(64, "0")}`, // operator
        AMOUNT, // amount
        0, // nonce
        0, // timestamp
      ];
      await l1TeleportGateway.finalizeRegisterTeleport(l1Teleport);
      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledOnce;
      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledWith(
        l2TeleportGatewayAddress,
        [HANDLE_REGISTER_TELEPORT, ...l2Teleport]
      );

      expect(teleportRouterFake.requestMint).to.have.been.calledOnce;
      /*
      expect(teleportRouterFake.requestMint).to.have.been.calledWith(
        {
           sourceDomain: teleport[0],
           targetDomain: teleport[1],
           receiver: teleport[2],
           operator: teleport[3],
           amount: teleport[4]
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
    "./contracts/l1/L1DAITeleportGateway.sol:StarkNetLike"
  );
  const teleportRouterFake = await smock.fake("TeleportRouter");

  const dai: any = await simpleDeploy("DAIMock", []);

  const escrow: any = await simpleDeploy("L1Escrow", []);

  const L2_DAI_TELEPORT_GATEWAY_ADDRESS = 31414;

  const l1TeleportGateway = await simpleDeploy("L1DAITeleportGateway", [
    starkNetFake.address,
    dai.address,
    L2_DAI_TELEPORT_GATEWAY_ADDRESS,
    escrow.address,
    teleportRouterFake.address,
  ]);

  const MAX = BigInt(2 ** 256) - BigInt(1);
  await escrow
    .connect(admin)
    .approve(dai.address, l1TeleportGateway.address, MAX);
  await dai.connect(admin).transfer(escrow.address, INITIAL_ESCROW_BALANCE);

  return {
    admin: admin as any,
    l1Alice: l1Alice as any,
    l1Bob: l1Bob as any,
    dai: dai as any,
    escrow: escrow as any,
    starkNetFake: starkNetFake as any,
    teleportRouterFake: teleportRouterFake as any,
    l1TeleportGateway: l1TeleportGateway as any,
    l2TeleportGatewayAddress: L2_DAI_TELEPORT_GATEWAY_ADDRESS,
  };
}

// units
export function eth(amount: string) {
  return parseEther(amount);
}
