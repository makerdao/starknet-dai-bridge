// amarna: disable=arithmetic-add,arithmetic-sub,arithmetic-mul,must-check-caller-address
//
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2021 Dai Foundation
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

// %lang starknet

// from starkware.cairo.common.alloc import alloc
// from starkware.starknet.common.messages import send_message_to_l1
// from starkware.cairo.common.cairo_builtins import HashBuiltin
// from starkware.cairo.common.math import assert_lt, assert_not_zero
// from starkware.starknet.common.syscalls import get_caller_address, get_block_timestamp
// from starkware.cairo.common.uint256 import Uint256, uint256_add, uint256_check

// const FINALIZE_REGISTER_TELEPORT = 0;
// const FINALIZE_FLUSH = 1;
// const MAX_NONCE = 2 ** 80 - 1;

// @contract_interface
// namespace Burnable {
//     func burn(usr: felt, wad: Uint256) {
//     }
// }

// use serde::Serde;
// use traits::Into;
// use zeroable::Zeroable;
// use starknet::ContractAddress;
// use starknet::StorageAccess;
// use starknet::StorageAddress;
// use starknet::StorageBaseAddress;
// use starknet::SyscallResult;
// use starknet::EthAddress;

// #[abi]
// trait IBurnable {
//     fn burn(from_address: ContractAddress, value: u256);
// }

// impl EthAddressStorageAccess of StorageAccess::<EthAddress> {
//     fn read(address_domain: u32, base: StorageBaseAddress) -> SyscallResult<EthAddress> {
//         Result::Ok(
//             EthAddress { address: StorageAccess::<felt252>::read(address_domain, base)?}
//         )
//     }
//     fn write(address_domain: u32, base: StorageBaseAddress, value: EthAddress) -> SyscallResult<()> {
//         StorageAccess::<felt252>::write(address_domain, base, value.into())
//     }
// }

// #[contract]
// mod L2DAITeleportGateway {

//     struct TeleportData {
//         target_domain: u256,
//         receiver: EthAddress,
//         operator: EthAddress,
//         amount: u256, //TODO: it should not be 256
//         timestamp: felt, //TODO: check type
//     }

//     struct Storage {
//         _nonce: felt,
//         _is_open: bool,
//         _dai: IBurnableDispatcher,
//         _teleport_gateway: EthAddress,
//         _domain: u256,
//         _valid_domains: LegacyMap<u256, bool>,
//         _batched_dai_to_flush: LegacyMap<u256, u256>,
//         _wards: LegacyMap<ContractAddress, bool>,
//         _teleports: LegacyMap<felt, TeleportData>,
//     }


//     #[event]
//     fn Closed() {}

//     #[event]
//     fn Rely(user: ContractAddress) {}

//     #[event]
//     fn Deny(user: ContractAddress) {}

//     #[event]
//     fn File(what: felt, domain: u256, data: felt) {}

//     #[event]
//     fn TeleportInitialized(
//         source_domain: u256,
//         target_domain: u256,
//         receiver: EthAddress,
//         operator: EthAddress,
//         amount: u128,
//         nonce: u128,  //TODO check type
//         timestamp: u64,
//     ) {}

//     #[event]
//     fn TeleportRegisterFinalized(
//         source_domain: u256,
//         target_domain: u256,
//         receiver: EthAddress,
//         operator: EthAddress,
//         amount: u128,
//         nonce: u128,
//         timestamp: u64,
//     ) {}

//     #[event]
//     fn Flushed(target_domain: u256, dai: u256) {}

//     #[view]
//     fn nonce() -> u128 {
//         _nonce::read()
//     }

//     #[view]
//     fn is_open() -> bool {
//         _is_open::read()
//     }

//     #[view]
//     fn dai() -> ContractAddress {
//         _dai::read().into()
//     }

//     #[view]
//     fn teleport_gateway() -> EthAddress {
//         _teleport_gateway::read()
//     }

//     #[view]
//     fn domain() -> u256 {
//         _domain::read()
//     }

//     #[view]
//     fn valid_domains(domain: u256) -> bool {
//         _valid_domains::read(domain)
//     }

//     #[view]
//     fn batched_dai_to_flush(domain: u256) -> u256 {
//         _batched_dai_to_flush::read(domain)
//     }

//     #[view]
//     fn wards(user: ContractAddress) -> bool {
//         _wards::read(user)
//     }

//     #[view]
//     fn teleports(nonce: u128) -> TeleportData {
//         _teleports::read(nonce)
//     }

//     #[external]
//     fn rely(user: ContractAddress) {
//         auth();
//         _wards::write(user, true);
//         Rely(user);
//     }

//     #[external]
//     fn deny(user: ContractAddress) {
//         auth();
//         _wards::write(user, false);
//         Deny(user);
//     }


//     fn auth() {
//         assert(_wards::read(get_caller_address()), 'l2_dai_teleport_gateway/not-authorized');
//     }

//     fn read_and_update_nonce() -> felt {
//         let nonce = _nonce::read();
//         assert(nonce < MAX_NONCE, 'l2_dai_teleport_gateway/nonce-overflow');
//         _nonce::write(nonce + 1);
//         nonce
//     }

//     fn close() {
//         auth();
//         _is_open::write(false);
//         Closed();
//     }

//     #[constructor]
//     fn constructor(
//         ward: ContractAddress,
//         dai: ContractAddress,
//         teleport_gateway: EthAddress,
//         domain: u256,
//     ) {
//         _wards::write(ward, true);
//         Rely(ward);

//         _is_open::write(true);
//         _dai::write(dai);
//         _teleport_gateway::write(teleport_gateway);
//         _domain::write(domain);
//     }

