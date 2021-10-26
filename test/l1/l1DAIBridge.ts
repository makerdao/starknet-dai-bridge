import { smock } from "@defi-wonderland/smock";
import { parseFixed } from "@ethersproject/bignumber";
import {
  assertPublicMutableMethods,
  simpleDeploy,
  testAuth,
} from "@makerdao/hardhat-utils";
import chai, { expect } from "chai";
import { parseEther } from "ethers/lib/utils";
import hre from "hardhat";

chai.use(smock.matchers);

const MAX_UINT256 = hre.ethers.constants.MaxUint256;
const DEPOSIT = parseFixed('1719001440962431497946253267335313592375607408367068470900111420804409451977');
const FORCE_WITHDRAW = parseFixed('855858504913659940327667045659575078143338465596943247368797815565006091899');

const MESSAGE_WITHDRAW = 0;

describe("L1DAIBridge", function () {
  it("initializes properly", async () => {
    const { admin, dai, starkNetFake, escrow, l1Bridge, l2BridgeAddress } =
      await setupTest();

    expect(await l1Bridge.starkNet()).to.be.eq(starkNetFake.address);
    expect(await l1Bridge.dai()).to.be.eq(dai.address);
    expect(await l1Bridge.escrow()).to.be.eq(escrow.address);
    expect(await l1Bridge.l2DaiBridge()).to.be.eq(l2BridgeAddress);

    expect(await dai.balanceOf(admin.address)).to.be.eq(eth("1000000"));
  });
  it("has correct public interface", async () => {
    await assertPublicMutableMethods("L1DAIBridge", [
      "rely(address)",
      "deny(address)",
      "close()",
      "deposit(address,uint256,uint256)",
      "finalizeWithdrawal(address,uint256)",
      "forceWithdrawal(uint256,uint256)",
      "finalizeForceWithdrawal(uint256)",
      "setCeiling(uint256)",
    ]);
  });
  describe("deposit", function () {
    it("escrows funds and sends a message to l2 on deposit", async () => {
      const {
        admin,
        l1Alice,
        dai,
        starkNetFake,
        escrow,
        l1Bridge,
        l2BridgeAddress,
      } = await setupTest();

      const depositAmount = eth("333");
      const l2User = "123";

      await dai.connect(admin).transfer(l1Alice.address, depositAmount);
      await dai.connect(l1Alice).approve(l1Bridge.address, depositAmount);

      await l1Bridge.connect(admin).setCeiling(depositAmount)

      await expect(
        l1Bridge
          .connect(l1Alice)
          .deposit(l1Alice.address, l2User, depositAmount)
      )
        .to.emit(l1Bridge, "Deposit")
        .withArgs(l1Alice.address, l2User, depositAmount);

      expect(await dai.balanceOf(l1Alice.address)).to.be.eq(0);
      expect(await dai.balanceOf(l1Bridge.address)).to.be.eq(0);
      expect(await dai.balanceOf(escrow.address)).to.be.eq(depositAmount);

      expect(starkNetFake.sendMessageToL2).to.have.been.calledOnce;
      expect(starkNetFake.sendMessageToL2).to.have.been.calledWith(
        l2BridgeAddress,
        DEPOSIT,
        [l2User, depositAmount]
      );
    });
    it("reverts when approval is too low", async () => {
      const { admin, l1Alice, dai, l1Bridge } = await setupTest();

      const depositAmount = eth("333");
      const l2User = "123";

      await dai.connect(admin).transfer(l1Alice.address, depositAmount);
      await dai
        .connect(l1Alice)
        .approve(l1Bridge.address, depositAmount.sub(1));

      await l1Bridge.connect(admin).setCeiling(depositAmount)

      await expect(
        l1Bridge
          .connect(l1Alice)
          .deposit(l1Alice.address, l2User, depositAmount)
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });
    it("reverts when funds too low", async () => {
      const { admin, l1Alice, dai, l1Bridge } = await setupTest();

      const depositAmount = eth("333");
      const l2User = "123";

      await dai.connect(admin).transfer(l1Alice.address, depositAmount.sub(1));
      await dai.connect(l1Alice).approve(l1Bridge.address, depositAmount);

      await l1Bridge.connect(admin).setCeiling(depositAmount)

      await expect(
        l1Bridge
          .connect(l1Alice)
          .deposit(l1Alice.address, l2User, depositAmount)
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("reverts when bridge is closed", async () => {
      const { admin, l1Alice, l1Bridge } = await setupTest();

      const depositAmount = eth("333");
      const l2User = "123";

      await l1Bridge.connect(admin).setCeiling(depositAmount)
      await l1Bridge.connect(admin).close();

      await expect(
        l1Bridge
          .connect(l1Alice)
          .deposit(l1Alice.address, l2User, depositAmount)
      ).to.be.revertedWith("L1DAIBridge/closed");
    });
    it("reverts when ceiling is too low", async () => {
      const { admin, l1Alice, dai, l1Bridge } = await setupTest();

      const depositAmount = eth("333");
      const l2User = "123";

      await dai.connect(admin).transfer(l1Alice.address, depositAmount);
      await dai.connect(l1Alice).approve(l1Bridge.address, depositAmount);
      await l1Bridge.connect(admin).setCeiling(depositAmount.sub(1))

      await expect(
        l1Bridge
          .connect(l1Alice)
          .deposit(l1Alice.address, l2User, depositAmount)
      ).to.be.revertedWith("L1DAIBridge/above-ceiling");
    });
  });
  describe("finalizeWithdrawal", function () {
    it("sends funds from the escrow", async () => {
      const {
        admin,
        l1Alice,
        dai,
        starkNetFake,
        escrow,
        l1Bridge,
        l2BridgeAddress,
      } = await setupTest();

      const withdrawalAmount = eth("333");

      await escrow.approve(dai.address, l1Bridge.address, MAX_UINT256);

      await dai.connect(admin).transfer(escrow.address, withdrawalAmount);

      expect(await dai.balanceOf(l1Alice.address)).to.be.eq(0);
      expect(await dai.balanceOf(l1Bridge.address)).to.be.eq(0);
      expect(await dai.balanceOf(escrow.address)).to.be.eq(withdrawalAmount);

      await expect(
        l1Bridge
          .connect(l1Alice)
          .finalizeWithdrawal(l1Alice.address, withdrawalAmount)
      )
        .to.emit(l1Bridge, "FinalizeWithdrawal")
        .withArgs(l1Alice.address, withdrawalAmount);

      expect(await dai.balanceOf(l1Alice.address)).to.be.eq(withdrawalAmount);
      expect(await dai.balanceOf(l1Bridge.address)).to.be.eq(0);
      expect(await dai.balanceOf(escrow.address)).to.be.eq(0);

      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledOnce;
      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledWith(
        l2BridgeAddress,
        [MESSAGE_WITHDRAW, l1Alice.address, withdrawalAmount]
      );
    });
    it("sends funds from the escrow to the 3rd party", async () => {
      const {
        admin,
        l1Alice,
        l1Bob,
        dai,
        starkNetFake,
        escrow,
        l1Bridge,
        l2BridgeAddress,
      } = await setupTest();

      const withdrawalAmount = eth("333");

      await escrow.approve(dai.address, l1Bridge.address, MAX_UINT256);

      await dai.connect(admin).transfer(escrow.address, withdrawalAmount);

      expect(await dai.balanceOf(l1Alice.address)).to.be.eq(0);
      expect(await dai.balanceOf(l1Bob.address)).to.be.eq(0);
      expect(await dai.balanceOf(l1Bridge.address)).to.be.eq(0);
      expect(await dai.balanceOf(escrow.address)).to.be.eq(withdrawalAmount);

      await l1Bridge
        .connect(l1Alice)
        .finalizeWithdrawal(l1Bob.address, withdrawalAmount);

      expect(await dai.balanceOf(l1Alice.address)).to.be.eq(0);
      expect(await dai.balanceOf(l1Bob.address)).to.be.eq(withdrawalAmount);
      expect(await dai.balanceOf(l1Bridge.address)).to.be.eq(0);
      expect(await dai.balanceOf(escrow.address)).to.be.eq(0);

      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledOnce;
      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledWith(
        l2BridgeAddress,
        [MESSAGE_WITHDRAW, l1Alice.address, withdrawalAmount]
      );
    });
    it("sends funds from the escrow, even when closed", async () => {
      const {
        admin,
        l1Alice,
        dai,
        starkNetFake,
        escrow,
        l1Bridge,
        l2BridgeAddress,
      } = await setupTest();

      const withdrawalAmount = eth("333");

      await escrow.approve(dai.address, l1Bridge.address, MAX_UINT256);

      await dai.connect(admin).transfer(escrow.address, withdrawalAmount);

      expect(await dai.balanceOf(l1Alice.address)).to.be.eq(0);
      expect(await dai.balanceOf(l1Bridge.address)).to.be.eq(0);
      expect(await dai.balanceOf(escrow.address)).to.be.eq(withdrawalAmount);

      await l1Bridge.close();
      await l1Bridge
        .connect(l1Alice)
        .finalizeWithdrawal(l1Alice.address, withdrawalAmount);

      expect(await dai.balanceOf(l1Alice.address)).to.be.eq(withdrawalAmount);
      expect(await dai.balanceOf(l1Bridge.address)).to.be.eq(0);
      expect(await dai.balanceOf(escrow.address)).to.be.eq(0);

      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledOnce;
      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledWith(
        l2BridgeAddress,
        [MESSAGE_WITHDRAW, l1Alice.address, withdrawalAmount]
      );
    });
    it("reverts when called by not a withdrawal recipient", async () => {
      const {
        admin,
        l1Alice,
        l1Bob,
        dai,
        starkNetFake,
        escrow,
        l1Bridge,
        l2BridgeAddress,
      } = await setupTest();

      const withdrawalAmount = eth("333");

      await escrow.approve(dai.address, l1Bridge.address, MAX_UINT256);

      await dai.connect(admin).transfer(escrow.address, withdrawalAmount);

      expect(await dai.balanceOf(l1Alice.address)).to.be.eq(0);
      expect(await dai.balanceOf(l1Bridge.address)).to.be.eq(0);
      expect(await dai.balanceOf(escrow.address)).to.be.eq(withdrawalAmount);

      starkNetFake.consumeMessageFromL2
        .whenCalledWith(l2BridgeAddress, [
          MESSAGE_WITHDRAW,
          l1Bob.address,
          withdrawalAmount,
        ])
        .reverts();

      await expect(
        l1Bridge
          .connect(l1Bob)
          .finalizeWithdrawal(l1Alice.address, withdrawalAmount)
      ).to.be.reverted;

      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledWith(
        l2BridgeAddress,
        [MESSAGE_WITHDRAW, l1Bob.address, withdrawalAmount]
      );
    });
    it("reverts when called with wrong amount", async () => {
      const {
        admin,
        l1Alice,
        dai,
        starkNetFake,
        escrow,
        l1Bridge,
        l2BridgeAddress,
      } = await setupTest();

      const withdrawalAmount = eth("333");

      await escrow.approve(dai.address, l1Bridge.address, MAX_UINT256);

      await dai.connect(admin).transfer(escrow.address, withdrawalAmount);

      expect(await dai.balanceOf(l1Alice.address)).to.be.eq(0);
      expect(await dai.balanceOf(l1Bridge.address)).to.be.eq(0);
      expect(await dai.balanceOf(escrow.address)).to.be.eq(withdrawalAmount);

      const wrongAmount = withdrawalAmount.sub(1);
      starkNetFake.consumeMessageFromL2
        .whenCalledWith(l2BridgeAddress, [
          MESSAGE_WITHDRAW,
          l1Alice.address,
          wrongAmount,
        ])
        .reverts();

      await expect(
        l1Bridge
          .connect(l1Alice)
          .finalizeWithdrawal(l1Alice.address, wrongAmount)
      ).to.be.reverted;

      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledWith(
        l2BridgeAddress,
        [MESSAGE_WITHDRAW, l1Alice.address, wrongAmount]
      );
    });
    it("reverts when escrow access was revoked", async () => {
      const { admin, l1Alice, dai, escrow, l1Bridge } = await setupTest();

      const withdrawalAmount = eth("333");

      await escrow.approve(dai.address, l1Bridge.address, 0);
      await dai.connect(admin).transfer(escrow.address, withdrawalAmount);

      await expect(
        l1Bridge
          .connect(l1Alice)
          .finalizeWithdrawal(l1Alice.address, withdrawalAmount)
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });
  });
  describe("close", function () {
    it("can be closed by admin", async () => {
      const { admin, l1Bridge } = await setupTest();

      expect(await l1Bridge.isOpen()).to.be.eq(1);
      await expect(l1Bridge.connect(admin).close()).to.emit(l1Bridge, "Closed");
      expect(await l1Bridge.isOpen()).to.be.eq(0);
    });
    it("close is idempotent", async () => {
      const { admin, l1Bridge } = await setupTest();
      expect(await l1Bridge.isOpen()).to.be.eq(1);

      await l1Bridge.connect(admin).close();
      expect(await l1Bridge.isOpen()).to.be.eq(0);

      await l1Bridge.connect(admin).close();
      expect(await l1Bridge.isOpen()).to.be.eq(0);
    });
    it("reverts when called not by the owner", async () => {
      const { l1Alice, l1Bridge } = await setupTest();

      expect(await l1Bridge.isOpen()).to.be.eq(1);
      await expect(l1Bridge.connect(l1Alice).close())
        .to.be.revertedWith("L1DAIBridge/not-authorized");
    });
  });
  describe("setCeiling", function () {
    it("ceiling can be set by admin", async () => {
      const { admin, l1Bridge } = await setupTest();

      expect(await l1Bridge.ceiling()).to.be.eq(0);
      await expect(l1Bridge.connect(admin).setCeiling(1))
        .to.emit(l1Bridge, "Ceiling")
        .withArgs(1);
      expect(await l1Bridge.ceiling()).to.be.eq(1);
    });
    it("reverts when called not by the owner", async () => {
      const { l1Alice, l1Bridge } = await setupTest();

      expect(await l1Bridge.ceiling()).to.be.eq(0);
      await expect(l1Bridge.connect(l1Alice).setCeiling(1))
        .to.be.revertedWith("L1DAIBridge/not-authorized");
    });
  });
  describe("forceWithdrawal", function () {
    it("sends a message to l2, emits event", async () => {
      const {
        l1Alice,
        starkNetFake,
        l1Bridge,
        l2BridgeAddress,
      } = await setupTest();

      const amount = eth("333");
      const l2User = "123";

      await expect(
        l1Bridge
          .connect(l1Alice)
          .forceWithdrawal(l2User, amount)
      )
        .to.emit(l1Bridge, "ForceWithdrawal")
        .withArgs(l1Alice.address, l2User, amount);

      expect(starkNetFake.sendMessageToL2).to.have.been.calledOnce;
      expect(starkNetFake.sendMessageToL2).to.have.been.calledWith(
        l2BridgeAddress,
        FORCE_WITHDRAW,
        [l2User, l1Alice.address, amount]
      );
    });
    it("don't revert when bridge is closed", async () => {
      const {
        l1Alice,
        admin,
        starkNetFake,
        l1Bridge,
        l2BridgeAddress,
      } = await setupTest();

      const amount = eth("333");
      const l2User = "123";

      await l1Bridge.connect(admin).close();

      await expect(
        l1Bridge
          .connect(l1Alice)
          .forceWithdrawal(l2User, amount)
      )
        .to.emit(l1Bridge, "ForceWithdrawal")
        .withArgs(l1Alice.address, l2User, amount);

      expect(starkNetFake.sendMessageToL2).to.have.been.calledOnce;
      expect(starkNetFake.sendMessageToL2).to.have.been.calledWith(
        l2BridgeAddress,
        FORCE_WITHDRAW,
        [l2User, l1Alice.address, amount]
      );
    });
  });
  testAuth({
    name: "L1DAIBridge",
    getDeployArgs: async () => {
      const { starkNetFake, dai, escrow, l2BridgeAddress } = await setupTest();
      return [
        starkNetFake.address,
        dai.address,
        escrow.address,
        l2BridgeAddress,
      ];
    },
    authedMethods: [(c) => c.close()],
  });
});

async function setupTest() {
  const [admin, l1Alice, l1Bob] = await hre.ethers.getSigners();

  const starkNetFake = await smock.fake("StarkNetLike");

  // starkNetFake.sendMessageToL2.returns()

  const dai = await simpleDeploy("DAIMock", []);

  const escrow = await simpleDeploy("L1Escrow", []);

  const L2_DAI_BRIDGE_ADDRESS = 31415;

  const l1Bridge = await simpleDeploy("L1DAIBridge", [
    starkNetFake.address,
    dai.address,
    escrow.address,
    L2_DAI_BRIDGE_ADDRESS,
  ]);

  return {
    admin: admin as any,
    l1Alice: l1Alice as any,
    l1Bob: l1Bob as any,
    dai: dai as any,
    starkNetFake: starkNetFake as any,
    escrow: escrow as any,
    l1Bridge: l1Bridge as any,
    l2BridgeAddress: L2_DAI_BRIDGE_ADDRESS,
  };
}

// units
export function eth(amount: string) {
  return parseEther(amount);
}
