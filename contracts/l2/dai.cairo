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

from starkware.cairo.common.cairo_builtins import (HashBuiltin, BitwiseBuiltin)
from starkware.cairo.common.math import (assert_not_equal, assert_not_zero)
from starkware.cairo.common.math_cmp import is_not_zero
from starkware.starknet.common.syscalls import (get_caller_address, get_contract_address)
from starkware.cairo.common.uint256 import (
  Uint256,
  uint256_add,
  uint256_sub,
  uint256_eq,
  uint256_le,
  uint256_check
)

const ALL_ONES = 2 ** 128 - 1

@event
func Rely(user : felt):
end

@event
func Deny(user : felt):
end

@event
func Transfer(sender : felt, recipient : felt, value : Uint256):
end

@event
func Approval(owner : felt, spender : felt, value : Uint256):
end

@storage_var
func _wards(user : felt) -> (res : felt):
end

@storage_var
func _balances(user : felt) -> (res : Uint256):
end

@storage_var
func _total_supply() -> (res : Uint256):
end

@storage_var
func _allowances(owner : felt, spender : felt) -> (res : Uint256):
end

@view
func decimals{} () -> (res: felt):
    return (18)
end

@view
func name{} () -> (res: felt):
    return ('Dai Stablecoin')
end

@view
func symbol{} () -> (res: felt):
    return ('DAI')
end

@view
func totalSupply{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }() -> (res : Uint256):
    let (res) = _total_supply.read()
    return (res)
end

