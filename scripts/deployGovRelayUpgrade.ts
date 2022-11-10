import { expect } from "chai";
import { utils } from "ethers";
import fs from "fs";
import { task } from "hardhat/config";

import {
  deployL1,
  deployL2,
  getAccount,
  getActiveWards,
  getAddressOfNextDeployedContract,
  getNetwork,
  getOptionalEnv,
  getRequiredEnv,
  waitForTx,
} from "./utils";

task("deploy-gov-relay-upgrade", "Deploy gov relay upgrade").setAction(
  async (_, hre) => {
    const [l1Signer] = await hre.ethers.getSigners();

    const { network, NETWORK } = getNetwork(hre);

    console.log(`Deploying gov relay upgrade on:`, network);

    const deployer = await getAccount("deployer", hre);

    console.log("From");
    console.log(`\tl2 account:`, deployer.starknetContract.address.toString());
    console.log(
      `\tl1 account:`,
      (await hre.ethers.getSigners())[0].address.toString()
    );

    const TOKEN = getOptionalEnv(`${NETWORK}_TOKEN`);

    const deploymentOptions = TOKEN ? { token: TOKEN } : {};

    if (TOKEN) {
      console.log(`Using token:`, TOKEN);
    }

    const L1_STARKNET_ADDRESS = getRequiredEnv(
      `${NETWORK}_L1_STARKNET_ADDRESS`
    );
    const L1_PAUSE_PROXY_ADDRESS = getRequiredEnv(
      `${NETWORK}_L1_PAUSE_PROXY_ADDRESS`
    );
    const L1_ESM_ADDRESS = getRequiredEnv(`${NETWORK}_L1_ESM_ADDRESS`);
    const DENY_DEPLOYER = getRequiredEnv("DENY_DEPLOYER") === "true";

    console.log("Deny deployer:", DENY_DEPLOYER);

    const gasPrice = getOptionalEnv(`${NETWORK}_GAS_PRICE`);
    const gasOverrides = {
      gasLimit: 2000000,
      ...(gasPrice ? { gasPrice: utils.parseUnits(gasPrice, "gwei") } : {}),
    };

    if (gasOverrides.gasPrice) {
      console.log("Gas price:", gasOverrides.gasPrice.toString());
    }

    const L2_DAI_ADDRESS = getRequiredEnv(`${NETWORK}_L2_DAI_ADDRESS`);

    const L2_DAI_BRIDGE_ADDRESS = getRequiredEnv(
      `${NETWORK}_L2_DAI_BRIDGE_ADDRESS`
    );

    const L2_DAI_BRIDGE_LEGACY_ADDRESS = getRequiredEnv(
      `${NETWORK}_L2_DAI_BRIDGE_LEGACY_ADDRESS`
    );

    const L2_DAI_TELEPORT_GATEWAY_ADDRESS = getRequiredEnv(
      `${NETWORK}_L2_DAI_TELEPORT_GATEWAY_ADDRESS`
    );

    const futureL1GovRelayAddress = await getAddressOfNextDeployedContract(
      l1Signer
    );

    const l2GovernanceRelay = await deployL2(
      hre,
      "l2_governance_relay",
      {
        l1_governance_relay: BigInt(futureL1GovRelayAddress).toString(),
      },
      deploymentOptions
    );

    const l1GovernanceRelay = await deployL1(
      hre,
      "L1GovernanceRelay",
      [L1_STARKNET_ADDRESS, l2GovernanceRelay.address],
      gasOverrides
    );
    expect(
      futureL1GovRelayAddress === l1GovernanceRelay.address,
      "futureL1GovRelayAddress != l1GovernanceRelay.address"
    );

    console.log("Finalizing permissions for L1GovernanceRelay...");
    await waitForTx(
      l1GovernanceRelay.rely(L1_PAUSE_PROXY_ADDRESS, gasOverrides)
    );
    await waitForTx(l1GovernanceRelay.rely(L1_ESM_ADDRESS, gasOverrides));

    if (DENY_DEPLOYER) {
      await waitForTx(
        l1GovernanceRelay.deny(await l1Signer.getAddress(), gasOverrides)
      );
    }

    console.log("L1 permission sanity checks...");
    let l1Wards;
    if (DENY_DEPLOYER) {
      l1Wards = [L1_PAUSE_PROXY_ADDRESS, L1_ESM_ADDRESS];
    } else {
      l1Wards = [l1Signer.address, L1_PAUSE_PROXY_ADDRESS, L1_ESM_ADDRESS];
    }

    expect(await getActiveWards(l1GovernanceRelay as any)).to.deep.eq(l1Wards);

    console.log("Creating L2 spell...");

    const l2Spell = `%lang starknet

from starkware.cairo.common.cairo_builtins import HashBuiltin
from starkware.starknet.common.syscalls import get_caller_address

@contract_interface
namespace HasWards {
    func rely(user: felt) {
    }
    func deny(user: felt) {
    }
}

@external
func execute{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}() {
    const dai = ${L2_DAI_ADDRESS};
    const bridge = ${L2_DAI_BRIDGE_ADDRESS};
    const bridge_legacy = ${L2_DAI_BRIDGE_LEGACY_ADDRESS};
    const teleport_gateway = ${L2_DAI_TELEPORT_GATEWAY_ADDRESS};
    const new_gov_relay = ${l2GovernanceRelay.address};

    // rely new_gov_relay on dai, current bridge, teleport_gateway
    HasWards.rely(dai, new_gov_relay);
    HasWards.rely(bridge, new_gov_relay);
    HasWards.rely(bridge_legacy, new_gov_relay);
    HasWards.rely(teleport_gateway, new_gov_relay);
    
    // old gov relay will be denied in the following spell

    return ();
}`;

    const { spellFileName } = spellNames(NETWORK);

    fs.writeFileSync(spellFileName, l2Spell);

    await hre.run("starknet-compile", { paths: [spellFileName] });

    const addresses = {
      l1GovernanceRelay: l1GovernanceRelay.address,
      l2GovernanceRelay: l2GovernanceRelay.address,
    };

    console.log("addresses:", addresses);
  }
);

task(
  "deploy-gov-relay-upgrade-spell",
  "Deploy gov relay upgrade spell"
).setAction(async (_, hre) => {
  const { network, NETWORK } = getNetwork(hre);

  console.log(`Deploying gov relay upgrade spell on: ${network}`);

  const TOKEN = getOptionalEnv(`${NETWORK}_TOKEN`);

  const deploymentOptions = TOKEN ? { token: TOKEN } : {};

  const { spellName, spellFileName } = spellNames(NETWORK);

  await hre.run("starknet-compile", {
    paths: [spellFileName],
  });

  const spell = await deployL2(hre, spellName, 0, deploymentOptions);

  const addresses = {
    spell: spell.address,
  };

  console.log("addresses:", addresses);
});

function spellNames(NETWORK: string) {
  const spellName = `${NETWORK.toLowerCase()}_l2_gov_relay_upgrade_spell`;
  const spellFileName = `./contracts/spells/${spellName}.cairo`;
  return { spellName, spellFileName };
}