//     #[external]
//     fn file(what: felt, domain: u256, data: bool) {
//         auth();
//         assert(what == 'valid_domains', 'l2_dai_teleport_gateway/file-unrecognized-param');
//         _valid_domains::write(domain, data);
//         File(what, domain, data);
//     }


//     #[external]
//     fn initiate_teleport(
//         target_domain: u256,
//         receiver: EthAddress,
//         amount: u256,
//         operator: EthAddress,
//     ) {
//         assert(_is_open::read(), 'l2_dai_teleport_gateway/gateway-closed');
//         assert(_valid_domains::read(target_domain), 'l2_dai_teleport_gateway/invalid-domain');
//         assert(amount.is_non_zero(), 'l2_dai_teleport_gateway/invalid-amount');

//         let dai_to_flush = _batched_dai_to_flush::read(target_domain);
//         _batched_dai_to_flush::write(target_domain, dai_to_flush + amount);

//         _dai::read().burn(get_caller_address(), amount);

//         let domain = _domain::read();
//         let nonce = read_and_update_nonce();
//         let timestamp = get_block_timestamp();

//         TeleportInitialized(
//             domain,
//             target_domain,
//             receiver,
//             operator,
//             amount,
//             nonce,
//             timestamp,
//         );

//         _teleports::write(nonce, TeleportData {
//             target_domain,
//             receiver,
//             operator,
//             amount,
//             timestamp,
//         });
//     }

// // @external
// // func initiate_teleport{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
// //     target_domain: felt, receiver: felt, amount: felt, operator: felt
// // ) {
// //     with_attr error_message("l2_dai_teleport_gateway/gateway-closed") {
// //         let (is_open) = _is_open.read();
// //         assert is_open = 1;
// //     }

// //     // valid domain check
// //     with_attr error_message("l2_dai_teleport_gateway/invalid-domain") {
// //         let (valid_domain) = _valid_domains.read(target_domain);
// //         assert valid_domain = 1;
// //     }

// //     // amount should be uint128
// //     let amount_uint256 = Uint256(low=amount, high=0);
// //     with_attr error_message("l2_dai_teleport_gateway/invalid-amount") {
// //         uint256_check(amount_uint256);
// //     }

// //     let (dai_to_flush) = _batched_dai_to_flush.read(target_domain);
// //     let (new_dai_to_flush) = uint256_add_safe(dai_to_flush, amount_uint256);
// //     _batched_dai_to_flush.write(target_domain, new_dai_to_flush);

// //     let (dai) = _dai.read();
// //     let (caller) = get_caller_address();
// //     Burnable.burn(dai, caller, amount_uint256);

// //     let (domain) = _domain.read();
// //     let (nonce) = read_and_update_nonce();
// //     let (timestamp) = get_block_timestamp();

// //     TeleportInitialized.emit(
// //         source_domain=domain,
// //         target_domain=target_domain,
// //         receiver=receiver,
// //         operator=operator,
// //         amount=amount,
// //         nonce=nonce,
// //         timestamp=timestamp,
// //     );

// //     _teleports.write(nonce, TeleportData(target_domain, receiver, operator, amount, timestamp));

// //     return ();
// // }


// #[external]
// fn finalize_register_teleport(
//     target_domain: u256,
//     receiver: EthAddress,
//     amount: u256,
//     operator: EthAddress,
//     nonce: u256,
//     timestamp: u256,
// ) {
//     let (domain) = _domain.read();

//     let mut payload: Array<felt252> = ArrayTrait::new();
//     payload.append(FINALIZE_REGISTER_TELEPORT);
//     payload.append(domain.low.into());
//     payload.append(domain.high.into());
//     payload.append(target_domain.low.into());
//     payload.append(target_domain.high.into());
//     payload.append(receiver.into());
//     payload.append(operator.into());
//     payload.append(amount.into()); // TODO: verify amount type
//     payload.append(nonce.into());
//     payload.append(timestamp);

//     send_message_to_l1_syscall(_bridge::read().into(), payload.span());

//     let teleport = _teleports.read(nonce);

//     assert(target_domain == teleport.target_domain, 'l2_dai_teleport_gateway/teleport-does-not-exist');
//     assert(receiver == teleport.receiver, 'l2_dai_teleport_gateway/teleport-does-not-exist');
//     assert(operator == teleport.operator, 'l2_dai_teleport_gateway/teleport-does-not-exist');
//     assert(amount == teleport.amount, 'l2_dai_teleport_gateway/teleport-does-not-exist');
//     assert(timestamp == teleport.timestamp, 'l2_dai_teleport_gateway/teleport-does-not-exist');

//     TeleportRegisterFinalized(
//         domain,
//         target_domain,
//         receiver,
//         operator,
//         amount,
//         nonce,
//         timestamp,
//     );

//     send_message_to_l1(_teleport_gateway.read().into, payload.span());
// }

// #[external]
// fn flush(target_domain: u256) {
//     let (dai_to_flush) = _batched_dai_to_flush.read(target_domain);
//     assert(dai_to_flush.is_non_zero(), 'l2_dai_teleport_gateway/nothing-to-flush');

//     _batched_dai_to_flush.write(target_domain, Zeroable::zero());

//     let mut payload: Array<felt252> = ArrayTrait::new();
//     payload.append(FINALIZE_FLUSH);
//     payload.append(target_domain.low.into());
//     payload.append(target_domain.high.into());
//     payload.append(dai_to_flush.low.into());
//     payload.append(dai_to_flush.high.into());

//     send_message_to_l1(_teleport_gateway.read().into, payload.span());

//     Flushed(target_domain, dai_to_flush);
// }
// }