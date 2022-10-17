import { expect } from "chai";
import { utils } from "ethers";
import fs from "fs";
import { task } from "hardhat/config";

import {
  asDec,
  deployL1,
  deployL2,
  getAccount,
  getActiveWards,
  getAddressOfNextDeployedContract,
  getL1ContractAt,
  getL2ContractAt,
  getNetwork,
  getOptionalEnv,
  getRequiredEnv,
  waitForTx,
  wards,
} from "./utils";

task("deploy-bridge-upgrade", "Deploy bridge upgrade").setAction(
  async (_, hre) => {
    const [l1Signer] = await hre.ethers.getSigners();

    const { network, NETWORK } = getNetwork(hre);

    console.log(`Deploying bridge upgrade on: ${network}`);

    const TOKEN = getOptionalEnv(`${NETWORK}_TOKEN`);

    const deploymentOptions = TOKEN ? { token: TOKEN } : {};

    if (TOKEN) {
      console.log(`Using token: ${TOKEN}`);
    }

    const L1_DAI_ADDRESS = getRequiredEnv(`${NETWORK}_L1_DAI_ADDRESS`);

    const L1_STARKNET_ADDRESS = getRequiredEnv(
      `${NETWORK}_L1_STARKNET_ADDRESS`
    );
    const L1_PAUSE_PROXY_ADDRESS = getRequiredEnv(
      `${NETWORK}_L1_PAUSE_PROXY_ADDRESS`
    );
    const L1_ESM_ADDRESS = getRequiredEnv(`${NETWORK}_L1_ESM_ADDRESS`);
    const DENY_DEPLOYER = getRequiredEnv("DENY_DEPLOYER") === "true";

    const L1_ESCROW_MOM_ADDRESS = getRequiredEnv(
      `${NETWORK}_L1_ESCROW_MOM_ADDRESS`
    );

    const deployer = await getAccount("deployer", hre);

    console.log("From");
    console.log(
      `\tl2 account: ${deployer.starknetContract.address.toString()}`
    );
    console.log(
      `\tl1 account: ${(await hre.ethers.getSigners())[0].address.toString()}`
    );

    console.log("Deny deployer:", DENY_DEPLOYER);

    const gasPrice = getOptionalEnv(`${NETWORK}_GAS_PRICE`);
    const gasOverrides = gasPrice
      ? { gasPrice: utils.parseUnits(gasPrice, "gwei") }
      : {};

    if (gasOverrides.gasPrice) {
      console.log("Gas price:", gasOverrides.gasPrice.toString());
    }

    const l2DAI = await getL2ContractAt(
      hre,
      "dai",
      getRequiredEnv(`${NETWORK}_L2_DAI_ADDRESS`)
    );

    const l2GovernanceRelay = await getL2ContractAt(
      hre,
      "l2_governance_relay",
      getRequiredEnv(`${NETWORK}_L2_GOVERNANCE_RELAY_ADDRESS`)
    );

    const registry = await getL2ContractAt(
      hre,
      "registry",
      getRequiredEnv(`${NETWORK}_L2_REGISTRY_ADDRESS`)
    );
    const l1Escrow = await getL1ContractAt(
      hre,
      "L1Escrow",
      getRequiredEnv(`${NETWORK}_L1_ESCROW_ADDRESS`)
    );

    const oldL2DAIBridgeAddress = getRequiredEnv(
      `${NETWORK}_L2_DAI_BRIDGE_ADDRESS`
    );

    const oldL1DAIBridge = await getL1ContractAt(
      hre,
      "L1DAIBridge",
      getRequiredEnv(`${NETWORK}_L1_DAI_BRIDGE_ADDRESS`)
    );

    const futureL1DAIBridgeAddress = await getAddressOfNextDeployedContract(
      l1Signer
    );

    const l2DAIBridge = await deployL2(
      hre,
      "l2_dai_bridge",
      {
        ward: asDec(deployer.starknetContract.address),
        dai: asDec(l2DAI.address),
        bridge: asDec(futureL1DAIBridgeAddress),
        registry: asDec(registry.address),
      },
      deploymentOptions
    );

    const l1DAIBridge = await deployL1(
      hre,
      "L1DAIBridge",
      [
        L1_STARKNET_ADDRESS,
        L1_DAI_ADDRESS,
        l2DAI.address,
        l1Escrow.address,
        l2DAIBridge.address,
      ],
      gasOverrides
    );
    expect(
      futureL1DAIBridgeAddress === l1DAIBridge.address,
      "futureL1DAIBridgeAddress != l1DAIBridge.address"
    );

    // This needs to be done in a l1 gov spell
    // console.log("L1Escrow approving L1DAIBridge...");
    // const MAX = BigInt(2 ** 256) - BigInt(1);
    //
    // l1Escrow.approve(L1_DAI_ADDRESS, l1DAIBridge.address)
    // l1DAIBridge.close()

    console.log("Setting ceiling...");
    await waitForTx(
      l1DAIBridge.setCeiling(await oldL1DAIBridge.ceiling(), gasOverrides)
    );
    console.log("Setting max deposit...");
    await waitForTx(
      l1DAIBridge.setMaxDeposit(await oldL1DAIBridge.maxDeposit(), gasOverrides)
    );

    console.log("Finalizing permissions for L1DAIBridge...");
    await waitForTx(l1DAIBridge.rely(L1_PAUSE_PROXY_ADDRESS, gasOverrides));
    await waitForTx(l1DAIBridge.rely(L1_ESCROW_MOM_ADDRESS, gasOverrides));
    await waitForTx(l1DAIBridge.rely(L1_ESM_ADDRESS, gasOverrides));
    if (DENY_DEPLOYER) {
      await waitForTx(
        l1DAIBridge.deny(await l1Signer.getAddress(), gasOverrides)
      );
    }

    // This needs to be done in a l2 gov spell:
    // l2DAI.rely(l2DAIBridge.address)
    // l2DAIBridge.close()

    console.log("Finalizing permissions for l2_dai_bridge...");
    await deployer.estimateAndInvoke(l2DAIBridge, "rely", {
      user: asDec(l2GovernanceRelay.address),
    });
    if (DENY_DEPLOYER) {
      await deployer.estimateAndInvoke(l2DAIBridge, "deny", {
        user: asDec(deployer.starknetContract.address),
      });
    }

    console.log("L1 permission sanity checks...");

    const l1Wards = [
      L1_PAUSE_PROXY_ADDRESS,
      L1_ESCROW_MOM_ADDRESS,
      L1_ESM_ADDRESS,
    ];

    expect(await getActiveWards(l1DAIBridge as any)).to.deep.eq(
      DENY_DEPLOYER ? l1Wards : [l1Signer.address, ...l1Wards]
    );

    console.log("L2 bridge permission sanity checks...");
    expect(await wards(l2DAIBridge, l2GovernanceRelay)).to.deep.eq(BigInt(1));
    expect(await wards(l2DAIBridge, deployer.starknetContract)).to.deep.eq(
      BigInt(!DENY_DEPLOYER)
    );

    console.log("Deploying L2 spell...");

    const l2Spell = `%lang starknet

    from starkware.cairo.common.cairo_builtins import HashBuiltin
    from starkware.starknet.common.syscalls import get_caller_address

    @contract_interface
    namespace DAI {
        func rely(user: felt) {
        }
    }

    @contract_interface
    namespace Bridge {
        func close() {
        }
    }

    @external
    func execute{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}() {
        let dai = ${l2DAI.address};
        let new_bridge = ${l2DAIBridge.address};
        let old_bridge = ${oldL2DAIBridgeAddress};

        DAI.rely(dai, new_bridge);
        Bridge.close(old_bridge);

        return ();
    }`;

    fs.writeFileSync("./contracts/l2/l2_bridge_upgrade_spell.cairo", l2Spell);

    await hre.run("starknet-compile", {
      paths: ["contracts/l2/l2_bridge_upgrade_spell.cairo"],
    });

    const spell = await deployL2(hre, "l2_bridge_upgrade_spell", 0, {});

    const addresses = {
      l1DAIBridge: l1DAIBridge.address,
      l2DAIBridge: l2DAIBridge.address,
      spell: spell.address,
    };

    console.log("addresses:", addresses);
  }
);
