import {
  assertPublicMutableMethods,
  getRandomAddresses,
  simpleDeploy,
  testAuth,
} from "@makerdao/hardhat-utils";
import { expect } from "chai";
import hre from "hardhat";

const allowanceLimit = 100;

describe("l1:escrow", () => {
  describe("approve", () => {
    it("sets approval on erc20 tokens", async () => {
      const { l1Alice, dai, escrow } = await setupTest();

      expect(await dai.allowance(escrow.address, l1Alice.address)).to.be.eq(0);

      await escrow.approve(dai.address, l1Alice.address, allowanceLimit);

      expect(await dai.allowance(escrow.address, l1Alice.address)).to.be.eq(
        allowanceLimit
      );
    });

    it("emits Approval event", async () => {
      const { l1Alice, dai, escrow } = await setupTest();

      await expect(escrow.approve(dai.address, l1Alice.address, allowanceLimit))
        .to.emit(escrow, "Approve")
        .withArgs(dai.address, l1Alice.address, allowanceLimit);
    });

    it("reverts when called by unauthed user", async () => {
      const { l1Alice, l1Bob, dai, escrow } = await setupTest();

      await expect(
        escrow
          .connect(l1Alice)
          .approve(dai.address, l1Bob.address, allowanceLimit)
      ).to.be.revertedWith("L1Escrow/not-authorized");
    });
  });

  it("has correct public interface", async () => {
    await assertPublicMutableMethods("L1Escrow", [
      "rely(address)",
      "deny(address)",
      "approve(address,address,uint256)",
    ]);
  });

  testAuth({
    name: "L1Escrow",
    getDeployArgs: async () => [],
    authedMethods: [
      async (c) => {
        const [a, b] = await getRandomAddresses();
        return c.approve(a, b, 1);
      },
    ],
  });
});

async function setupTest() {
  const [admin, l1Alice, l1Bob] = await hre.ethers.getSigners();

  const dai = await simpleDeploy("DAIMock", []);
  const escrow = await simpleDeploy("L1Escrow", []);

  return {
    admin: admin as any,
    l1Alice: l1Alice as any,
    l1Bob: l1Bob as any,
    dai: dai as any,
    escrow: escrow as any,
  };
}
