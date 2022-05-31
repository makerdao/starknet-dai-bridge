import { getGoerliSdk } from "@dethcrypto/eth-sdk-client";
import { sleep } from "@eth-optimism/core-utils";
import { JsonRpcProvider } from "@ethersproject/providers";
import { Contract, ethers, Signer } from "ethers";
import { Interface } from "ethers/lib/utils";
import fs from "fs";
import { task } from "hardhat/config";

import { getNetwork } from "./utils";
import {
  deployL1,
  deployL2,
  getAddress,
  getL1ContractAt,
  getRequiredEnv,
  getRequiredEnvDeployments,
} from "./utils";

task("create-teleport-spell-l2", "Create L2 spell").setAction(async () => {
  const l2DAITeleportGateway = getRequiredEnvDeployments(
    `ALPHA_GOERLI_L2_DAI_TELEPORT_GATEWAY_ADDRESS`
  );

  const spell = `
%lang starknet

from starkware.cairo.common.cairo_builtins import HashBuiltin
from starkware.cairo.common.uint256 import Uint256

@contract_interface
namespace IGateway:
  func file(what : felt, domain : felt, data : felt):
  end
end

@external
func execute{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }():
    let gateway = ${l2DAITeleportGateway}
    let what = 'valid_domains'
    let domain = 'GOERLI-MASTER-1'
    # file domain
    IGateway.file(gateway, what, domain, 1)

    return ()
end`;

  fs.writeFileSync(
    "./contracts/deploy/goerli/L2GoerliAddTeleportDomainSpell.cairo",
    spell
  );
});

const officialMCD = `
  TeleportJoinLike teleportJoin = TeleportJoinLike(0x7954DA41E6D18e25Ad6365a146091c9D75E4b568);
  address vow = 0x23f78612769b9013b3145E43896Fa1578cAa2c2a;
  VatLike vat = VatLike(0xB966002DDAa2Baf48369f5015329750019736031);
  RouterLike router = RouterLike(0xac22Eea777cd98A357f2E2f26e7Acd37651DBA9c);
  OracleAuthLike oracleAuth = OracleAuthLike(0x70FEdb21fF40E8bAf9f1a631fA9c34F179f29442);
  address dai = 0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844;
`;
const customMCD = `
  TeleportJoinLike teleportJoin = TeleportJoinLike(0x3e55b205760829Ff478191FfEAA3C542F982C096);
  address vow = 0xDAb7bC19b593A7C694AE7484Cd4cB346e372e68C;
  VatLike vat = VatLike(0x2D833c7bC94409F02aF5bC9C4a5FA28359795CC5);
  RouterLike router = RouterLike(0x4213aE220314Ed4d972088e13D8F7D361760385e);
  OracleAuthLike oracleAuth = OracleAuthLike(0x455f17Bdd98c19e3417129e7a821605661623aD7);
  address dai = 0xd7F24C609825a4348dEc3C856Aa8796696355Fcd;
`;

