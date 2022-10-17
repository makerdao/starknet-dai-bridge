// amarna: disable=arithmetic-sub,unused-arguments,must-check-caller-address
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

%lang starknet

from starkware.cairo.common.alloc import alloc
from starkware.starknet.common.messages import send_message_to_l1
from starkware.cairo.common.cairo_builtins import HashBuiltin
from starkware.cairo.common.math import assert_le_felt
from starkware.starknet.common.syscalls import get_caller_address, get_contract_address
from starkware.cairo.common.uint256 import Uint256, uint256_le

const FINALIZE_WITHDRAW = 0;
const MAX_L1_ADDRESS = 2 ** 160 - 1;

@contract_interface
namespace IDAI {
    func mint(to_address: felt, value: Uint256) {
    }

    func burn(from_address: felt, value: Uint256) {
    }

    func allowance(owner: felt, spender: felt) -> (res: Uint256) {
    }

    func balanceOf(user: felt) -> (res: Uint256) {
    }
}

@contract_interface
namespace IRegistry {
    func get_L1_address(l2_address: felt) -> (res: felt) {
    }
}

@event
func Rely(user: felt) {
}

@event
func Deny(user: felt) {
}

@event
func Closed() {
}

@event
func withdraw_initiated(l1_recipient: felt, amount: Uint256, caller: felt) {
}

@event
func deposit_handled(account: felt, amount: Uint256) {
}

@event
func force_withdrawal_handled(l1_recipient: felt, amount: Uint256, sender: felt) {
}

@storage_var
func _is_open() -> (res: felt) {
}

@storage_var
func _dai() -> (res: felt) {
}

@storage_var
func _registry() -> (res: felt) {
}

@storage_var
func _bridge() -> (res: felt) {
}

@storage_var
func _wards(user: felt) -> (res: felt) {
}

@view
func is_open{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}() -> (res: felt) {
    let (res) = _is_open.read();
    return (res,);
}

@view
func dai{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}() -> (res: felt) {
    let (res) = _dai.read();
    return (res,);
}

@view
func registry{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}() -> (res: felt) {
    let (res) = _registry.read();
    return (res,);
}

@view
func bridge{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}() -> (res: felt) {
    let (res) = _bridge.read();
    return (res,);
}

@view
func wards{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(user: felt) -> (
    res: felt
) {
    let (res) = _wards.read(user);
    return (res,);
}

func auth{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}() {
    let (caller) = get_caller_address();
    let (ward) = _wards.read(caller);
    with_attr error_message("l2_dai_bridge/not-authorized") {
        assert ward = 1;
    }
    return ();
}

@external
func rely{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(user: felt) {
    auth();
    _wards.write(user, 1);
    Rely.emit(user);
    return ();
}

@external
func deny{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(user: felt) {
    auth();
    _wards.write(user, 0);
    Deny.emit(user);
    return ();
}

@external
func close{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}() {
    auth();
    _is_open.write(0);
    Closed.emit();
    return ();
}

@constructor
func constructor{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    ward: felt, dai: felt, bridge: felt, registry: felt
) {
    _wards.write(ward, 1);
    Rely.emit(ward);
    _is_open.write(1);
    _dai.write(dai);
    _bridge.write(bridge);
    _registry.write(registry);

    return ();
}

@external
func initiate_withdraw{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    l1_recipient: felt, amount: Uint256
) {
    alloc_locals;

    let (is_open) = _is_open.read();
    with_attr error_message("l2_dai_bridge/bridge-closed") {
        assert is_open = 1;
    }

    let (dai) = _dai.read();
    let (local caller) = get_caller_address();

    IDAI.burn(dai, caller, amount);

    send_handle_withdraw(l1_recipient, amount);

    withdraw_initiated.emit(l1_recipient, amount, caller);

    return ();
}

@l1_handler
func handle_deposit{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    from_address: felt,
    l2_recipient: felt,
    amount_low: felt,
    amount_high: felt,
    sender_address: felt,
) {
    // l1 msg.sender is ignored
    // check l1 message sender
    let (bridge) = _bridge.read();
    with_attr error_message("l2_dai_bridge/message-not-from-bridge") {
        assert from_address = bridge;
    }

    let amount = Uint256(low=amount_low, high=amount_high);
    let (dai) = _dai.read();
    IDAI.mint(dai, l2_recipient, amount);

    deposit_handled.emit(l2_recipient, amount);

    return ();
}

@l1_handler
func handle_force_withdrawal{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    from_address: felt, l2_sender: felt, l1_recipient: felt, amount_low: felt, amount_high: felt
) {
    alloc_locals;

    let amount = Uint256(low=amount_low, high=amount_high);
    force_withdrawal_handled.emit(l1_recipient, amount, l2_sender);

    // check l1 message sender
    let (bridge) = _bridge.read();
    with_attr error_message("l2_dai_bridge/message-not-from-bridge") {
        assert from_address = bridge;
    }

    // check l1 recipient address
    let (registry) = _registry.read();
    let (_l1_recipient) = IRegistry.get_L1_address(registry, l2_sender);
    if (_l1_recipient != l1_recipient) {
        return ();
    }

    let (local dai) = _dai.read();

    // check l2 DAI balance
    let (balance) = IDAI.balanceOf(dai, l2_sender);
    let (balance_check) = uint256_le(amount, balance);
    if (balance_check == 0) {
        return ();
    }

    // check allowance
    let (contract_address) = get_contract_address();
    let (allowance) = IDAI.allowance(dai, l2_sender, contract_address);
    let (allowance_check) = uint256_le(amount, allowance);
    if (allowance_check == 0) {
        return ();
    }

    IDAI.burn(dai, l2_sender, amount);
    send_handle_withdraw(l1_recipient, amount);

    return ();
}

func send_handle_withdraw{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    l1_recipient: felt, amount: Uint256
) {
    // check valid L1 address
    assert_l1_address(l1_recipient);

    let (payload) = alloc();
    assert payload[0] = FINALIZE_WITHDRAW;
    assert payload[1] = l1_recipient;
    assert payload[2] = amount.low;
    assert payload[3] = amount.high;

    let (bridge) = _bridge.read();

    send_message_to_l1(bridge, 4, payload);
    return ();
}

func assert_l1_address{range_check_ptr}(l1_address: felt) {
    with_attr error_message("l2_dai_bridge/invalid-l1-address") {
        assert_le_felt(l1_address, MAX_L1_ADDRESS);
    }
    return ();
}
