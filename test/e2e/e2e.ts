import {
  getAddressOfNextDeployedContract,
  simpleDeploy,
} from "@makerdao/hardhat-utils";
import { expect } from "chai";
import { ethers, network, starknet } from "hardhat";
import { HttpNetworkConfig } from "hardhat/types";

import {
  asDec,
  eth,
  getEvent,
  l2Eth,
  simpleDeployL2,
  SplitUint,
  toBytes32,
} from "../utils";

const L1_TARGET_DOMAIN = ethers.utils.formatBytes32String("1");
const L2_TARGET_DOMAIN = `0x${Buffer.from("1", "utf8").toString("hex")}`;
const L1_SOURCE_DOMAIN = ethers.utils.formatBytes32String("2");
const L2_SOURCE_DOMAIN = `0x${Buffer.from("2", "utf8").toString("hex")}`;
// Cairo encoding of "valid_domains"
const VALID_DOMAINS = "9379074284324409537785911406195";

describe("e2e", async function () {
  this.timeout(900_000); // eslint-disable-line
  let admin: any;
  let l1Alice: any;
  let l1Bob: any;
  let l2Auth: any;
  let dai: any;
  let escrow: any;
  let l1Bridge: any;
  let l1TeleportGateway: any;
  let l2Bridge: any;
  let l2TeleportGateway: any;
  let l2Dai: any;
  let teleportRouterFake: any;

  before(async function () {
    const networkUrl: string = (network.config as HttpNetworkConfig).url;
    [admin, l1Alice, l1Bob] = await ethers.getSigners();
    l2Auth = await starknet.deployAccount("OpenZeppelin");

    const mockStarknetMessaging = await starknet.devnet.loadL1MessagingContract(
      networkUrl
    );
    teleportRouterFake = await simpleDeploy("TeleportRouterMock", []);

    dai = await simpleDeploy("DAIMock", []);

    escrow = await simpleDeploy("L1Escrow", []);

    const registry = await simpleDeployL2("registry", {}, hre);
    await l2Auth.invoke(registry, "set_L1_address", {
      l1_user: asDec(l1Alice.address),
    });
    l2Dai = await simpleDeployL2(
      "dai",
      {
        ward: asDec(l2Auth.starknetContract.address),
      },
      hre
    );

    const futureL1DAIBridgeAddress = await getAddressOfNextDeployedContract(
      admin
    );
    l2Bridge = await simpleDeployL2(
      "l2_dai_bridge",
      {
        ward: asDec(l2Auth.starknetContract.address),
        dai: asDec(l2Dai.address),
        bridge: asDec(futureL1DAIBridgeAddress),
        registry: asDec(registry.address),
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

    const futureL1DAITeleportGatewayAddress =
      await getAddressOfNextDeployedContract(admin);
    l2TeleportGateway = await simpleDeployL2(
      "l2_dai_teleport_gateway",
      {
        ward: asDec(l2Auth.starknetContract.address),
        dai: asDec(l2Dai.address),
        teleport_gateway: asDec(futureL1DAITeleportGatewayAddress),
        domain: L2_SOURCE_DOMAIN,
      },
      hre
    );
    l1TeleportGateway = await simpleDeploy("L1DAITeleportGateway", [
      mockStarknetMessaging.address,
      dai.address,
      l2TeleportGateway.address,
      escrow.address,
      teleportRouterFake.address,
    ]);

    const MAX = BigInt(2 ** 256) - BigInt(1);
    const MAX_HALF = BigInt(2 ** 128) - BigInt(1);
    await escrow.connect(admin).approve(dai.address, l1Bridge.address, MAX);
    await escrow
      .connect(admin)
      .approve(dai.address, l1TeleportGateway.address, MAX);

    await l2Auth.invoke(l2TeleportGateway, "file", {
      what: VALID_DOMAINS,
      domain: L2_TARGET_DOMAIN,
      data: 1,
    });
    await l1Bridge.connect(admin).setCeiling(MAX);
    await dai.connect(admin).approve(l1Bridge.address, MAX);
    await dai.connect(admin).transfer(l1Alice.address, eth("1000"));
    await dai.connect(admin).transfer(escrow.address, eth("1000"));
    await l2Auth.invoke(l2Dai, "mint", {
      account: asDec(l2Auth.starknetContract.address),
      amount: {
        low: l2Eth("10000").toDec()[0],
        high: l2Eth("10000").toDec()[1],
      },
    });
    await l2Auth.invoke(l2Dai, "rely", {
      user: asDec(l2Bridge.address),
    });
    await l2Auth.invoke(l2Dai, "approve", {
      spender: asDec(l2Bridge.address),
      amount: {
        low: MAX_HALF,
        high: MAX_HALF,
      },
    });
    await l2Auth.invoke(l2Dai, "approve", {
      spender: asDec(l2TeleportGateway.address),
      amount: {
        low: MAX_HALF,
        high: MAX_HALF,
      },
    });
    await dai.connect(l1Alice).approve(l1Bridge.address, MAX);
    await dai.connect(l1Bob).approve(l1Bridge.address, MAX);
  });

  describe("bridge", async () => {
    it("deposit", async () => {
      const currentL1Balance = await dai.balanceOf(l1Alice.address);
      const depositAmountL1 = eth("100");
      const depositAmountL2 = l2Eth("100");
      const { res } = await l2Dai.call("balanceOf", {
        user: asDec(l2Auth.starknetContract.address),
      });
      const l2AuthBalance = new SplitUint(res);

      await l1Bridge
        .connect(l1Alice)
        .deposit(depositAmountL1, l2Auth.starknetContract.address);
      await starknet.devnet.flush();

      expect(await dai.balanceOf(l1Alice.address)).to.be.eq(
        currentL1Balance.sub(depositAmountL1)
      );
      expect(
        await l2Dai.call("balanceOf", {
          user: asDec(l2Auth.starknetContract.address),
        })
      ).to.deep.equal(l2AuthBalance.add(depositAmountL2));
    });

    it("withdraw", async () => {
      const currentL1Balance = await dai.balanceOf(l1Alice.address);
      const withdrawAmountL1 = eth("100");
      const withdrawAmountL2 = l2Eth("100");
      const { res } = await l2Dai.call("balanceOf", {
        user: asDec(l2Auth.starknetContract.address),
      });
      const l2AuthBalance = new SplitUint(res);
      await l2Auth.invoke(l2Bridge, "initiate_withdraw", {
        l1_recipient: asDec(l1Alice.address),
        amount: {
          low: withdrawAmountL2.toDec()[0],
          high: withdrawAmountL2.toDec()[1],
        },
      });
      await starknet.devnet.flush();
      await l1Bridge
        .connect(l1Alice)
        .withdraw(withdrawAmountL1, l1Alice.address);
      expect(await dai.balanceOf(l1Alice.address)).to.be.eq(
        currentL1Balance.add(withdrawAmountL1)
      );
      expect(
        await l2Dai.call("balanceOf", {
          user: asDec(l2Auth.starknetContract.address),
        })
      ).to.deep.equal(l2AuthBalance.sub(withdrawAmountL2));
    });

    describe("force withdrawal", async () => {
      it("happy path", async () => {
        const currentL1Balance = await dai.balanceOf(l1Alice.address);
        const withdrawAmountL1 = eth("100");
        const withdrawAmountL2 = l2Eth("100");

        const { res } = await l2Dai.call("balanceOf", {
          user: asDec(l2Auth.starknetContract.address),
        });
        const l2AuthBalance = new SplitUint(res);
        await l1Bridge
          .connect(l1Alice)
          .forceWithdrawal(withdrawAmountL1, l2Auth.starknetContract.address);
        await starknet.devnet.flush();
        // TODO: get events from message triggered call
        // await getEvent("force_withdrawal_handled", l2Bridge.address); // will error if not found
        await l1Bridge
          .connect(l1Alice)
          .withdraw(withdrawAmountL1, l1Alice.address);

        expect(await dai.balanceOf(l1Alice.address)).to.be.eq(
          currentL1Balance.add(withdrawAmountL1)
        );
        expect(
          await l2Dai.call("balanceOf", {
            user: asDec(l2Auth.starknetContract.address),
          })
        ).to.deep.equal(l2AuthBalance.sub(withdrawAmountL2));
      });

      it("insufficient funds", async () => {
        const currentL1Balance = await dai.balanceOf(l1Alice.address);
        const currentL2Balance = await l2Dai.call("balanceOf", {
          user: asDec(l2Auth.starknetContract.address),
        });
        const withdrawAmountL2 = new SplitUint(currentL2Balance.res).add(
          SplitUint.fromUint(1)
        );
        const withdrawAmountL1 = withdrawAmountL2.toUint();

        await l1Bridge
          .connect(l1Alice)
          .forceWithdrawal(withdrawAmountL1, l2Auth.starknetContract.address);
        await starknet.devnet.flush();

        // TODO: get events from message triggered call
        // await getEvent("force_withdrawal_handled", l2Bridge.address); // will error if not found

        await expect(
          l1Bridge.connect(l1Alice).withdraw(withdrawAmountL1, l1Alice.address)
        ).to.be.revertedWith("INVALID_MESSAGE_TO_CONSUME");

        expect(await dai.balanceOf(l1Alice.address)).to.be.eq(currentL1Balance);
        expect(
          await l2Dai.call("balanceOf", {
            user: asDec(l2Auth.starknetContract.address),
          })
        ).to.deep.equal(currentL2Balance);
      });

      it("insufficient allowance", async () => {
        // set low allowance
        await l2Auth.invoke(l2Dai, "approve", {
          spender: asDec(l2Bridge.address),
          amount: {
            low: BigInt(0),
            high: BigInt(0),
          },
        });

        const currentL1Balance = await dai.balanceOf(l1Alice.address);
        const currentL2Balance = await l2Dai.call("balanceOf", {
          user: asDec(l2Auth.starknetContract.address),
        });
        const withdrawAmountL1 = eth("100");

        await l1Bridge
          .connect(l1Alice)
          .forceWithdrawal(withdrawAmountL1, l2Auth.starknetContract.address);
        await starknet.devnet.flush();

        // TODO: get events from message triggered call
        // await getEvent("force_withdrawal_handled", l2Bridge.address); // will error if not found

        await expect(
          l1Bridge.connect(l1Alice).withdraw(withdrawAmountL1, l1Alice.address)
        ).to.be.revertedWith("INVALID_MESSAGE_TO_CONSUME");
        expect(await dai.balanceOf(l1Alice.address)).to.be.eq(currentL1Balance);
        expect(
          await l2Dai.call("balanceOf", {
            user: asDec(l2Auth.starknetContract.address),
          })
        ).to.deep.equal(currentL2Balance);

        // reset allowance
        const MAX_HALF = BigInt(2 ** 128) - BigInt(1);
        await l2Auth.invoke(l2Dai, "approve", {
          spender: asDec(l2Bridge.address),
          amount: {
            low: MAX_HALF,
            high: MAX_HALF,
          },
        });
      });
    });
  });

  describe("teleport", async () => {
    it("slow path", async () => {
      const { res } = await l2Dai.call("balanceOf", {
        user: asDec(l2Auth.starknetContract.address),
      });
      const l2AuthBalance = new SplitUint(res);
      const teleportAmountL1 = eth("100");
      const teleportAmountL2 = l2Eth("100");
      await l2Auth.invoke(l2TeleportGateway, "initiate_teleport", {
        target_domain: L2_TARGET_DOMAIN,
        receiver: asDec(l1Alice.address),
        amount: teleportAmountL2.toDec()[0],
        operator: asDec(l1Alice.address),
      });
      const [nonce, timestamp] = (
        await getEvent("TeleportInitialized", l2TeleportGateway.address)
      ).slice(-2);
      await l2Auth.invoke(l2TeleportGateway, "finalize_register_teleport", {
        target_domain: L2_TARGET_DOMAIN,
        receiver: asDec(l1Alice.address),
        amount: teleportAmountL2.toDec()[0],
        operator: asDec(l1Alice.address),
        nonce: parseInt(nonce),
        timestamp: parseInt(timestamp),
      });
      await starknet.devnet.flush();

      const teleportGUID = {
        sourceDomain: toBytes32(L1_SOURCE_DOMAIN), // bytes32
        targetDomain: toBytes32(L1_TARGET_DOMAIN), // bytes32
        receiver: toBytes32(l1Alice.address), // bytes32
        operator: toBytes32(l1Alice.address), // bytes32
        amount: teleportAmountL1, // uint128
        nonce: parseInt(nonce), // uint80
        timestamp: parseInt(timestamp), // uint48
      };
      await expect(
        l1TeleportGateway
          .connect(l1Alice)
          .finalizeRegisterTeleport(teleportGUID)
      )
        .to.emit(teleportRouterFake, "RequestMint")
        .withArgs(Object.values(teleportGUID), eth("0"), eth("0"));

      expect(
        await l2Dai.call("balanceOf", {
          user: asDec(l2Auth.starknetContract.address),
        })
      ).to.deep.equal(l2AuthBalance.sub(teleportAmountL2));

      // check that can't withdraw twice
      try {
        await l2Auth.invoke(l2TeleportGateway, "finalize_register_teleport", {
          target_domain: L2_TARGET_DOMAIN,
          receiver: asDec(l1Alice.address),
          amount: teleportAmountL2.toDec()[0],
          operator: asDec(l1Alice.address),
          nonce,
          timestamp,
        });
        expect(true).to.be.eq(false);
      } catch {
        expect(true).to.be.eq(true);
      }
    });

    it("settle", async () => {
      const depositAmountL1 = eth("100");
      await l1Bridge
        .connect(l1Alice)
        .deposit(depositAmountL1, l2Auth.starknetContract.address);
      const escrowBalance = await dai.balanceOf(escrow.address);
      const { res } = await l2TeleportGateway.call("batched_dai_to_flush", {
        domain: L2_TARGET_DOMAIN,
      });
      const daiToFlush = new SplitUint(res);
      await l2Auth.invoke(l2TeleportGateway, "flush", {
        target_domain: L2_TARGET_DOMAIN,
      });
      await starknet.devnet.flush();

      await expect(
        l1TeleportGateway
          .connect(l1Alice)
          .finalizeFlush(L1_TARGET_DOMAIN, daiToFlush.toUint())
      )
        .to.emit(teleportRouterFake, "Settle")
        .withArgs(L1_TARGET_DOMAIN, daiToFlush.toUint());

      expect(await dai.balanceOf(escrow.address)).to.be.eq(
        BigInt(escrowBalance) - daiToFlush.toUint()
      );
      expect(
        await l2TeleportGateway.call("batched_dai_to_flush", {
          domain: L2_TARGET_DOMAIN,
        })
      ).to.deep.eq(l2Eth("0"));
    });
  });
});
