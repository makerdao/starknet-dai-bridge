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

describe("l2:dai", async function () {
  this.timeout(900_000); // eslint-disable-line

  let l2Auth: Account;
  let bob: Account;
  let alice: Account;
  let foo: Account;

  let l2Dai: StarknetContract;

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

    await l2Auth.invoke(l2Dai, "mint", {
      recipient: alice.address,
      amount: eth("100"),
    });

    await l2Auth.invoke(l2Dai, "mint", {
      recipient: bob.address,
      amount: eth("100"),
    });

    await hre.starknet.devnet.dump("./dump.json");
  });

  beforeEach(async () => {
    await hre.starknet.devnet.load("./dump.json");
  });

  after(async () => {
    unlinkSync("./dump.json");
  });

  describe("dai", async () => {
    describe("views", async () => {
      it("metadata", async () => {
        const { response: name } = await l2Dai.call("name");
        expect(name).to.be.eq(1386921519817957956156419516361070n);

        const { response: symbol } = await l2Dai.call("symbol");
        expect(symbol).to.be.eq(4473161n);

        const { response: decimals } = await l2Dai.call("decimals");
        expect(decimals).to.be.eq(18n);
      });

      it("total supply", async () => {
        const { response: totalSupply } = await l2Dai.call("total_supply");
        expect(totalSupply).to.be.eq(eth("200"));
      });

      it("balance of", async () => {
        const { response: balanceOf } = await l2Dai.call("balance_of", {
          user: alice.address,
        });
        expect(balanceOf).to.be.eq(eth("100"));
      });
    });

    describe("transfer", () => {
      it("transfer", async () => {
        const txHash = await alice.invoke(l2Dai, "transfer", {
          recipient: bob.address,
          amount: eth("10"),
        });
        const receipt = await starknet.getTransactionReceipt(txHash);
        const decodedEvents = l2Dai.decodeEvents(receipt.events);
        expect(decodedEvents[0]).to.deep.eq({
          name: "Transfer",
          data: {
            sender: BigInt(alice.address),
            recipient: BigInt(bob.address),
            value: eth("10"),
          },
        });
        await checkBalances(eth("90"), eth("110"));
      });

      it("transfer to yourself", async () => {
        await alice.invoke(l2Dai, "transfer", {
          recipient: alice.address,
          amount: 10n,
        });
        await checkBalances(eth("100"), eth("100"));
      });

      it("transfer_from", async () => {
        await alice.invoke(l2Dai, "approve", {
          spender: foo.address,
          amount: eth("10"),
        });
        const txHash = await foo.invoke(l2Dai, "transfer_from", {
          sender: alice.address,
          recipient: bob.address,
          amount: eth("10"),
        });

        const receipt = await starknet.getTransactionReceipt(txHash);
        const decodedEvents = l2Dai.decodeEvents(receipt.events);
        expect(decodedEvents[0]).to.deep.eq({
          name: "Transfer",
          data: {
            sender: BigInt(alice.address),
            recipient: BigInt(bob.address),
            value: eth("10"),
          },
        });
        await checkBalances(eth("90"), eth("110"));
      });

      it("transfer_from to yourself", async () => {
        await alice.invoke(l2Dai, "approve", {
          spender: foo.address,
          amount: eth("10"),
        });
        const txHash = await alice.invoke(l2Dai, "transfer_from", {
          sender: alice.address,
          recipient: alice.address,
          amount: eth("10"),
        });

        const receipt = await starknet.getTransactionReceipt(txHash);
        const decodedEvents = l2Dai.decodeEvents(receipt.events);
        expect(decodedEvents[0]).to.deep.eq({
          name: "Transfer",
          data: {
            sender: BigInt(alice.address),
            recipient: BigInt(alice.address),
            value: eth("10"),
          },
        });
        await checkBalances(eth("100"), eth("100"));
      });

      it("should not transfer beyond balance", async () => {
        try {
          await alice.invoke(l2Dai, "transfer", {
            recipient: bob.address,
            amount: eth("101"),
          });
        } catch (err: any) {
          expect(err.message).to.contain(strToFelt("dai/insufficient-balance"));
        }
      });

      it("should not transfer to zero address", async () => {
        try {
          await alice.invoke(l2Dai, "transfer", {
            recipient: 0n,
            amount: eth("10"),
          });
        } catch (err: any) {
          expect(err.message).to.contain(strToFelt("dai/invalid-recipient"));
        }
      });

      it("should not transfer to dai address", async () => {
        try {
          await alice.invoke(l2Dai, "transfer", {
            recipient: l2Dai.address,
            amount: eth("10"),
          });
        } catch (err: any) {
          expect(err.message).to.contain(strToFelt("dai/invalid-recipient"));
        }
      });
    });

    describe("mint", () => {
      it("mint", async () => {
        await l2Auth.invoke(l2Dai, "mint", {
          recipient: alice.address,
          amount: eth("10"),
        });

        await checkBalances(eth("110"), eth("100"));
      });

      it("should not allow minting to zero address", async () => {
        try {
          await l2Auth.invoke(l2Dai, "mint", {
            recipient: 0n,
            amount: eth("10"),
          });
        } catch (err: any) {
          expect(err.message).to.contain(strToFelt("dai/invalid-recipient"));
        }
      });

      it("should not allow minting to dai address", async () => {
        try {
          await l2Auth.invoke(l2Dai, "mint", {
            recipient: l2Dai.address,
            amount: eth("10"),
          });
        } catch (err: any) {
          expect(err.message).to.contain(strToFelt("dai/invalid-recipient"));
        }
      });

      it("should not allow minting beyond max", async () => {
        const { response: totalSupply } = await l2Dai.call("total_supply");
        expect(totalSupply).not.to.be.eq(0n);
        try {
          await l2Auth.invoke(l2Dai, "mint", {
            recipient: bob.address,
            amount: MAX,
          });
        } catch (err: any) {
          expect(err.message).to.contain(strToFelt("u256_add Overflow"));
        }
      });
    });

    describe("burn", () => {
      it("burn", async () => {
        await alice.invoke(l2Dai, "burn", {
          account: alice.address,
          amount: eth("10"),
        });

        await checkBalances(eth("90"), eth("100"));
      });

      it("should not burn beyond balance", async () => {
        try {
          await alice.invoke(l2Dai, "burn", {
            account: alice.address,
            amount: eth("110"),
          });
        } catch (err: any) {
          expect(err.message).to.contain(strToFelt("dai/insufficient-balance"));
        }
      });

      it("should not burn other", async () => {
        try {
          await alice.invoke(l2Dai, "burn", {
            account: bob.address,
            amount: eth("10"),
          });
        } catch (err: any) {
          expect(err.message).to.contain(
            strToFelt("dai/insufficient-allowance")
          );
        }
      });

      it("deployer should not burn other", async () => {
        try {
          await l2Auth.invoke(l2Dai, "burn", {
            account: alice.address,
            amount: eth("10"),
          });
        } catch (err: any) {
          expect(err.message).to.contain(
            strToFelt("dai/insufficient-allowance")
          );
        }
      });
    });

    describe("approve", () => {
      it("approve", async () => {
        const txHash = await alice.invoke(l2Dai, "approve", {
          spender: bob.address,
          amount: eth("10"),
        });
        const receipt = await starknet.getTransactionReceipt(txHash);
        const decodedEvents = l2Dai.decodeEvents(receipt.events);
        expect(decodedEvents[0]).to.deep.eq({
          name: "Approval",
          data: {
            owner: BigInt(alice.address),
            spender: BigInt(bob.address),
            value: eth("10"),
          },
        });
        const { response: allowance } = await l2Dai.call("allowance", {
          owner: alice.address,
          spender: bob.address,
        });
        expect(allowance).to.be.eq(eth("10"));
      });

      it("can burn other if approved", async () => {
        await alice.invoke(l2Dai, "approve", {
          spender: bob.address,
          amount: eth("10"),
        });
        const txHash = await bob.invoke(l2Dai, "burn", {
          account: alice.address,
          amount: eth("10"),
        });
        const receipt = await starknet.getTransactionReceipt(txHash);
        const decodedEvents = l2Dai.decodeEvents(receipt.events);
        expect(decodedEvents[0]).to.deep.eq({
          name: "Transfer",
          data: {
            sender: BigInt(alice.address),
            recipient: 0n,
            value: eth("10"),
          },
        });
        await checkBalances(eth("90"), eth("100"));
      });

      it("approve should not accept zero address", async () => {
        try {
          await alice.invoke(l2Dai, "approve", {
            spender: 0n,
            amount: eth("10"),
          });
        } catch (err: any) {
          expect(err.message).to.contain(strToFelt("dai/invalid-recipient"));
        }
      });

      it("decrease allowance should not accept zero addresses", async () => {
        try {
          await alice.invoke(l2Dai, "decrease_allowance", {
            spender: 0n,
            amount: eth("0"),
          });
        } catch (err: any) {
          expect(err.message).to.contain(strToFelt("dai/invalid-recipient"));
        }
      });

      it("increase allowance should not accept zero addresses", async () => {
        try {
          await alice.invoke(l2Dai, "increase_allowance", {
            spender: 0n,
            amount: eth("10"),
          });
        } catch (err: any) {
          expect(err.message).to.contain(strToFelt("dai/invalid-recipient"));
        }
      });

      it("transfer using transfer_from and allowance", async () => {
        await alice.invoke(l2Dai, "approve", {
          spender: foo.address,
          amount: eth("10"),
        });
        await foo.invoke(l2Dai, "transfer_from", {
          sender: alice.address,
          recipient: bob.address,
          amount: eth("10"),
        });
        await checkBalances(eth("90"), eth("110"));
      });

      it("should not transfer beyond allowance", async () => {
        await alice.invoke(l2Dai, "approve", {
          spender: foo.address,
          amount: eth("10"),
        });
        try {
          await foo.invoke(l2Dai, "transfer_from", {
            sender: alice.address,
            recipient: bob.address,
            amount: eth("10") + 1n,
          });
        } catch (err: any) {
          expect(err.message).to.contain(
            strToFelt("dai/insufficient-allowance")
          );
        }
      });

      it("burn using burn and allowance", async () => {
        await alice.invoke(l2Dai, "approve", {
          spender: bob.address,
          amount: eth("10"),
        });
        const txHash = await bob.invoke(l2Dai, "burn", {
          account: alice.address,
          amount: eth("10"),
        });
        const receipt = await starknet.getTransactionReceipt(txHash);
        const decodedEvents = l2Dai.decodeEvents(receipt.events);
        expect(decodedEvents[0]).to.deep.eq({
          name: "Transfer",
          data: {
            sender: BigInt(alice.address),
            recipient: 0n,
            value: eth("10"),
          },
        });
        await checkBalances(eth("90"), eth("100"));
      });

      it("should not burn beyond allowance", async () => {
        await alice.invoke(l2Dai, "approve", {
          spender: bob.address,
          amount: eth("10"),
        });
        try {
          await bob.invoke(l2Dai, "burn", {
            account: alice.address,
            amount: eth("10") + 1n,
          });
        } catch (err: any) {
          expect(err.message).to.contain(
            strToFelt("dai/insufficient-allowance")
          );
        }
      });

      it("increase allowance", async () => {
        await alice.invoke(l2Dai, "approve", {
          spender: bob.address,
          amount: eth("10"),
        });
        await alice.invoke(l2Dai, "increase_allowance", {
          spender: bob.address,
          amount: eth("10"),
        });

        const { response: allowance } = await l2Dai.call("allowance", {
          owner: alice.address,
          spender: bob.address,
        });
        expect(allowance).to.be.eq(eth("20"));
      });

      it("should not increase allowance beyond max", async () => {
        await alice.invoke(l2Dai, "approve", {
          spender: bob.address,
          amount: eth("10"),
        });
        try {
          await alice.invoke(l2Dai, "increase_allowance", {
            spender: bob.address,
            amount: MAX,
          });
        } catch (err: any) {
          expect(err.message).to.contain(strToFelt("u256_add Overflow"));
        }
      });

      it("decrease allowance", async () => {
        await alice.invoke(l2Dai, "approve", {
          spender: bob.address,
          amount: eth("10"),
        });
        await alice.invoke(l2Dai, "decrease_allowance", {
          spender: bob.address,
          amount: eth("1"),
        });

        const { response: allowance } = await l2Dai.call("allowance", {
          owner: alice.address,
          spender: bob.address,
        });
        expect(allowance).to.be.eq(eth("9"));
      });

      it("should not decrease allowance below 0", async () => {
        await alice.invoke(l2Dai, "approve", {
          spender: bob.address,
          amount: eth("10"),
        });
        try {
          await alice.invoke(l2Dai, "decrease_allowance", {
            spender: bob.address,
            amount: eth("11"),
          });
        } catch (err: any) {
          expect(err.message).to.contain(strToFelt("u256_sub Overflow"));
        }
      });
    });

    describe("max allowance", () => {
      it("does not decrease allowance using transfer_from", async () => {
        await alice.invoke(l2Dai, "approve", {
          spender: bob.address,
          amount: MAX,
        });
        await bob.invoke(l2Dai, "transfer_from", {
          sender: alice.address,
          recipient: bob.address,
          amount: eth("10"),
        });
        const { response: allowance } = await l2Dai.call("allowance", {
          owner: alice.address,
          spender: bob.address,
        });
        expect(allowance).to.be.eq(MAX);
        await checkBalances(eth("90"), eth("110"));
      });

      it("does not decrease allowance using burn", async () => {
        await alice.invoke(l2Dai, "approve", {
          spender: bob.address,
          amount: MAX,
        });
        const txHash = await bob.invoke(l2Dai, "burn", {
          account: alice.address,
          amount: eth("10"),
        });
        const receipt = await starknet.getTransactionReceipt(txHash);
        const decodedEvents = l2Dai.decodeEvents(receipt.events);
        expect(decodedEvents[0]).to.deep.eq({
          name: "Transfer",
          data: {
            sender: BigInt(alice.address),
            recipient: 0n,
            value: eth("10"),
          },
        });
        const { response: allowance } = await l2Dai.call("allowance", {
          owner: alice.address,
          spender: bob.address,
        });
        expect(allowance).to.be.eq(MAX);
        await checkBalances(eth("90"), eth("100"));
      });
    });
  });
});
