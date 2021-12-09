# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2021 Dai Foundation
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

%lang starknet
%builtins pedersen range_check bitwise

from starkware.cairo.common.alloc import alloc
from starkware.starknet.common.messages import send_message_to_l1
from starkware.cairo.common.cairo_builtins import (HashBuiltin, BitwiseBuiltin)
from starkware.cairo.common.math import (assert_le_felt)
from starkware.starknet.common.syscalls import (get_caller_address, get_contract_address)
from starkware.cairo.common.uint256 import (Uint256, uint256_le)

const FINALIZE_WITHDRAW = 0
const MAX_L1_ADDRESS = 2**160 - 1

@contract_interface
namespace IDAI:
    func mint(to_address : felt, value : Uint256):
    end

    func burn(from_address : felt, value : Uint256):
    end

    func allowance(owner : felt, spender : felt) -> (res : Uint256):
    end

    func balanceOf(user : felt) -> (res : Uint256):
    end
end

@contract_interface
namespace IRegistry:
    func get_L1_address(l2_address : felt) -> (res : felt):
    end
end

@storage_var
func _is_open() -> (res : felt):
end

@storage_var
func _dai() -> (res : felt):
end

@storage_var
func _registry() -> (res : felt):
end

@storage_var
func _bridge() -> (res : felt):
end

@storage_var
func _wards(user : felt) -> (res : felt):
end

@view
func is_open{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }() -> (res : felt):
    let (res : felt) = _is_open.read()
    return (res)
end

@view
func dai{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }() -> (res : felt):
    let (res : felt) = _dai.read()
    return (res)
end

@view
func registry{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }() -> (res : felt):
    let (res : felt) = _registry.read()
    return (res)
end

@view
func bridge{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }() -> (res : felt):
    let (res : felt) = _bridge.read()
    return (res)
end

@view
func wards{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(user : felt) -> (res : felt):
    let (res : felt) = _wards.read(user)
    return (res)
end

func auth{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }():
    let (caller) = get_caller_address()
    let (ward) = _wards.read(caller)
    assert ward = 1
    return ()
end

@external
func rely{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(user : felt):
    auth()
    _wards.write(user, 1)
    return ()
end

@external
func deny{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(user : felt):
    auth()
    _wards.write(user, 0)
    return ()
end

@external
func close{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }():
    auth()
    _is_open.write(0)
    return ()
end

@constructor
func constructor{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(
    ward : felt,
    dai : felt,
    bridge : felt,
    registry : felt,
  ):
    _wards.write(ward, 1)

    _is_open.write(1)
    _dai.write(dai)
    _bridge.write(bridge)
    _registry.write(registry)

    return ()
end

@external
func initiate_withdraw{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(l1_recipient : felt, amount : Uint256):
    let (is_open) = _is_open.read()
    assert is_open = 1

    let (dai) = _dai.read()
    let (caller) = get_caller_address()

    IDAI.burn(dai, caller, amount)

    send_handle_withdraw(l1_recipient, amount)

    return ()
end

@l1_handler
func handle_deposit{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(
    from_address : felt,
    l2_recipient: felt,
    amount_low : felt,
    amount_high : felt
  ):
    # check l1 message sender
    let (bridge) = _bridge.read()
    assert from_address = bridge

    let amount = Uint256(low=amount_low, high=amount_high)
    let (dai) = _dai.read()
    IDAI.mint(dai, l2_recipient, amount)

    return ()
end

@l1_handler
func handle_force_withdrawal{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(
    from_address : felt,
    l2_sender : felt,
    l1_recipient : felt,
    amount_low : felt,
    amount_high : felt
  ):
    alloc_locals

    # check l1 message sender
    let (bridge) = _bridge.read()
    assert from_address = bridge

    # check l1 recipent address
    let (registry) = _registry.read()
    let (_l1_recipient) = IRegistry.get_L1_address(registry, l2_sender)
    if _l1_recipient != l1_recipient:
        return ()
    end

    let (local dai) = _dai.read()

    # check l2 DAI balance
    let amount = Uint256(low=amount_low, high=amount_high)
    let (balance : Uint256) = IDAI.balanceOf(dai, l2_sender)
    let (balance_check) = uint256_le(amount, balance)
    if balance_check == 0:
        return ()
    end

    # check allowance
    let (contract_address) = get_contract_address()
    let (allowance : Uint256) = IDAI.allowance(dai, l2_sender, contract_address)
    let (allowance_check) = uint256_le(amount, allowance)
    if allowance_check == 0:
        return ()
    end

    IDAI.burn(dai, l2_sender, amount)
    send_handle_withdraw(l1_recipient, amount)
    return ()
end

func send_handle_withdraw{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(l1_recipient : felt, amount : Uint256):

    # check valid L1 address
    assert_l1_address(l1_recipient)

    let (payload : felt*) = alloc()
    assert payload[0] = FINALIZE_WITHDRAW
    assert payload[1] = l1_recipient
    assert payload[2] = amount.low
    assert payload[3] = amount.high

    let (bridge) = _bridge.read()

    send_message_to_l1(bridge, 4, payload)
    return ()
end

func assert_l1_address{range_check_ptr}(l1_address : felt):
    assert_le_felt(l1_address, MAX_L1_ADDRESS)
    return ()
end
