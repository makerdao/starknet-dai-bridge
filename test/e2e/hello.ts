import {smock} from "@defi-wonderland/smock";
import {parseFixed} from "@ethersproject/bignumber";
import {simpleDeploy} from "@makerdao/hardhat-utils";
import {expect} from "chai";
import hre from "hardhat";

import {eth} from "../l1/l1DAIBridge";

const DEPOSIT = parseFixed(
  "1285101517810983806491589552491143496277809242732141897358598292095611420389"
);

function toSplitUint(value: any) {
  const bits = value.toBigInt().toString(16).padStart(64, "0");
  return [BigInt(`0x${bits.slice(32)}`), BigInt(`0x${bits.slice(0, 32)}`)];
}

describe("Integration", function () {
  it("hello", async () => {

    const {
      admin,
      l1Alice,
      dai,
      starkNetMock,
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

    expect(starkNetMock.sendMessageToL2).to.have.been.calledOnce;
    expect(starkNetMock.sendMessageToL2).to.have.been.calledWith(
      l2BridgeAddress,
      DEPOSIT,
      [l2User, ...toSplitUint(depositAmount)]
    );
  });
});

async function setupTest() {
  const [admin, l1Alice, l1Bob] = await hre.ethers.getSigners();

  // const starkNetFake = await smock.fake("StarkNetLike");

  const starkNetMockFactory = await smock.mock('StarkNetMock');
  const starkNetMock = await starkNetMockFactory.deploy();

  const dai = await simpleDeploy("DAIMock", []);

  const escrow = await simpleDeploy("L1Escrow", []);

  console.log('Deploying registry...')
  const registryFactory = await hre.starknet.getContractFactory("registry");
  const registry = await registryFactory.deploy()
  console.log('Registry deployed!')

  const L2_DAI_BRIDGE_ADDRESS = 31415;
  const L2_DAI_ADDRESS = 27182;

  const l1Bridge = await simpleDeploy("L1DAIBridge", [
    // starkNetFake.address,
    starkNetMock.address,
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
    // starkNetFake: starkNetFake as any,
    starkNetMock: starkNetMock as any,
    escrow: escrow as any,
    l1Bridge: l1Bridge as any,
    l2BridgeAddress: L2_DAI_BRIDGE_ADDRESS,
    l2DaiAddress: L2_DAI_ADDRESS,
    registry: registry as any
  };
}
