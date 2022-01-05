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
func _l2_token() -> (res : felt):
end

@storage_var
func _wormhole_bridge() -> (res : felt):
end

@storage_var
func _domain() -> (res : felt):
end

@storage_var
func _valid_domains(res : felt) -> (res : felt):
end

@storage_var
func _batched_dai_to_flush(res : felt) -> (res : Uint256):
end

@storage_var
func _wards(user : felt) -> (res : felt):
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

@constructor
func constructor{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(
    ward : felt,
    l2_token : felt,
    wormhole_bridge : felt,
    domain : felt,
  ):
    _wards.write(ward, 1)

    _is_open.write(1)
    _l2_token.write(l2_token)
    _wormhole_bridge.write(wormhole_bridge)
    _domain.write(domain)
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
    operater : felt,
  ):
    let (is_open) = _is_open.read()
    assert is_open = 1

    // valid domain check?
    let (valid_domain) = _valid_domains.read(target_domain)
    assert valid_domain == 1
    
    let (dai) = _batched_dai_to_flush.read(target_domain)
    let (new_dai, dai_carry) = uint256_add(dai, amount)
    assert dai_carry = 0
    _batched_dai_to_flush.write(target_domain, new_dai)

    let (l2_token) = _l2_token.read()
    let (caller) = get_caller_address()
    Mintable.burn(l2_token, caller, amount)

    let (domain) = _domain.read()

    let (payload) = alloc()
    assert payload[0] = FINALIZE_REGISTER_WORMHOLE
    assert payload[1] = domain
    assert payload[2] = targetDomain
    assert payload[3] = receiver
    assert payload[4] = operator
    assert payload[5] = amount.low
    assert payload[6] = amount.high
    // assert payload[7] = nonce
    // assert payload[8] = timestamp

    let (bridge) = _bridge.read()

    send_message_to_l1(bridge, 7, payload)

    // emit event
end

@external
func flush(
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(target_domain : felt):
    let (dai_to_flush : Uint256) = _batched_dai_to_flush.read(target_domain)
    let (dai_to_flush_check : felt) = uint256_le(0, dai_to_flush)
    assert dai_to_flush_check == 1

    _batched_dai_to_flush.write(target_domain, 0)

    let (payload) = alloc()
    assert payload[0] = FINALIZE_FLUSH
    assert payload[1] = target_domain
    assert payload[2] = dai_to_flush.low
    assert payload[3] = dai_to_flush.high

    let (bridge) = _bridge.read()

    send_message_to_l1(bridge, 3, payload)

    // emit event
end
