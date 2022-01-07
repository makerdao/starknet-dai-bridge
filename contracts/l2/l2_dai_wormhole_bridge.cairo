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
from starkware.cairo.common.math import (assert_le)
from starkware.starknet.common.syscalls import (get_caller_address, get_contract_address)
from starkware.cairo.common.uint256 import (Uint256, uint256_le, uint256_add, uint256_check)

const FINALIZE_REGISTER_WORMHOLE = 0
const FINALIZE_FLUSH = 1

@contract_interface
namespace Mintable:
    func mint(usr : felt, wad : Uint256):
    end

    func burn(usr : felt, wad : Uint256):
    end
end


@storage_var
func _is_open() -> (res : felt):
end

@storage_var
func _dai() -> (res : felt):
end

@storage_var
func _wormhole_bridge() -> (res : felt):
end

@storage_var
func _domain() -> (res : felt):
end

@storage_var
func _valid_domains(domain : felt) -> (res : felt):
end

@storage_var
func _batched_dai_to_flush(domain : felt) -> (res : Uint256):
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
    let (res) = _is_open.read()
    return (res)
end

@view
func dai{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }() -> (res : felt):
    let (res) = _dai.read()
    return (res)
end

@view
func wormhole_bridge{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }() -> (res : felt):
    let (res) = _wormhole_bridge.read()
    return (res)
end

@view
func domain{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }() -> (res : felt):
    let (res) = _domain.read()
    return (res)
end

@view
func valid_domains{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(domain : felt) -> (res : felt):
    let (res) = _valid_domains.read(domain)
    return (res)
end

@view func batched_dai_to_flush{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(domain : felt) -> (res : Uint256):
    let (res : Uint256) = _batched_dai_to_flush.read(domain)
    return (res)
end

@view
func wards{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(user : felt) -> (res : felt):
    let (res) = _wards.read(user)
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
    wormhole_bridge : felt,
    domain : felt,
  ):
    _wards.write(ward, 1)

    _is_open.write(1)
    _dai.write(dai)
    _wormhole_bridge.write(wormhole_bridge)
    _domain.write(domain)

    return ()
end

const VALID_DOMAINS_REGISTER = 0

@external
func file{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(
    what : felt,
    domain : felt,
    data : felt,
  ):
    assert what = VALID_DOMAINS_REGISTER

    assert_le(data, 1)

    _valid_domains.write(domain, data)

    # emit event

    return ()
end

@external
func initiate_wormhole{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(
    target_domain : felt,
    receiver : felt,
    amount : Uint256,
    operator : felt,
  ):
    uint256_check(amount)
    assert amount.high = 0 # TODO: decide whether to send full uint or just uint128

    let (is_open) = _is_open.read()
    assert is_open = 1

    # valid domain check?
    let (valid_domain) = _valid_domains.read(target_domain)
    assert valid_domain = 1
    
    let (dai_to_flush) = _batched_dai_to_flush.read(target_domain)
    let (new_dai_to_flush, dai_to_flush_carry) = uint256_add(dai_to_flush, amount)
    assert dai_to_flush_carry = 0
    _batched_dai_to_flush.write(target_domain, new_dai_to_flush)

    let (dai) = _dai.read()
    let (caller) = get_caller_address()
    Mintable.burn(dai, caller, amount)

    let (domain) = _domain.read()

    let (payload) = alloc()
    assert payload[0] = FINALIZE_REGISTER_WORMHOLE
    assert payload[1] = domain
    assert payload[2] = target_domain
    assert payload[3] = receiver
    assert payload[4] = operator
    assert payload[5] = amount.low
    # assert payload[6] = nonce
    # assert payload[7] = timestamp

    let (wormhole_bridge) = _wormhole_bridge.read()

    send_message_to_l1(wormhole_bridge, 6, payload)

    # emit event

    return ()
end

@external
func flush{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(target_domain : felt) -> (low : felt, high : felt):
    alloc_locals

    let (dai_to_flush : Uint256) = _batched_dai_to_flush.read(target_domain)
    let uint256_zero = Uint256(low=0, high=0)
    let (dai_to_flush_check : felt) = uint256_le(uint256_zero, dai_to_flush)
    assert dai_to_flush_check = 1

    local syscall_ptr : felt* = syscall_ptr

    _batched_dai_to_flush.write(target_domain, uint256_zero)

    let (payload) = alloc()
    assert payload[0] = FINALIZE_FLUSH
    assert payload[1] = target_domain
    assert payload[2] = dai_to_flush.low
    assert payload[3] = dai_to_flush.high

    let (wormhole_bridge) = _wormhole_bridge.read()

    send_message_to_l1(wormhole_bridge, 4, payload)

    # emit event

    return (low=dai_to_flush.low, high=dai_to_flush.high)
end
