import hre from 'hardhat';
import {expect} from "chai";
import {Contract, ContractFactory} from "ethers";
import {smockit} from "@eth-optimism/smock";
import {simpleDeploy} from "@makerdao/hardhat-utils";
import {parseEther} from "ethers/lib/utils";

const { deployContract } = hre.waffle;

describe('L1DAIBridge', function () {
  it('initializes', async () => {

    const { admin, dai, starkNetMock, escrow, l1Bridge, l2BridgeAddress } = await setupTest();

    expect(await l1Bridge.starkNet()).to.be.eq(starkNetMock.address)
    expect(await l1Bridge.dai()).to.be.eq(dai.address)
    expect(await l1Bridge.escrow()).to.be.eq(escrow.address)
    expect(await l1Bridge.l2DaiBridge()).to.be.eq(l2BridgeAddress)

    expect(await dai.balanceOf(admin.address)).to.be.eq(eth('1000000'))
  })

  it('escrows funds and sends a message to l2 on deposit', async () => {
    const { admin, l1User, dai, starkNetMock, escrow, l1Bridge } = await setupTest();

    const depositAmount = eth('333')
    const l2User = '123'

    // const maxUint256 = hre.ethers.constants.MaxUint256
    // await dai.connect(escrow.address).approve(l1Bridge.address, maxUint256)

    await dai.connect(admin).transfer(l1User.address, depositAmount)
    await dai.connect(l1User).approve(l1Bridge.address, depositAmount)

    await l1Bridge.connect(l1User).deposit(l1User.address, l2User, depositAmount)

    expect(await dai.balanceOf(l1User.address)).to.be.eq(0)
    expect(await dai.balanceOf(l1Bridge.address)).to.be.eq(0)
    expect(await dai.balanceOf(escrow.address)).to.be.eq(depositAmount)

    // await starkNetMock.connect(admin).sendMessageToL2(123, 1, [123, 456])

    // console.log(starkNetMock.smocked.sendMessageToL2.calls)

   expect(starkNetMock.smocked.sendMessageToL2.calls[0]).not.to.be.undefined

    // uint256 to_address,
    // uint256 selector,
    // uint256[] calldata payload
    // const sendMessageToL2Call = starkNetMock.smocked.sendMessageToL2.calls[0]
    // expect(sendMessageToL2Call._target).to.equal(.address)
    // expect(depositCallToMessengerCall._message).to.equal(
    //   l2DAITokenBridge.interface.encodeFunctionData('finalizeDeposit', [
    //     l1Dai.address,
    //     l2Dai.address,
    //     user1.address,
    //     user1.address,
    //     depositAmount,
    //     defaultData,
    //   ]),
    // )
  })
});

async function setupTest() {
  const starkNetMock = await deployMock('StarkNetMock')
  const dai = await simpleDeploy('DAIMock', [])

  const [admin, l1User] = await hre.ethers.getSigners();

  const escrow = await simpleDeploy('L1Escrow', [])

  const L2_DAI_BRIDGE_ADDRESS = 31415;

  const l1Bridge = await simpleDeploy(
    'L1DAIBridge',
    [starkNetMock.address, dai.address, escrow.address, L2_DAI_BRIDGE_ADDRESS]
  );

  return {
    admin: admin as any,
    l1User: l1User as any,
    dai: dai as any,
    starkNetMock: starkNetMock as any,
    escrow: escrow as any,
    l1Bridge: l1Bridge as any,
    l2BridgeAddress: L2_DAI_BRIDGE_ADDRESS
  }
}

export async function deployMock<T extends ContractFactory>(
  name: string,
  opts: {
    provider?: any
    address?: string
  } = {},
): Promise<ReturnType<T['deploy']> & { smocked: any }> {
  const factory = (await hre.ethers.getContractFactory(name)) as any
  return await smockit(factory, opts)
}

// units
export function eth(amount: string) {
  return parseEther(amount)
}