task("create-teleport-spell-l1", "Create L1 spell").setAction(async () => {
  const l1DAITeleportGateway = getRequiredEnvDeployments(
    "ALPHA_GOERLI_L1_DAI_TELEPORT_GATEWAY_ADDRESS"
  );
  const escrow = getRequiredEnvDeployments("ALPHA_GOERLI_L1_ESCROW_ADDRESS");
  const l1Bridge = getRequiredEnvDeployments(
    "ALPHA_GOERLI_L1_DAI_BRIDGE_ADDRESS"
  );
  const l1GovernanceRelay = getRequiredEnvDeployments(
    "ALPHA_GOERLI_L1_GOVERNANCE_RELAY_ADDRESS"
  );
  const l2Spell = getAddress("L2GoerliAddTeleportDomainSpell", "alpha-goerli");

  // temporary
  const MCD_DEPLOYMENT =
    getRequiredEnv("OFFICIAL_MCD") === "true" ? officialMCD : customMCD;
  console.log(getRequiredEnv("OFFICIAL_MCD"));

  const spell = `
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2021 Dai Foundation
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

pragma solidity 0.8.13;

import {DssExec} from "../common/DssExec.sol";
import {DssAction} from "../common/DssAction.sol";

interface VatLike {
  function rely(address usr) external;

  function init(bytes32 ilk) external;

  function file(
    bytes32 ilk,
    bytes32 what,
    uint256 data
  ) external;
}

interface TeleportJoinLike {
  function file(bytes32 what, address val) external;

  function file(
    bytes32 what,
    bytes32 domain_,
    address data
  ) external;

  function file(
    bytes32 what,
    bytes32 domain_,
    uint256 data
  ) external;

  function ilk() external returns (bytes32);
}

interface OracleAuthLike {
  function file(bytes32 what, uint256 data) external;

  function addSigners(address[] calldata signers_) external;
}

interface RouterLike {
  function file(
    bytes32 what,
    bytes32 domain,
    address data
  ) external;
}

interface L1EscrowLike {
  function approve(
    address token,
    address spender,
    uint256 value
  ) external;
}

interface L1BridgeLike {
  function setCeiling(
    uint256 _maxDeposit
  ) external;
}

interface GovernanceRelayLike {
  function relay(uint256 spell) external;
}

contract DssSpellAction is DssAction {
  uint256 public constant WAD = 10**18;
  uint256 public constant RAY = 10**27;
  uint256 public constant RAD = 10**45;

  string public constant override description = "Goerli Starknet Teleport deployment spell";

  function officeHours() public pure override returns (bool) {
    return false;
  }

  function actions() public override {
    bytes32 masterDomain = bytes32("GOERLI-MASTER-1");
    uint256 globalLine = 10000000000 * RAD;
    ${MCD_DEPLOYMENT}
    address[] memory oracles = new address[](6);

    oracles[0] = 0xC4756A9DaE297A046556261Fa3CD922DFC32Db78; // OCU
    oracles[1] = 0x23ce419DcE1De6b3647Ca2484A25F595132DfBd2; // OCU
    oracles[2] = 0x774D5AA0EeE4897a9a6e65Cbed845C13Ffbc6d16; // OCU
    oracles[3] = 0xb41E8d40b7aC4Eb34064E079C8Eca9d7570EBa1d; // OCU
    oracles[4] = 0xc65EF2D17B05ADbd8e4968bCB01b325ab799aBd8; // PECU
    oracles[5] = 0xFc7D8Fc1dA7037A392031b763b8277CC7a789d57; // Starknet Oracle

    teleportJoin.file(bytes32("vow"), vow);
    router.file(bytes32("gateway"), masterDomain, address(teleportJoin));
    vat.rely(address(teleportJoin));
    bytes32 ilk = teleportJoin.ilk();
    vat.init(ilk);
    vat.file(ilk, bytes32("spot"), RAY);
    vat.file(ilk, bytes32("line"), globalLine);
    oracleAuth.file(bytes32("threshold"), 1);
    oracleAuth.addSigners(oracles);

    // configure starknet teleport
    bytes32 slaveDomain = bytes32("ALPHA_GOERLI-SLAVE-STARKNET-1");
    address constantFees = 0xd40EA2981B350D38281402c058b1Ef1058dbac53;

    address slaveDomainGateway = ${l1DAITeleportGateway};
    L1EscrowLike escrow = L1EscrowLike(${escrow});
    L1BridgeLike l1Bridge = L1BridgeLike(${l1Bridge});
    GovernanceRelayLike l1GovRelay = GovernanceRelayLike(${l1GovernanceRelay});
    uint256 l2ConfigureDomainSpell = ${l2Spell};

    router.file(bytes32("gateway"), slaveDomain, slaveDomainGateway);
    teleportJoin.file(bytes32("fees"), slaveDomain, constantFees);
    teleportJoin.file(bytes32("line"), slaveDomain, 100*RAD);
    escrow.approve(dai, slaveDomainGateway, type(uint256).max);
    l1Bridge.setCeiling(100000*WAD);
    l1GovRelay.relay(l2ConfigureDomainSpell);
  }
}

contract L1GoerliAddTeleportDomainSpell is DssExec {
  constructor() DssExec(block.timestamp + 30 days, address(new DssSpellAction())) {}
}`;
  fs.writeFileSync(
    "./contracts/deploy/goerli/L1GoerliAddTeleportDomainSpell.sol",
    spell
  );
});

task("deploy-teleport-spell-l2", "Deploy L2 spell").setAction(
  async (_, hre) => {
    const spell = await deployL2(hre, "L2GoerliAddTeleportDomainSpell", 0, {});
    console.log(`Spell deployed at ${spell.address}`);
  }
);

task("deploy-teleport-spell-l1", "Deploy L1 spell").setAction(
  async (_, hre) => {
    const [l1Signer] = await hre.ethers.getSigners();

    // @ts-ignore
    const BLOCK_NUMBER = await l1Signer.provider.getBlockNumber();

    const spell = await deployL1(
      hre,
      "L1GoerliAddTeleportDomainSpell",
      BLOCK_NUMBER,
      []
    );
    console.log(`Spell deployed at ${spell.address}`);
  }
);

import { BigNumber } from "bignumber.js";

function toMyBigNumber(n: any) {
  return new BigNumber(n.toString());
}

