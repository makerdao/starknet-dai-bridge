import { expect } from "chai";
import hre, { starknet } from "hardhat";
import { Account } from "@shardlabs/starknet-hardhat-plugin/dist/src/account";

import { eth, simpleDeployL2, MAX, strToFelt } from "../utils";
import { StarknetContract } from "@shardlabs/starknet-hardhat-plugin/dist/src/types";

import { unlinkSync, promises } from "fs";

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

describe("l2:relay", async function () {
  this.timeout(900_000); // eslint-disable-line

  let l2Auth: Account;
  let bob: Account;
  let alice: Account;
  let foo: Account;

  let l2Dai: StarknetContract;
  let l2Bridge: StarknetContract;
  let l2GovRelay: StarknetContract;

  let l1BridgeAddress = "0x9F96fE0633eE838D0298E8b8980E6716bE81388d";
  let l1GovRelay = "0x2385C60D2756Ed8CA001817fC37FDa216d7466c0";
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

    l2GovRelay = await simpleDeployL2(
      l2Auth,
      "l2_governance_relay",
      {
        l1_governance_relay: l1GovRelay,
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

    await l2Auth.invoke(l2Dai, "rely", {
      user: l2GovRelay.address,
    });

    await l2Auth.invoke(l2Bridge, "rely", {
      user: l2GovRelay.address,
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

  describe("l2:governance relay", async () => {
    it("relay", async () => {
      const spellSrc = `
use starknet::ContractAddress;

#[abi]
  trait IDAI {
  fn mint(to_address: ContractAddress, value: u256);
}

#[contract]
mod Spell {
use traits::Into;
use starknet::ContractAddress;
use starknet::contract_address_const;
use super::IDAIDispatcher;
use super::IDAIDispatcherTrait;

#[constructor]
fn constructor() {
}

#[external]
  fn execute() {
    let dai = contract_address_const::<${l2Dai.address}_felt252>();
    let user = contract_address_const::<${alice.address}_felt252>();
    let amount = ${eth("10")}_u256;
    IDAIDispatcher { contract_address: dai }.mint(user, amount);
  }
}
`;

      try {
        await promises.writeFile("./spell.cairo", spellSrc);

        await hre.run("starknet-compile", {
          addPythonicHints: true,
          paths: ["./spell.cairo"],
        });
      } finally {
        await promises.unlink("./spell.cairo");
      }

      const spellFactory = await hre.starknet.getContractFactory("spell");
      const declareTxHash = await l2Auth.declare(spellFactory);
      const declareReceipt = await hre.starknet.getTransactionReceipt(
        declareTxHash
      );
      expect(declareReceipt.status).to.be.eq("ACCEPTED_ON_L2");

      const classHash = await spellFactory.getClassHash();

      const { transaction_hash } = await hre.starknet.devnet.sendMessageToL2(
        l2GovRelay.address,
        "relay",
        l1GovRelay,
        [BigInt(classHash)],
        0n,
        1n
      );

      const receipt = await hre.starknet.getTransactionReceipt(
        transaction_hash
      );
      expect(receipt.status).to.be.eq("ACCEPTED_ON_L2");

      await checkBalances(eth("110"), eth("100"));
    });
    it("relay fails when called by unauthorized contract", async () => {
      const { transaction_hash } = await hre.starknet.devnet.sendMessageToL2(
        l2GovRelay.address,
        "relay",
        l1Recipient,
        [BigInt(1234)],
        0n,
        1n
      );
      const receipt = await hre.starknet.getTransactionReceipt(
        transaction_hash
      );
      expect(receipt.status).to.be.eq("REJECTED");
      expect(
        (receipt as any).transaction_failure_reason.error_message
      ).to.include(strToFelt("l2_gov_relay/not-from-l1_relay"));
    });
  });
});
