import { expect } from "chai";
import hre, { starknet, ethers } from "hardhat";
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

const L2_TARGET_DOMAIN = `0x${Buffer.from("1", "utf8").toString("hex")}`;
const L2_SOURCE_DOMAIN = `0x${Buffer.from("2", "utf8").toString("hex")}`;
const INVALID_DOMAIN = "123";

// Cairo encoding of "valid_domains"
const VALID_DOMAINS = "9379074284324409537785911406195";

describe("l2:teleport", async function () {
  this.timeout(900_000); // eslint-disable-line

  let l2Auth: Account;
  let bob: Account;
  let alice: Account;
  let foo: Account;

  let l2Dai: StarknetContract;
  let l2Bridge: StarknetContract;
  let l2TeleportGateway: StarknetContract;

  let l1BridgeAddress = "0x9F96fE0633eE838D0298E8b8980E6716bE81388d";
  let l1TeleportAddress = "0x95D8367B74ef8C5d014ff19C212109E243748e28";
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

    l2TeleportGateway = await simpleDeployL2(
      l2Auth,
      "l2_dai_teleport_gateway",
      {
        ward: l2Auth.starknetContract.address,
        dai: l2Dai.address,
        teleport_gateway: l1TeleportAddress,
        domain: L2_SOURCE_DOMAIN,
      },
      hre
    );

    await l2Auth.invoke(l2TeleportGateway, "file", {
      what: VALID_DOMAINS,
      domain: L2_TARGET_DOMAIN,
      data: true,
    });

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

    await l2Auth.invoke(l2Dai, "approve", {
      spender: l2TeleportGateway.address,
      amount: MAX,
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

  it("close can be called by owner", async () => {
    const { response: isOpen } = await l2TeleportGateway.call("is_open", {});
    expect(isOpen).to.be.eq(true);

    await l2Auth.invoke(l2TeleportGateway, "close", {});

    const { response: isOpenAfter } = await l2TeleportGateway.call(
      "is_open",
      {}
    );
    expect(isOpenAfter).to.be.eq(false);
  });

  it("close reverts when not called byowner", async () => {
    try {
      await foo.invoke(l2TeleportGateway, "close", {});
    } catch (err: any) {
      expect(err.message).to.include(
        strToFelt("l2_dai_teleport/not-authorized")
      );
    }
  });

  it("file should not accept invalid what", async () => {
    try {
      await l2Auth.invoke(l2TeleportGateway, "file", {
        what: L2_TARGET_DOMAIN,
        domain: L2_TARGET_DOMAIN,
        data: 0,
      });
    } catch (err: any) {
      expect(err.message).to.include(
        strToFelt("l2_dai_teleport/invalid-param")
      );
    }
  });

  it("file reverts when not called by owner", async () => {
    try {
      await l2Auth.invoke(l2TeleportGateway, "file", {
        what: L2_TARGET_DOMAIN,
        domain: L2_TARGET_DOMAIN,
        data: false,
      });
    } catch (err: any) {
      expect(err.message).to.include(
        strToFelt("l2_dai_teleport/invalid-param")
      );
    }
  });

  it("burns dai, marks it for future flush", async () => {
    await alice.invoke(l2Dai, "approve", {
      spender: l2TeleportGateway.address,
      amount: eth("10"),
    });

    const timestamp = (await starknet.getBlock()).timestamp;

    let txHash = await alice.invoke(l2TeleportGateway, "initiate_teleport", {
      target_domain: L2_TARGET_DOMAIN,
      receiver: l1Recipient,
      amount: eth("10"),
      operator: l1Recipient,
    });

    let receipt = await starknet.getTransactionReceipt(txHash);
    let decodedEvents = l2TeleportGateway.decodeEvents(receipt.events);

    expect(decodedEvents[0]).to.deep.eq({
      name: "TeleportInitialized",
      data: {
        operator: BigInt(l1Recipient),
        receiver: BigInt(l1Recipient),
        source_domain: BigInt(L2_SOURCE_DOMAIN),
        target_domain: BigInt(L2_TARGET_DOMAIN),
        timestamp: BigInt(timestamp),
        amount: eth("10"),
        nonce: BigInt(0),
      },
    });

    // TODO: uncomment when payload type is fixed in the plugin
    // starknet.devnet.consumeMessageFromL2(
    //   l2TeleportGateway.address,
    //   l1TeleportAddress,
    //   [0, l1Recipient, eth("10")]
    // )

    const { response: aliceBalanceOfAfter } = await l2Dai.call("balance_of", {
      user: alice.address,
    });
    expect(aliceBalanceOfAfter).to.be.eq(eth("90"));

    txHash = await alice.invoke(
      l2TeleportGateway,
      "finalize_register_teleport",
      {
        target_domain: L2_TARGET_DOMAIN,
        receiver: l1Recipient,
        amount: eth("10"),
        operator: l1Recipient,
        nonce: BigInt(0),
        timestamp,
      }
    );

    receipt = await starknet.getTransactionReceipt(txHash);
    decodedEvents = l2TeleportGateway.decodeEvents(receipt.events);

    expect(decodedEvents[0]).to.deep.eq({
      name: "TeleportRegisterFinalized",
      data: {
        operator: BigInt(l1Recipient),
        receiver: BigInt(l1Recipient),
        source_domain: BigInt(L2_SOURCE_DOMAIN),
        target_domain: BigInt(L2_TARGET_DOMAIN),
        timestamp: BigInt(timestamp),
        amount: eth("10"),
        nonce: BigInt(0),
      },
    });

    // TODO: uncomment when payload type is fixed in the plugin
    //     payload = [FINALIZE_REGISTER_TELEPORT, *teleport]
    //     starknet.consume_message_from_l2(
    //         from_address=l2_teleport_gateway.contract_address,
    //         to_address=L1_TELEPORT_BRIDGE_ADDRESS,
    //         payload=payload,
    //     )

    const { response: batchedDaiToFlush } = await l2TeleportGateway.call(
      "batched_dai_to_flush",
      {
        domain: L2_TARGET_DOMAIN,
      }
    );
    expect(batchedDaiToFlush).to.be.eq(eth("10"));

    await l2Auth.invoke(l2TeleportGateway, "flush", {
      target_domain: L2_TARGET_DOMAIN,
    });

    // TODO: uncomment when payload type is fixed in the plugin
    //     payload = [
    //         FINALIZE_FLUSH,
    //         TARGET_DOMAIN,
    //         *to_split_uint(TELEPORT_AMOUNT * 2),
    //     ]
    //     starknet.consume_message_from_l2(
    //         from_address=l2_teleport_gateway.contract_address,
    //         to_address=L1_TELEPORT_BRIDGE_ADDRESS,
    //         payload=payload,
    //     )
  });

  it("nonce management", async () => {
    await alice.invoke(l2Dai, "approve", {
      spender: l2TeleportGateway.address,
      amount: eth("20"),
    });

    let txHash = await alice.invoke(l2TeleportGateway, "initiate_teleport", {
      target_domain: L2_TARGET_DOMAIN,
      receiver: l1Recipient,
      amount: eth("10"),
      operator: l1Recipient,
    });

    let receipt = await starknet.getTransactionReceipt(txHash);
    let decodedEvents = l2TeleportGateway.decodeEvents(receipt.events);

    expect(decodedEvents[0].data.nonce).to.deep.eq(BigInt(0));

    txHash = await alice.invoke(l2TeleportGateway, "initiate_teleport", {
      target_domain: L2_TARGET_DOMAIN,
      receiver: l1Recipient,
      amount: eth("10"),
      operator: l1Recipient,
    });

    receipt = await starknet.getTransactionReceipt(txHash);
    decodedEvents = l2TeleportGateway.decodeEvents(receipt.events);

    expect(decodedEvents[0].data.nonce).to.deep.eq(BigInt(1));
  });

  it("reverts when insufficient funds", async () => {
    await alice.invoke(l2Dai, "approve", {
      spender: l2TeleportGateway.address,
      amount: eth("100"),
    });
    try {
      await alice.invoke(l2TeleportGateway, "initiate_teleport", {
        target_domain: L2_TARGET_DOMAIN,
        receiver: l1Recipient,
        amount: eth("100"),
        operator: l1Recipient,
      });
    } catch (err: any) {
      expect(err.message).to.include(strToFelt("dai/insufficient-balance"));
    }
  });

  it("reverts when invalid amount", async () => {
    try {
      await alice.invoke(l2TeleportGateway, "initiate_teleport", {
        target_domain: L2_TARGET_DOMAIN,
        receiver: l1Recipient,
        amount: 2n ** 128n,
        operator: l1Recipient,
      });
    } catch (err: any) {
      expect(err.message).to.include(
        strToFelt("Input too short for arguments")
      );
    }
  });

  it("reverts when domain is not whitelisted", async () => {
    try {
      await alice.invoke(l2TeleportGateway, "initiate_teleport", {
        target_domain: INVALID_DOMAIN,
        receiver: l1Recipient,
        amount: eth("100"),
        operator: l1Recipient,
      });
    } catch (err: any) {
      expect(err.message).to.include(
        strToFelt("l2_dai_teleport/invalid-domain")
      );
    }
  });

  it("reverts when gateway is closed", async () => {
    await l2Auth.invoke(l2TeleportGateway, "close", {});

    try {
      await alice.invoke(l2Dai, "approve", {
        spender: l2TeleportGateway.address,
        amount: eth("10"),
      });

      await alice.invoke(l2TeleportGateway, "initiate_teleport", {
        target_domain: L2_TARGET_DOMAIN,
        receiver: l1Recipient,
        amount: eth("10"),
        operator: l1Recipient,
      });
    } catch (err: any) {
      expect(err.message).to.include(
        strToFelt("l2_dai_teleport/gateway-closed")
      );
    }
  });

  it("cannot flush zero debt", async () => {
    const { response: batchedDaiToFlush } = await l2TeleportGateway.call(
      "batched_dai_to_flush",
      {
        domain: L2_TARGET_DOMAIN,
      }
    );
    expect(batchedDaiToFlush).to.be.eq(0n);

    try {
      await l2Auth.invoke(l2TeleportGateway, "flush", {
        target_domain: L2_TARGET_DOMAIN,
      });
    } catch (err: any) {
      expect(err.message).to.include(
        strToFelt("l2_dai_teleport/no-dai-to-flush")
      );
    }
  });

  it("allows to finalize when closed", async () => {
    await alice.invoke(l2Dai, "approve", {
      spender: l2TeleportGateway.address,
      amount: eth("10"),
    });

    const timestamp = (await starknet.getBlock()).timestamp;

    await alice.invoke(l2TeleportGateway, "initiate_teleport", {
      target_domain: L2_TARGET_DOMAIN,
      receiver: l1Recipient,
      amount: eth("10"),
      operator: l1Recipient,
    });

    await l2Auth.invoke(l2TeleportGateway, "close", {});

    const txHash = await alice.invoke(
      l2TeleportGateway,
      "finalize_register_teleport",
      {
        target_domain: L2_TARGET_DOMAIN,
        receiver: l1Recipient,
        amount: eth("10"),
        operator: l1Recipient,
        nonce: BigInt(0),
        timestamp,
      }
    );

    const receipt = await starknet.getTransactionReceipt(txHash);
    const decodedEvents = l2TeleportGateway.decodeEvents(receipt.events);

    expect(decodedEvents[0]).to.deep.eq({
      name: "TeleportRegisterFinalized",
      data: {
        operator: BigInt(l1Recipient),
        receiver: BigInt(l1Recipient),
        source_domain: BigInt(L2_SOURCE_DOMAIN),
        target_domain: BigInt(L2_TARGET_DOMAIN),
        timestamp: BigInt(timestamp),
        amount: eth("10"),
        nonce: BigInt(0),
      },
    });
  });
});