function encodeHex(_: any) {
  return "0x" + toMyBigNumber(_).toString(16);
}

export async function mintEther(
  address: string,
  provider: JsonRpcProvider,
  amt = toWad(1000000)
): Promise<void> {
  await provider.send("hardhat_setBalance", [address, encodeHex(amt)]);
}

export function toWad(n: any): BigNumber {
  return toMyBigNumber(n).multipliedBy(WAD);
}

const WAD = new BigNumber(10).pow(18);

export async function impersonateAccount(
  address: string,
  provider: JsonRpcProvider
): Promise<Signer> {
  await provider.send("hardhat_impersonateAccount", [address]);

  await mintEther(address, provider);

  const signer = provider.getSigner(address);

  return signer;
}

async function waitForTx(tx: Promise<any>) {
  const _ = await tx;
  return await _.wait();
}

async function executeDssSpell(
  l1Signer: Signer,
  pauseAddress: string,
  spell: Contract,
  mkrWhaleAddress: string,
  network: string
) {
  // execute spell using standard DssSpell procedure
  let mkrWhale;
  if (network === "fork") {
    mkrWhale = await impersonateAccount(
      mkrWhaleAddress,
      l1Signer.provider as JsonRpcProvider
    );
  } else {
    const CHIEF_PRIVATE_KEY = getRequiredEnv("CHIEF_PRIVATE_KEY");
    mkrWhale = new ethers.Wallet(CHIEF_PRIVATE_KEY).connect(
      l1Signer.provider as JsonRpcProvider
    );
  }
  const chief = new Contract(
    mkrWhaleAddress,
    new Interface([
      "function vote(address[])",
      "function lift(address)",
      "function approvals(address) view returns (uint256)",
      "function lock(uint)",
    ]),
    mkrWhale
  );
  await waitForTx(chief.lock(encodeHex(toWad("1000"))));
  console.log("Vote spell...");
  await waitForTx(chief.vote([spell.address]));
  console.log("Lift spell...");
  await waitForTx(chief.lift(spell.address));
  console.log("Scheduling spell...");
  await waitForTx(spell.connect(mkrWhale).schedule());
  console.log("Waiting for pause delay...");
  await sleep(60000);
  console.log("Casting spell...");
  return await waitForTx(spell.connect(mkrWhale).cast());
}

const toBytes32 = (bn: ethers.BigNumber) => {
  return ethers.utils.hexlify(ethers.utils.zeroPad(bn.toHexString(), 32));
};

task("run-spell", "Deploy L1 spell").setAction(async (_, hre) => {
  const { network, NETWORK } = getNetwork(hre);
  if (hre.network.name === "fork") {
    const mkrWhaleAddress = "0x33Ed584fc655b08b2bca45E1C5b5f07c98053bC1";
    const [signer] = await hre.ethers.getSigners();
    const L1_DAI_ADDRESS = getRequiredEnv(`${NETWORK}_L1_DAI_ADDRESS`);
    const balanceWei = hre.ethers.utils.parseEther("200000");
    await hre.network.provider.request({
      method: "hardhat_setStorageAt",
      params: [
        L1_DAI_ADDRESS,
        hre.ethers.utils
          .solidityKeccak256(["uint256", "uint256"], [mkrWhaleAddress, 2])
          .replace(/(?<=0x)0+/, ""),
        toBytes32(balanceWei).toString(),
      ],
    });

    const goerliSdk = getGoerliSdk(signer.provider! as any);

    const l1SpellContract = await getL1ContractAt(
      hre,
      "L1GoerliAddTeleportDomainSpell",
      getAddress("L1GoerliAddTeleportDomainSpell", network)
    );

    await executeDssSpell(
      signer,
      await goerliSdk.maker.pause_proxy.owner(),
      l1SpellContract,
      mkrWhaleAddress,
      network
    );
  } else {
    const [_signer] = await hre.ethers.getSigners();
    const mkrWhaleAddress = "0xE305a1ab188416DB9c712dcBd66bd7F611Ad36C7";

    const CHIEF_PRIVATE_KEY = getRequiredEnv("CHIEF_PRIVATE_KEY");
    const signer = new ethers.Wallet(CHIEF_PRIVATE_KEY).connect(
      _signer.provider as JsonRpcProvider
    );

    const goerliSdk = getGoerliSdk(signer.provider! as any);

    const l1SpellContract = await getL1ContractAt(
      hre,
      "L1GoerliAddTeleportDomainSpell",
      getAddress("L1GoerliAddTeleportDomainSpell", network)
    );

    await executeDssSpell(
      signer,
      await goerliSdk.maker.pause_proxy.owner(),
      l1SpellContract,
      mkrWhaleAddress,
      network
    );
  }
});
