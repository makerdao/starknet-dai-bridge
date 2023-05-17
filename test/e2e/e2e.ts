import {
  getAddressOfNextDeployedContract,
  simpleDeploy,
} from "@makerdao/hardhat-utils";
import { expect } from "chai";
import hre, { ethers, network, starknet } from "hardhat";
import { HttpNetworkConfig } from "hardhat/types";
import { Account } from "@shardlabs/starknet-hardhat-plugin/dist/src/account";

import { eth, simpleDeployL2 } from "../utils";

export async function snPredeployedAccounts(n: number): Promise<Account[]> {
  return Promise.all(
    (await hre.starknet.devnet.getPredeployedAccounts())
      .slice(0, n)
      .map(async ({ address, private_key }) => {
        return await hre.starknet.OpenZeppelinAccount.getAccountFromAddress(
          address,
          private_key
        );
      })
  );
}

describe("e2e", async function () {
  this.timeout(900_000); // eslint-disable-line
  let admin: any;
  let l1Alice: any;
  let l1Bob: any;
  let l2Auth: Account;
  let dai: any;
  let escrow: any;
  let l1Bridge: any;
  let l2Bridge: any;
  let l2Dai: any;
  let teleportRouterFake: any;

  before(async function () {
    await hre.starknet.devnet.restart();

    const networkUrl: string = (network.config as HttpNetworkConfig).url;
    [admin, l1Alice, l1Bob] = await ethers.getSigners();
    [l2Auth] = await snPredeployedAccounts(1);

    const mockStarknetMessaging = await starknet.devnet.loadL1MessagingContract(
      networkUrl
    );
    teleportRouterFake = await simpleDeploy("TeleportRouterMock", []);

    dai = await simpleDeploy("DAIMock", []);

    escrow = await simpleDeploy("L1Escrow", []);

    l2Dai = await simpleDeployL2(
      l2Auth,
      "dai",
      {
        ward: l2Auth.address,
      },
      hre
    );

    const futureL1DAIBridgeAddress = await getAddressOfNextDeployedContract(
      admin
    );

    l2Bridge = await simpleDeployL2(
      l2Auth,
      "l2_dai_bridge",
      {
        ward: l2Auth.address,
        dai: l2Dai.address,
        bridge: futureL1DAIBridgeAddress,
        // registry: registry.address,
      },
      hre
    );

    l1Bridge = await simpleDeploy("L1DAIBridge", [
      mockStarknetMessaging.address,
      dai.address,
      l2Dai.address,
      escrow.address,
      l2Bridge.address,
    ]);

    const MAX = 2n ** 256n - 1n;
    await escrow.connect(admin).approve(dai.address, l1Bridge.address, MAX);
    await l1Bridge.connect(admin).setCeiling(MAX);
    await dai.connect(admin).approve(l1Bridge.address, MAX);
    await dai.connect(admin).transfer(l1Alice.address, eth("1000"));
    await dai.connect(admin).transfer(escrow.address, eth("1000"));
    await l2Auth.invoke(l2Dai, "mint", {
      account: l2Auth.address,
      amount: eth("1000"),
    });
    await l2Auth.invoke(l2Dai, "rely", {
      user: l2Bridge.address,
    });
    await l2Auth.invoke(l2Dai, "approve", {
      spender: l2Bridge.address,
      amount: MAX,
    });
    await dai.connect(l1Alice).approve(l1Bridge.address, MAX);
    await dai.connect(l1Bob).approve(l1Bridge.address, MAX);
  });

  describe("bridge", async () => {
    it("deposit", async () => {
      const currentL1Balance = BigInt(await dai.balanceOf(l1Alice.address));
      const depositAmountL1 = eth("100");
      const depositAmountL2 = eth("100");
      const { response: l2AuthBalance } = await l2Dai.call("balanceOf", {
        user: l2Auth.address,
      });

      await l1Bridge
        .connect(l1Alice)
        .deposit(depositAmountL1, l2Auth.address, { value: 1000 });
      await starknet.devnet.flush();
      await starknet.devnet.flush();

      expect(await dai.balanceOf(l1Alice.address)).to.be.eq(
        currentL1Balance - depositAmountL1
      );
      const { response: l2BalanceAfterDeposit } = await l2Dai.call(
        "balanceOf",
        {
          user: l2Auth.address,
        }
      );
      expect(l2BalanceAfterDeposit).to.deep.equal(
        l2AuthBalance + depositAmountL2
      );
    });

    it("withdraw", async () => {
      const currentL1Balance = await dai.balanceOf(l1Alice.address);
      const withdrawAmountL1 = eth("100");
      const withdrawAmountL2 = eth("100");

      const { response: l2AuthBalance } = await l2Dai.call("balanceOf", {
        user: l2Auth.address,
      });
      // const l2AuthBalance = res;
      await l2Auth.invoke(l2Bridge, "initiate_withdraw", {
        l1_recipient: l1Alice.address,
        amount: withdrawAmountL2,
      });
      await starknet.devnet.flush();
      await l1Bridge
        .connect(l1Alice)
        .withdraw(withdrawAmountL1, l1Alice.address);
      expect(await dai.balanceOf(l1Alice.address)).to.be.eq(
        currentL1Balance.add(withdrawAmountL1)
      );
      const { response: l2BalanceAfterWidthdraw } = await l2Dai.call(
        "balanceOf",
        {
          user: l2Auth.address,
        }
      );

      expect(l2BalanceAfterWidthdraw).to.deep.equal(
        l2AuthBalance - withdrawAmountL2
      );
    });
  });
});