@view
func balanceOf{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(user : felt) -> (res : Uint256):
    let (res) = _balances.read(user=user)
    return (res)
end

@view
func allowance{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(owner : felt, spender : felt) -> (res : Uint256):
    let (res) = _allowances.read(owner, spender)
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

@constructor
func constructor{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(ward : felt):
    _wards.write(ward, 1)
    Rely.emit(ward)
    return ()
end

@external
func mint{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr,
    bitwise_ptr : BitwiseBuiltin*
  }(account : felt, amount : Uint256):
    auth()

    # check valid recipient
    with_attr error_message("dai/invalid-recipient"):
      assert_not_zero(account)
      let (contract_address) = get_contract_address()
      assert_not_equal(account, contract_address)
    end

    # check valid amount
    with_attr error_message("dai/invalid-amount"):
      uint256_check(amount)
    end

    # update balance
    let (balance) = _balances.read(account)
    # overflow check disabled since later amount + total_supply is checked for overflow
    # and total_supply >= balance
    let (new_balance, _) = uint256_add(balance, amount)
    _balances.write(account, new_balance)

    # update total supply
    let (total) = _total_supply.read()
    let (new_total) = uint256_add_safe(total, amount)
    _total_supply.write(new_total)

    Transfer.emit(0, account, amount)

    return ()
end

@external
func burn{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr,
    bitwise_ptr : BitwiseBuiltin*
  }(account : felt, amount : Uint256):
    alloc_locals

    let (local caller) = get_caller_address()

    # check valid amount
    with_attr error_message("dai/invalid-amount"):
      uint256_check(amount)
    end

    # update balance
    let (local balance) = _balances.read(account)

    assert_le_balance(amount, balance)
    let (new_balance) = uint256_sub(balance, amount)
    _balances.write(account, new_balance)

    # decrease supply
    let (local total_supply) = _total_supply.read()

    # underflow check disabled since amount <= balance <= total_amount
    let (new_total_supply) = uint256_sub(total_supply, amount)
    _total_supply.write(new_total_supply)

    Transfer.emit(account, 0, amount)

    if caller != account:
      let (allowance) = _allowances.read(account, caller)
      let MAX = Uint256(low=ALL_ONES, high=ALL_ONES)
      let (eq) = uint256_eq(allowance, MAX)
      if eq == 0:
        assert_le_allowance(amount, allowance)
        let (new_allowance) = uint256_sub(allowance, amount)
        _allowances.write(account, caller, new_allowance)
        return ()
      else:
        return ()
      end
    end

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
    Rely.emit(user)
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
    Deny.emit(user)
    return ()
end

@external
func transfer{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr,
    bitwise_ptr : BitwiseBuiltin*
  }(recipient : felt, amount : Uint256) -> (res : felt):
    let (caller) = get_caller_address()
    _transfer(caller, recipient, amount)

    return (res=1)
end

@external
func transferFrom{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr,
    bitwise_ptr : BitwiseBuiltin*
  }(sender : felt, recipient : felt, amount : Uint256) -> (res : felt):
    alloc_locals

    let (local caller) = get_caller_address()
    _transfer(sender, recipient, amount)

    if caller != sender:
      let (allowance) = _allowances.read(sender, caller)
      let MAX = Uint256(low=ALL_ONES, high=ALL_ONES)
      let (max_allowance) = uint256_eq(allowance, MAX)
      if max_allowance == 0:
        assert_le_allowance(amount, allowance)
        let (new_allowance: Uint256) = uint256_sub(allowance, amount)
        _allowances.write(sender, caller, new_allowance)
        return (res=1)
      else:
        return (res=1)
      end
    end
    return (res=1)
end

@external
func approve{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(spender: felt, amount : Uint256) -> (res : felt):
    with_attr error_message("dai/invalid-amount"):
      uint256_check(amount)
    end
    let (caller) = get_caller_address()
    _approve(caller, spender, amount)

    return (res=1)
end

@external
func increaseAllowance{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr,
    bitwise_ptr : BitwiseBuiltin*
  }(spender : felt, amount : Uint256) -> (res : felt):
    alloc_locals

    with_attr error_message("dai/invalid-amount"):
      uint256_check(amount)
    end
    let (local caller) = get_caller_address()
    let (allowance) = _allowances.read(caller, spender)
    let (new_allowance) = uint256_add_safe(amount, allowance)
    _approve(caller, spender, new_allowance)
    return (res=1)
end

@external
func decreaseAllowance{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr,
    bitwise_ptr : BitwiseBuiltin*
  }(spender : felt, amount : Uint256) -> (res : felt):
    alloc_locals

    with_attr error_message("dai/invalid-amount"):
      uint256_check(amount)
    end
    let (local caller) = get_caller_address()
    let (local allowance) = _allowances.read(caller, spender)
    assert_le_allowance(amount, allowance)
    let (new_allowance) = uint256_sub(allowance, amount)
    _approve(caller, spender, new_allowance)
    return (res=1)
end

func auth{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }():
    let (caller) = get_caller_address()

    let (ward) = _wards.read(caller)
    with_attr error_message("dai/not-authorized"):
      assert ward = 1
    end

    return ()
end

func _transfer{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr,
    bitwise_ptr : BitwiseBuiltin*
  }(sender : felt, recipient : felt, amount : Uint256):
    alloc_locals

    # check valid amount
    with_attr error_message("dai/invalid-amount"):
      uint256_check(amount)
    end

    with_attr error_message("dai/invalid-recipient"):
      assert_not_zero(recipient)
      let (contract_address) = get_contract_address()
      assert_not_equal(recipient, contract_address)
    end

    # decrease sender balance
    let (local sender_balance) = _balances.read(sender)
    assert_le_balance(amount, sender_balance)
    let (new_balance) = uint256_sub(sender_balance, amount)
    _balances.write(sender, new_balance)

    # increase recipient balance
    let (recipient_balance) = _balances.read(recipient)
    let (sum) = uint256_add_safe(recipient_balance, amount)
    _balances.write(recipient, sum)

    Transfer.emit(sender, recipient, amount)

    return ()
end

func _approve{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(caller: felt, spender: felt, amount: Uint256):
    with_attr error_message("dai/invalid-recipient"):
      assert_not_zero(spender)
    end
    _allowances.write(caller, spender, amount)
    Approval.emit(caller, spender, amount)
    return ()
end

func uint256_add_safe{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(a : Uint256, b : Uint256) -> (sum : Uint256):
    let (sum, carry) = uint256_add(a, b)
    with_attr error_message("dai/uint256-overflow"):
      assert carry = 0
    end
    return (sum)
end

func assert_le_balance{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(a : Uint256, b : Uint256):
    with_attr error_message("dai/insufficient-balance"):
      assert_uint256_le(a, b)
    end
    return ()
end

func assert_le_allowance{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(a : Uint256, b : Uint256):
    with_attr error_message("dai/insufficient-allowance"):
      assert_uint256_le(a, b)
    end
    return ()
end

func assert_uint256_le{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(a : Uint256, b : Uint256):
    let (is_le) = uint256_le(a, b)
    assert is_le = 1
    return()
end
