import { smock } from "@defi-wonderland/smock";
import {
  assertPublicMutableMethods,
  getRandomAddresses,
  simpleDeploy,
  testAuth,
} from "@makerdao/hardhat-utils";
import { expect } from "chai";
import hre from "hardhat";

describe.only("escrow mom", () => {
  describe("refuse", () => {
    it("sets approval to zero", async () => {
      const { admin, l1Alice, l1Bob, dai, escrow, mom, authorityFake } =
        await setupTest();

      authorityFake.canCall
        .whenCalledWith(
          l1Bob.address,
          mom.address,
          mom.interface.getSighash("refuse(address,address,address)")
        )
        .returns(true);

      await mom.setAuthority(authorityFake.address);

      await escrow.approve(dai.address, l1Alice.address, 1);

      expect(await dai.allowance(escrow.address, l1Alice.address)).to.be.eq(1);

      // await expect(
      //   mom.connect(admin).refuse(escrow.address, dai.address, l1Alice.address)
      // ).to.be.revertedWith('L1EscrowMom/not-authorized')

      await mom
        .connect(l1Bob)
        .refuse(escrow.address, dai.address, l1Alice.address);

      expect(await dai.allowance(escrow.address, l1Alice.address)).to.be.eq(0);
    });
    it("emits Refuse event", async () => {
      const { admin, l1Alice, l1Bob, dai, escrow, mom, authorityFake } =
        await setupTest();

      authorityFake.canCall
        .whenCalledWith(
          l1Bob.address,
          mom.address,
          mom.interface.getSighash("refuse(address,address,address)")
        )
        .returns(true);

      await mom.setAuthority(authorityFake.address);

      await expect(
        mom.connect(l1Bob).refuse(escrow.address, dai.address, l1Alice.address)
      )
        .to.emit(mom, "Refuse")
        .withArgs(escrow.address, dai.address, l1Alice.address);
    });
    it("refuse reverts when called by unauthed user", async () => {
      const { admin, l1Alice, l1Bob, dai, escrow, mom, authorityFake } =
        await setupTest();

      authorityFake.canCall
        .whenCalledWith(
          l1Bob.address,
          mom.address,
          mom.interface.getSighash("refuse(address,address,address)")
        )
        .returns(true);

      await mom.setAuthority(authorityFake.address);

      await expect(
        mom
          .connect(l1Alice)
          .refuse(escrow.address, dai.address, l1Alice.address)
      ).to.be.revertedWith("L1EscrowMom/not-authorized");

      expect(await dai.allowance(escrow.address, l1Alice.address)).to.be.eq(0);
    });
    it("refuse reverts when called by unauthed user", async () => {
      const { admin, l1Alice, l1Bob, dai, escrow, mom, authorityFake } =
        await setupTest();

      authorityFake.canCall
        .whenCalledWith(
          l1Bob.address,
          mom.address,
          mom.interface.getSighash("refuse(address,address,address)")
        )
        .returns(true);

      await mom.setAuthority(authorityFake.address);

      await expect(
        mom.connect(l1Bob).setAuthority(authorityFake.address)
      ).to.be.revertedWith("L1EscrowMom/only-owner");

      await expect(
        mom.connect(l1Bob).setOwner(authorityFake.address)
      ).to.be.revertedWith("L1EscrowMom/only-owner");

    });
  }),
    it("has correct public interface", async () => {
      await assertPublicMutableMethods("L1EscrowMom", [
        "refuse(address,address,address)",
        "setAuthority(address)",
        "setOwner(address)",
      ]);
    });
});

async function setupTest() {
  const [admin, l1Alice, l1Bob]: any[] = await hre.ethers.getSigners();

  const dai: any = await simpleDeploy("DAIMock", []);
  const escrow: any = await simpleDeploy("L1Escrow", []);
  const mom: any = await simpleDeploy("L1EscrowMom", []);
  const authorityFake: any = await smock.fake("AuthorityLike");

  await escrow.rely(mom.address);

  return {
    admin,
    l1Alice,
    l1Bob,
    dai,
    escrow,
    mom,
    authorityFake,
  };
}
