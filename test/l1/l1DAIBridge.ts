import { smock } from "@defi-wonderland/smock";
import { BigNumber, parseFixed } from "@ethersproject/bignumber";
import {
  assertPublicMutableMethods,
  simpleDeploy,
  testAuth,
} from "@makerdao/hardhat-utils";
import chai, { expect } from "chai";
import { ethers } from "ethers";
import { parseEther } from "ethers/lib/utils";
import hre from "hardhat";

chai.use(smock.matchers);

const MAX_UINT256 = hre.ethers.constants.MaxUint256;
const DEPOSIT = parseFixed(
  "1285101517810983806491589552491143496277809242732141897358598292095611420389"
);
const FORCE_WITHDRAW = parseFixed(
  "1137729855293860737061629600728503767337326808607526258057644140918272132445"
);

const WITHDRAW = 0;

function toSplitUint(value: any) {
  const bits = value.toBigInt().toString(16).padStart(64, "0");
  return [BigInt(`0x${bits.slice(32)}`), BigInt(`0x${bits.slice(0, 32)}`)];
}

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
      "deposit(uint256,uint256)",
      "withdraw(uint256,address)",
      "forceWithdrawal(uint256,uint256)",
      "setCeiling(uint256)",
      "setMaxDeposit(uint256)",
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

      await l1Bridge.connect(admin).setCeiling(depositAmount);

      await expect(l1Bridge.connect(l1Alice).deposit(depositAmount, l2User))
        .to.emit(l1Bridge, "LogDeposit")
        .withArgs(l1Alice.address, depositAmount, l2User);

      expect(await dai.balanceOf(l1Alice.address)).to.be.eq(0);
      expect(await dai.balanceOf(l1Bridge.address)).to.be.eq(0);
      expect(await dai.balanceOf(escrow.address)).to.be.eq(depositAmount);

      expect(starkNetFake.sendMessageToL2).to.have.been.calledOnce;
      expect(starkNetFake.sendMessageToL2).to.have.been.calledWith(
        l2BridgeAddress,
        DEPOSIT,
        [l2User, ...toSplitUint(depositAmount)]
      );
    });
    it("reverts when to address is invalid", async () => {
      const { l1Alice, l1Bridge, l2DaiAddress } = await setupTest();

      const depositAmount = eth("333");

      await expect(
        l1Bridge.connect(l1Alice).deposit(depositAmount, "0")
      ).to.be.revertedWith("L1DAIBridge/invalid-address");

      await expect(
        l1Bridge.connect(l1Alice).deposit(depositAmount, l2DaiAddress)
      ).to.be.revertedWith("L1DAIBridge/invalid-address");

      // 2 ** 251 + 17 * 2 ** 192 + 1
      const SN_PRIME = BigNumber.from(
        "3618502788666131213697322783095070105623107215331596699973092056135872020481"
      );

      await expect(
        l1Bridge.connect(l1Alice).deposit(depositAmount, SN_PRIME)
      ).to.be.revertedWith("L1DAIBridge/invalid-address");

      await expect(
        l1Bridge
          .connect(l1Alice)
          .deposit(depositAmount, ethers.constants.MaxUint256)
      ).to.be.revertedWith("L1DAIBridge/invalid-address");

      await expect(
        l1Bridge
          .connect(l1Alice)
          .deposit(
            depositAmount,
            ethers.constants.MaxUint256.add(SN_PRIME).div(2)
          )
      ).to.be.revertedWith("L1DAIBridge/invalid-address");
    });

    it("reverts when approval is too low", async () => {
      const { admin, l1Alice, dai, l1Bridge } = await setupTest();

      const depositAmount = eth("333");
      const l2User = "123";

      await dai.connect(admin).transfer(l1Alice.address, depositAmount);
      await dai
        .connect(l1Alice)
        .approve(l1Bridge.address, depositAmount.sub(1));

      await l1Bridge.connect(admin).setCeiling(depositAmount);

      await expect(
        l1Bridge.connect(l1Alice).deposit(depositAmount, l2User)
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });
    it("reverts when funds too low", async () => {
      const { admin, l1Alice, dai, l1Bridge } = await setupTest();

      const depositAmount = eth("333");
      const l2User = "123";

      await dai.connect(admin).transfer(l1Alice.address, depositAmount.sub(1));
      await dai.connect(l1Alice).approve(l1Bridge.address, depositAmount);

      await l1Bridge.connect(admin).setCeiling(depositAmount);

      await expect(
        l1Bridge.connect(l1Alice).deposit(depositAmount, l2User)
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("reverts when bridge is closed", async () => {
      const { admin, l1Alice, l1Bridge } = await setupTest();

      const depositAmount = eth("333");
      const l2User = "123";

      await l1Bridge.connect(admin).setCeiling(depositAmount);
      await l1Bridge.connect(admin).close();

      await expect(
        l1Bridge.connect(l1Alice).deposit(depositAmount, l2User)
      ).to.be.revertedWith("L1DAIBridge/closed");
    });
    it("reverts when ceiling is too low", async () => {
      const { admin, l1Alice, dai, l1Bridge } = await setupTest();

      const depositAmount = eth("333");
      const l2User = "123";

      await dai.connect(admin).transfer(l1Alice.address, depositAmount);
      await dai.connect(l1Alice).approve(l1Bridge.address, depositAmount);
      await l1Bridge.connect(admin).setCeiling(depositAmount.sub(1));

      await expect(
        l1Bridge.connect(l1Alice).deposit(depositAmount, l2User)
      ).to.be.revertedWith("L1DAIBridge/above-ceiling");
    });
    it("reverts when ceiling is too low", async () => {
      const { admin, l1Alice, dai, l1Bridge } = await setupTest();

      const depositAmount = eth("333");
      const l2User = "123";

      await dai.connect(admin).transfer(l1Alice.address, depositAmount);
      await dai.connect(l1Alice).approve(l1Bridge.address, depositAmount);
      await l1Bridge.connect(admin).setMaxDeposit(depositAmount.sub(1));

      await expect(
        l1Bridge.connect(l1Alice).deposit(depositAmount, l2User)
      ).to.be.revertedWith("L1DAIBridge/above-max-deposit");
    });
  });
  describe("withdraw", function () {
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
        l1Bridge.connect(l1Alice).withdraw(withdrawalAmount, l1Alice.address)
      )
        .to.emit(l1Bridge, "LogWithdrawal")
        .withArgs(l1Alice.address, withdrawalAmount);

      expect(await dai.balanceOf(l1Alice.address)).to.be.eq(withdrawalAmount);
      expect(await dai.balanceOf(l1Bridge.address)).to.be.eq(0);
      expect(await dai.balanceOf(escrow.address)).to.be.eq(0);

      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledOnce;
      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledWith(
        l2BridgeAddress,
        [WITHDRAW, l1Alice.address, ...toSplitUint(withdrawalAmount)]
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

      await l1Bridge.connect(l1Alice).withdraw(withdrawalAmount, l1Bob.address);

      expect(await dai.balanceOf(l1Alice.address)).to.be.eq(0);
      expect(await dai.balanceOf(l1Bob.address)).to.be.eq(withdrawalAmount);
      expect(await dai.balanceOf(l1Bridge.address)).to.be.eq(0);
      expect(await dai.balanceOf(escrow.address)).to.be.eq(0);

      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledOnce;
      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledWith(
        l2BridgeAddress,
        [WITHDRAW, l1Alice.address, ...toSplitUint(withdrawalAmount)]
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
        .withdraw(withdrawalAmount, l1Alice.address);

      expect(await dai.balanceOf(l1Alice.address)).to.be.eq(withdrawalAmount);
      expect(await dai.balanceOf(l1Bridge.address)).to.be.eq(0);
      expect(await dai.balanceOf(escrow.address)).to.be.eq(0);

      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledOnce;
      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledWith(
        l2BridgeAddress,
        [WITHDRAW, l1Alice.address, ...toSplitUint(withdrawalAmount)]
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
          WITHDRAW,
          l1Bob.address,
          ...toSplitUint(withdrawalAmount),
        ])
        .reverts();

      await expect(
        l1Bridge.connect(l1Bob).withdraw(withdrawalAmount, l1Alice.address)
      ).to.be.reverted;

      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledWith(
        l2BridgeAddress,
        [WITHDRAW, l1Bob.address, ...toSplitUint(withdrawalAmount)]
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
          WITHDRAW,
          l1Alice.address,
          ...toSplitUint(wrongAmount),
        ])
        .reverts();

      await expect(
        l1Bridge.connect(l1Alice).withdraw(wrongAmount, l1Alice.address)
      ).to.be.reverted;

      expect(starkNetFake.consumeMessageFromL2).to.have.been.calledWith(
        l2BridgeAddress,
        [WITHDRAW, l1Alice.address, ...toSplitUint(wrongAmount)]
      );
    });
    it("reverts when escrow access was revoked", async () => {
      const { admin, l1Alice, dai, escrow, l1Bridge } = await setupTest();

      const withdrawalAmount = eth("333");

      await escrow.approve(dai.address, l1Bridge.address, 0);
      await dai.connect(admin).transfer(escrow.address, withdrawalAmount);

      await expect(
        l1Bridge.connect(l1Alice).withdraw(withdrawalAmount, l1Alice.address)
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
      await expect(l1Bridge.connect(l1Alice).close()).to.be.revertedWith(
        "L1DAIBridge/not-authorized"
      );
    });
  });
  describe("setCeiling", function () {
    it("ceiling can be set by admin", async () => {
      const { admin, l1Bridge } = await setupTest();

      expect(await l1Bridge.ceiling()).to.be.eq(0);
      await expect(l1Bridge.connect(admin).setCeiling(1))
        .to.emit(l1Bridge, "LogCeiling")
        .withArgs(1);
      expect(await l1Bridge.ceiling()).to.be.eq(1);
    });
    it("reverts when called not by the owner", async () => {
      const { l1Alice, l1Bridge } = await setupTest();

      expect(await l1Bridge.ceiling()).to.be.eq(0);
      await expect(l1Bridge.connect(l1Alice).setCeiling(1)).to.be.revertedWith(
        "L1DAIBridge/not-authorized"
      );
    });
  });
  describe("setMaxDeposit", function () {
    it("maxDeposit can be set by admin", async () => {
      const { admin, l1Bridge } = await setupTest();

      expect(await l1Bridge.maxDeposit()).to.be.eq(MAX_UINT256);
      await expect(l1Bridge.connect(admin).setMaxDeposit(100))
        .to.emit(l1Bridge, "LogMaxDeposit")
        .withArgs(100);
      expect(await l1Bridge.maxDeposit()).to.be.eq(100);
    });
    it("reverts when called not by the owner", async () => {
      const { l1Alice, l1Bridge } = await setupTest();

      expect(await l1Bridge.maxDeposit()).to.be.eq(MAX_UINT256);
      await expect(l1Bridge.connect(l1Alice).setMaxDeposit(1)).to.be.revertedWith(
        "L1DAIBridge/not-authorized"
      );
    });
  });
  describe("forceWithdrawal", function () {
    it("sends a message to l2, emits event", async () => {
      const { l1Alice, starkNetFake, l1Bridge, l2BridgeAddress } =
        await setupTest();

      const amount = eth("333");
      const l2User = "123";

      await expect(l1Bridge.connect(l1Alice).forceWithdrawal(amount, l2User))
        .to.emit(l1Bridge, "LogForceWithdrawal")
        .withArgs(l1Alice.address, amount, l2User);

      expect(starkNetFake.sendMessageToL2).to.have.been.calledOnce;
      expect(starkNetFake.sendMessageToL2).to.have.been.calledWith(
        l2BridgeAddress,
        FORCE_WITHDRAW,
        [l2User, l1Alice.address, ...toSplitUint(amount)]
      );
    });
    it("reverts when bridge is closed", async () => {
      const { l1Alice, admin, l1Bridge } = await setupTest();

      const amount = eth("333");
      const l2User = "123";

      await l1Bridge.connect(admin).close();

      await expect(
        l1Bridge.connect(l1Alice).forceWithdrawal(amount, l2User)
      ).to.be.revertedWith("L1DAIBridge/closed");
    });
  });
  testAuth({
    name: "L1DAIBridge",
    getDeployArgs: async () => {
      const { starkNetFake, dai, escrow, l2BridgeAddress, l2DaiAddress } =
        await setupTest();
      return [
        starkNetFake.address,
        dai.address,
        l2DaiAddress,
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

  const dai = await simpleDeploy("DAIMock", []);

  const escrow = await simpleDeploy("L1Escrow", []);

  const L2_DAI_BRIDGE_ADDRESS = 31415;
  const L2_DAI_ADDRESS = 27182;

  const l1Bridge = await simpleDeploy("L1DAIBridge", [
    starkNetFake.address,
    dai.address,
    L2_DAI_ADDRESS,
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
    l2DaiAddress: L2_DAI_ADDRESS,
  };
}

// units
export function eth(amount: string) {
  return parseEther(amount);
}
