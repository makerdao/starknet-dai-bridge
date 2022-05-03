import { getGoerliSdk } from "@dethcrypto/eth-sdk-client";
import { sleep } from "@eth-optimism/core-utils";
import { JsonRpcProvider } from "@ethersproject/providers";
import { Contract, ethers, Signer } from "ethers";
import { Interface } from "ethers/lib/utils";
import fs from "fs";
import { task } from "hardhat/config";

import {
  deployL1,
  deployL2,
  getAddress,
  getL1ContractAt,
  getRequiredEnv,
  getRequiredEnvDeployments,
} from "./utils";

task("create-wormhole-spell-l2", "Create L2 spell").setAction(async () => {
  const l2DAIWormholeGateway = getRequiredEnvDeployments(
    "GOERLI_L2_DAI_WORMHOLE_GATEWAY_ADDRESS"
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
    let gateway = ${l2DAIWormholeGateway}
    let what = 'valid_domains'
    # ethers.utils.formatBytes32String("GOERLI-MASTER-1") >> 4
    let domain = 0x474f45524c492d4d41535445522d31000000000000000000000000000000000
    # file domain
    IGateway.file(gateway, what, domain, 1)

    return ()
end`;

  fs.writeFileSync(
    "./contracts/deploy/goerli/L2GoerliAddWormholeDomainSpell.cairo",
    spell
  );
});

task("create-wormhole-spell-l1", "Create L1 spell").setAction(async () => {
  const l1DAIWormholeGateway = getRequiredEnvDeployments(
    "GOERLI_L1_DAI_WORMHOLE_GATEWAY_ADDRESS"
  );
  const escrow = getRequiredEnvDeployments("GOERLI_L1_ESCROW_ADDRESS");
  const l1Bridge = getRequiredEnvDeployments("GOERLI_L1_DAI_BRIDGE_ADDRESS");
  const l1GovernanceRelay = getRequiredEnvDeployments(
    "GOERLI_L1_GOVERNANCE_RELAY_ADDRESS"
  );
  const l2Spell = getAddress("L2GoerliAddWormholeDomainSpell", "fork");

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

pragma solidity ^0.7.6;

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

interface WormholeJoinLike {
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

  string public constant override description = "Goerli Starknet Wormhole deployment spell";

  function officeHours() public pure override returns (bool) {
    return false;
  }

  // Here is current bridge deployment
  //    {
  //      'account-deployer': '0x035c782a5447a822a3ae179321dc694c8c36a0deb82524248e1e683dce4c2c59',
  //      dai: '0x03e85bfbb8e2a42b7bead9e88e9a1b19dbccf661471061807292120462396ec9',
  //      registry: '0x0009a22467ad5121347d290c8d439d660076bf8e6f836ad4ca607d7637f8c2a5',
  //      L1Escrow: '0x38c3DDF1eF3e045abDDEb94f4e7a1a0d5440EB44',
  //      l2_dai_bridge: '0x0278f24c3e74cbf7a375ec099df306289beb0605a346277d200b791a7f811a19',
  //      L1DAIBridge: '0xd8beAa22894Cd33F24075459cFba287a10a104E4',
  //      l2_governance_relay: '0x030255465a3d33f430ea6e16cb22cc09b9291972f7f8c7198b5e5b1ef522b85c',
  //      L1GovernanceRelay: '0x73c0049Dd6560E644984Fa3Af30A55a02a7D81fB'
  //    }

  // And basic dss-wormhole deployment
  // deployed with: https://github.com/makerdao/wormhole-integration-tests/pull/42
  // Wormhole:  {
  //  "join": "0x7954DA41E6D18e25Ad6365a146091c9D75E4b568",
  //  "oracleAuth": "0x70FEdb21fF40E8bAf9f1a631fA9c34F179f29442",
  //  "router": "0xac22Eea777cd98A357f2E2f26e7Acd37651DBA9c",
  //  "constantFee": "0xd40EA2981B350D38281402c058b1Ef1058dbac53",
  //  "relay": "0x29e07B88a51281f3C3CDD9F8De94DfCf7Ff24C7B"
  // }

  function actions() public override {
    bytes32 masterDomain = bytes32("GOERLI-MASTER-1");
    WormholeJoinLike wormholeJoin = WormholeJoinLike(0x7954DA41E6D18e25Ad6365a146091c9D75E4b568);
    address vow = 0x23f78612769b9013b3145E43896Fa1578cAa2c2a;
    VatLike vat = VatLike(0xB966002DDAa2Baf48369f5015329750019736031);
    uint256 globalLine = 10000000000 * RAD;
    RouterLike router = RouterLike(0xac22Eea777cd98A357f2E2f26e7Acd37651DBA9c);
    OracleAuthLike oracleAuth = OracleAuthLike(0x70FEdb21fF40E8bAf9f1a631fA9c34F179f29442);
    address[] memory oracles = new address[](6);

    oracles[0] = 0xC4756A9DaE297A046556261Fa3CD922DFC32Db78; // OCU
    oracles[1] = 0x23ce419DcE1De6b3647Ca2484A25F595132DfBd2; // OCU
    oracles[2] = 0x774D5AA0EeE4897a9a6e65Cbed845C13Ffbc6d16; // OCU
    oracles[3] = 0xb41E8d40b7aC4Eb34064E079C8Eca9d7570EBa1d; // OCU
    oracles[4] = 0xc65EF2D17B05ADbd8e4968bCB01b325ab799aBd8; // PECU
    oracles[5] = 0xFc7D8Fc1dA7037A392031b763b8277CC7a789d57; // Starknet Oracle

    wormholeJoin.file(bytes32("vow"), vow);
    router.file(bytes32("gateway"), masterDomain, address(wormholeJoin));
    vat.rely(address(wormholeJoin));
    bytes32 ilk = wormholeJoin.ilk();
    vat.init(ilk);
    vat.file(ilk, bytes32("spot"), RAY);
    vat.file(ilk, bytes32("line"), globalLine);
    oracleAuth.file(bytes32("threshold"), 1);
    oracleAuth.addSigners(oracles);

    // configure starknet wormhole
    bytes32 slaveDomain = bytes32("GOERLI-SLAVE-STARKNET-1") >> 4;
    address constantFees = 0xd40EA2981B350D38281402c058b1Ef1058dbac53;
    address dai = 0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844;

    address slaveDomainGateway = ${l1DAIWormholeGateway};
    L1EscrowLike escrow = L1EscrowLike(${escrow});
    L1BridgeLike l1Bridge = L1BridgeLike(${l1Bridge});
    GovernanceRelayLike l1GovRelay = GovernanceRelayLike(${l1GovernanceRelay});
    uint256 l2ConfigureDomainSpell = ${l2Spell};

    router.file(bytes32("gateway"), slaveDomain, slaveDomainGateway);
    wormholeJoin.file(bytes32("fees"), slaveDomain, constantFees);
    wormholeJoin.file(bytes32("line"), slaveDomain, 100*RAD);
    escrow.approve(dai, slaveDomainGateway, type(uint256).max);
    l1Bridge.setCeiling(100000*WAD);
    l1GovRelay.relay(l2ConfigureDomainSpell);
  }
}

contract L1GoerliAddWormholeDomainSpell is DssExec {
  constructor() DssExec(block.timestamp + 30 days, address(new DssSpellAction())) {}
}`;
  fs.writeFileSync(
    "./contracts/deploy/goerli/L1GoerliAddWormholeDomainSpell.sol",
    spell
  );
});

task("deploy-wormhole-spell-l2", "Deploy L2 spell").setAction(
  async (_, hre) => {
    const spell = await deployL2(hre, "L2GoerliAddWormholeDomainSpell", 0, {});
    console.log(`Spell deployed at ${spell.address}`);
  }
);

task("deploy-wormhole-spell-l1", "Deploy L1 spell").setAction(
  async (_, hre) => {
    const [l1Signer] = await hre.ethers.getSigners();

    // @ts-ignore
    const BLOCK_NUMBER = await l1Signer.provider.getBlockNumber();

    const spell = await deployL1(
      hre,
      "L1GoerliAddWormholeDomainSpell",
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
  provider: ethers.providers.JsonRpcProvider,
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
  provider: ethers.providers.JsonRpcProvider
): Promise<ethers.Signer> {
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
  mkrWhaleAddress: string
) {
  // execute spell using standard DssSpell procedure
  const mkrWhale = await impersonateAccount(
    mkrWhaleAddress,
    l1Signer.provider as JsonRpcProvider
  );
  const pause = new Contract(
    pauseAddress,
    new Interface(["function authority() view returns (address)"]),
    l1Signer
  );
  const chief = new Contract(
    await pause.authority(),
    new Interface([
      "function vote(address[])",
      "function lift(address)",
      "function approvals(address) view returns (uint256)",
      "function hat() view returns (address)",
      "function lock(uint)",
    ]),
    mkrWhale
  );
  await waitForTx(chief.lock(encodeHex(toWad(100001))));
  console.log("Vote spell...");
  await waitForTx(chief.vote([spell.address]));
  console.log("Lift spell...");
  await waitForTx(chief.lift(spell.address));
  console.log("Scheduling spell...");
  await waitForTx(spell.connect(l1Signer).schedule());
  console.log("Waiting for pause delay...");
  await sleep(60000);
  console.log("Casting spell...");
  return await waitForTx(spell.connect(l1Signer).cast());
}

const toBytes32 = (bn: ethers.BigNumber) => {
  return ethers.utils.hexlify(ethers.utils.zeroPad(bn.toHexString(), 32));
};

task("run-spell", "Deploy L1 spell").setAction(async (_, hre) => {
  const NETWORK = hre.network.name;
  let ADDRESS_NETWORK;
  if (NETWORK === "fork") {
    ADDRESS_NETWORK = getRequiredEnv("FORK_NETWORK").toUpperCase();
  } else {
    ADDRESS_NETWORK = NETWORK.toUpperCase();
  }

  const [signer] = await hre.ethers.getSigners();
  const mkrWhaleAddress = "0x33Ed584fc655b08b2bca45E1C5b5f07c98053bC1";

  const goerliSdk = getGoerliSdk(signer.provider! as any);

  const l1SpellContract = await getL1ContractAt(
    hre,
    "L1GoerliAddWormholeDomainSpell",
    getAddress("L1GoerliAddWormholeDomainSpell", NETWORK)
  );
  const balanceWei = hre.ethers.utils.parseEther("200000");
  const L1_DAI_ADDRESS = getRequiredEnv(`${ADDRESS_NETWORK}_L1_DAI_ADDRESS`);
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

  await executeDssSpell(
    signer,
    await goerliSdk.maker.pause_proxy.owner(),
    l1SpellContract,
    mkrWhaleAddress
  );
});
