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

describe("l1:L1GovernanceRelay", function () {
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
      "rely(address)",
      "deny(address)",
      "relay(uint256)",
    ]);
  });
  describe("relay", function () {
    it("relays message", async () => {
      const {
        admin,
        starkNetFake,
        l1GovernanceRelay,
        l2GovernanceRelayAddress,
        spellAddress,
      } = await setupTest();

      await l1GovernanceRelay.connect(admin).relay(spellAddress);

      expect(starkNetFake.sendMessageToL2).to.have.been.calledOnce;
      expect(starkNetFake.sendMessageToL2).to.have.been.calledWith(
        l2GovernanceRelayAddress,
        RELAY_SELECTOR,
        [spellAddress]
      );
    });
    it("reverts when called not by the owner", async () => {
      const { l1Alice, l1GovernanceRelay, spellAddress } = await setupTest();

      await expect(
        l1GovernanceRelay.connect(l1Alice).relay(spellAddress)
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
