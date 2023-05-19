import { expect } from "chai";
import hre, { starknet } from "hardhat";
import { Account } from "@shardlabs/starknet-hardhat-plugin/dist/src/account";

import { eth, simpleDeployL2, MAX, strToFelt } from "../utils";
import { StarknetContract } from "@shardlabs/starknet-hardhat-plugin/dist/src/types";

import { unlinkSync } from "fs";

export async function snPredeployedAccounts2(n: number): Promise<Account[]> {
  const accounts: Account[] = [];

  for (const { address, private_key } of (
    await hre.starknet.devnet.getPredeployedAccounts()
  ).slice(0, n)) {
    accounts.push(
      await hre.starknet.OpenZeppelinAccount.getAccountFromAddress(
        address,
        private_key
      )
    );
  }
  return accounts;
}

describe("l2:bridge", async function () {
  this.timeout(900_000); // eslint-disable-line

  let l2Auth: Account;
  let bob: Account;
  let alice: Account;
  let foo: Account;

  let l2Dai: StarknetContract;
  let l2Bridge: StarknetContract;

  let l1BridgeAddress = "0x9F96fE0633eE838D0298E8b8980E6716bE81388d";
  const l1Recipient = "0x8aa7c51A6D380F4d9E273adD4298D913416031Ec";

  async function checkBalances(aliceBalance: bigint, bobBalance: bigint) {
    const { response: aliceBalanceOf } = await l2Dai.call("balance_of", {
      user: alice.address,
    });
    const { response: bobBalanceOf } = await l2Dai.call("balance_of", {
      user: bob.address,
    });
    expect(aliceBalanceOf).to.be.eq(aliceBalance);
    expect(bobBalanceOf).to.be.eq(bobBalance);
  }

  before(async function () {
    await hre.starknet.devnet.restart();

    [l2Auth, alice, bob, foo] = await snPredeployedAccounts2(4);

    l2Dai = await simpleDeployL2(
      l2Auth,
      "dai",
      {
        ward: l2Auth.address,
      },
      hre
    );

    l2Bridge = await simpleDeployL2(
      l2Auth,
      "l2_dai_bridge",
      {
        ward: l2Auth.address,
        dai: l2Dai.address,
        bridge: l1BridgeAddress,
      },
      hre
    );

    await l2Auth.invoke(l2Dai, "mint", {
      recipient: alice.address,
      amount: eth("100"),
    });

    await l2Auth.invoke(l2Dai, "mint", {
      recipient: bob.address,
      amount: eth("100"),
    });

    await l2Auth.invoke(l2Dai, "rely", {
      user: l2Bridge.address,
    });

    await hre.starknet.devnet.dump("./dump.json");
  });

  beforeEach(async () => {
    await hre.starknet.devnet.load("./dump.json");
  });

  after(async () => {
    try {
      unlinkSync("./dump.json");
    } catch (e) {}
  });

  it("initiate withdraw", async () => {
    await alice.invoke(l2Dai, "approve", {
      spender: l2Bridge.address,
      amount: eth("10"),
    });

    const txHash = await alice.invoke(l2Bridge, "initiate_withdraw", {
      l1_recipient: l1Recipient,
      amount: eth("10"),
    });
    const receipt = await starknet.getTransactionReceipt(txHash);
    const decodedEvents = l2Bridge.decodeEvents(receipt.events);

    expect(decodedEvents[0]).to.deep.eq({
      name: "WithdrawInitiated",
      data: {
        l1_recipient: BigInt(l1Recipient),
        amount: eth("10"),
        caller: BigInt(alice.address),
      },
    });
    // TODO: uncomment when payload type is fixed in the plugin
    // starknet.devnet.consumeMessageFromL2(
    //   l2Bridge.address,
    //   l1BridgeAddress,
    //   [0, l1Recipient, eth("10")]
    // )

    await checkBalances(eth("90"), eth("100"));
  });

  it("close should fail when not authorized", async () => {
    try {
      await alice.invoke(l2Bridge, "close");
    } catch (err: any) {
      expect(err.message).to.include(strToFelt("l2_dai_bridge/not-authorized"));
    }
  });

  it("initiate withdraw should fail when closed", async () => {
    await alice.invoke(l2Dai, "approve", {
      spender: l2Bridge.address,
      amount: eth("10"),
    });

    await l2Auth.invoke(l2Bridge, "close");

    const l1Recipient = "0x8aa7c51A6D380F4d9E273adD4298D913416031Ec";
    try {
      await alice.invoke(l2Bridge, "initiate_withdraw", {
        l1_recipient: l1Recipient,
        amount: eth("10"),
      });
    } catch (err: any) {
      expect(err.message).to.include(strToFelt("l2_dai_bridge/bridge-closed"));
    }
    await checkBalances(eth("100"), eth("100"));
  });

  it("initiate withdraw insufficient funds", async () => {
    const l1Recipient = "0x8aa7c51A6D380F4d9E273adD4298D913416031Ec";
    try {
      await foo.invoke(l2Bridge, "initiate_withdraw", {
        l1_recipient: l1Recipient,
        amount: eth("10"),
      });
    } catch (err: any) {
      expect(err.message).to.include(strToFelt("dai/insufficient-balance"));
    }
    await checkBalances(eth("100"), eth("100"));
  });

  it("withdraw invalid l1 address", async () => {
    const INVALID_L1_ADDRESS = 2n ** 251n;

    await alice.invoke(l2Dai, "approve", {
      spender: l2Bridge.address,
      amount: eth("10"),
    });

    try {
      await alice.invoke(l2Bridge, "initiate_withdraw", {
        l1_recipient: INVALID_L1_ADDRESS,
        amount: eth("10"),
      });
    } catch (err: any) {
      expect(err.message).to.include(
        strToFelt("Input too short for arguments")
      );
    }
    await checkBalances(eth("100"), eth("100"));
  });

  it("deposit", async () => {
    const { transaction_hash: txHash } = await starknet.devnet.sendMessageToL2(
      l2Bridge.address,
      "handle_deposit",
      l1BridgeAddress,
      [BigInt(bob.address), eth("10"), 0n, 0n],
      0,
      1n
    );
    const receipt = await starknet.getTransactionReceipt(txHash);
    const decodedEvents = l2Bridge.decodeEvents(receipt.events);

    expect(decodedEvents[0]).to.deep.eq({
      name: "DepositHandled",
      data: {
        account: BigInt(bob.address),
        amount: eth("10"),
      },
    });
    await checkBalances(eth("100"), eth("110"));
  });
});
