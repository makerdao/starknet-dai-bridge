import { smock } from "@defi-wonderland/smock";
import { parseFixed } from "@ethersproject/bignumber";
import {
  assertPublicMutableMethods,
  simpleDeploy,
} from "@makerdao/hardhat-utils";
import chai, { expect } from "chai";
import { parseEther } from "ethers/lib/utils";
import hre from "hardhat";

chai.use(smock.matchers);

const RELAY_SELECTOR = parseFixed(
  "300224956480472355485152391090755024345070441743081995053718200325371913697"
);

describe("l1:L1GovernanceRelay", () => {
  it("initializes properly", async () => {
    const { starkNetFake, l1GovernanceRelay, l2GovernanceRelayAddress } =
      await setupTest();

    expect(await l1GovernanceRelay.starkNet()).to.be.eq(starkNetFake.address);
    expect(await l1GovernanceRelay.l2GovernanceRelay()).to.be.eq(
      l2GovernanceRelayAddress
    );
  });
  it("has correct public interface", async () => {
    await assertPublicMutableMethods("L1GovernanceRelay", [
      "reclaim(address,uint256)",
      "relay(uint256,uint256)",
      "deny(address)",
      "rely(address)",
    ]);
  });
  describe("relay", () => {
    it("relays message with direct gas", async () => {
      const {
        admin,
        starkNetFake,
        l1GovernanceRelay,
        l2GovernanceRelayAddress,
        spellAddress,
      } = await setupTest();

      const options = { value: 1 };
      await l1GovernanceRelay.connect(admin).relay(spellAddress, 1, options);

      expect(starkNetFake.sendMessageToL2).to.have.been.calledOnce;
      expect(starkNetFake.sendMessageToL2).to.have.been.calledWith(
        l2GovernanceRelayAddress,
        RELAY_SELECTOR,
        [spellAddress]
      );
    });
    it("relays message, with prepaid gas", async () => {
      const {
        admin,
        l1Alice,
        starkNetFake,
        l1GovernanceRelay,
        l2GovernanceRelayAddress,
        spellAddress,
      } = await setupTest();

      await l1Alice.sendTransaction({
        to: l1GovernanceRelay.address,
        value: 123,
      });
      await l1GovernanceRelay.connect(admin).relay(spellAddress, 123);

      expect(starkNetFake.sendMessageToL2).to.have.been.calledOnce;
      expect(starkNetFake.sendMessageToL2).to.have.been.calledWith(
        l2GovernanceRelayAddress,
        RELAY_SELECTOR,
        [spellAddress]
      );
    });
    it("reverts when called not by the owner", async () => {
      const { l1Alice, l1GovernanceRelay, spellAddress } = await setupTest();

      const options = { value: 1 };
      await expect(
        l1GovernanceRelay.connect(l1Alice).relay(spellAddress, 1, options)
      ).to.be.revertedWith("L1GovernanceRelay/not-authorized");
    });
  });

  describe("ETH balance", () => {
    it("receive", async () => {
      const { l1Alice, l1GovernanceRelay } = await setupTest();

      await l1Alice.sendTransaction({
        to: l1GovernanceRelay.address,
        value: 123,
      });

      expect(
        await hre.ethers.provider.getBalance(l1GovernanceRelay.address)
      ).to.be.eq(123);
    });
    it("reclaim", async () => {
      const { admin, l1Alice, l1GovernanceRelay } = await setupTest();

      await l1Alice.sendTransaction({
        to: l1GovernanceRelay.address,
        value: 123,
      });

      const balanceBefore = await hre.ethers.provider.getBalance(
        l1Alice.address
      );

      await l1GovernanceRelay.connect(admin).reclaim(l1Alice.address, 123);

      const balanceAfter = await hre.ethers.provider.getBalance(
        l1Alice.address
      );

      expect(balanceBefore).to.be.eq(balanceAfter.sub(123));
    });

    it("reclaim reverts when called not by the owner", async () => {
      const { l1Alice, l1GovernanceRelay } = await setupTest();
      await expect(
        l1GovernanceRelay.connect(l1Alice).reclaim(l1Alice.address, 123)
      ).to.be.revertedWith("L1GovernanceRelay/not-authorized");
    });
  });
});

async function setupTest() {
  const [admin, l1Alice, l1Bob] = await hre.ethers.getSigners();

  const starkNetFake = await smock.fake(
    "./contracts/l1/L1DAIBridge.sol:StarkNetLike"
  );

  const L2_GOVERNANCE_RELAY_ADDRESS = 31415;
  const SPELL_ADDRESS = 31416;

  const l1GovernanceRelay = await simpleDeploy("L1GovernanceRelay", [
    starkNetFake.address,
    L2_GOVERNANCE_RELAY_ADDRESS,
  ]);

  return {
    admin: admin as any,
    l1Alice: l1Alice as any,
    l1Bob: l1Bob as any,
    starkNetFake: starkNetFake as any,
    l1GovernanceRelay: l1GovernanceRelay as any,
    l2GovernanceRelayAddress: L2_GOVERNANCE_RELAY_ADDRESS,
    spellAddress: SPELL_ADDRESS,
  };
}

// units
export function eth(amount: string) {
  return parseEther(amount);
}
