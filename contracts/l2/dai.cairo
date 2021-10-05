%lang starknet

from starkware.starknet.common.storage import Storage
from starkware.cairo.common.cairo_builtins import HashBuiltin
from starkware.cairo.common.math import assert_nn_le, assert_not_equal
from contracts.l2.ERC20 import (totalSupply, balanceOf, transfer, transferFrom,
allowance, approve,
balances, total_supply, allowances)
from starkware.starknet.common.syscalls import get_caller_address

@external
func mint{
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(to_address : felt, amount : felt):

    assert_not_equal(to_address, 0)
    # assert_not_equal(to_address, this)

    let (balance) = balances.read(to_address)
    balances.write(to_address, balance + amount)

    let (total) = total_supply.read()
    total_supply.write(total + amount)

    return ()
end

@external
func burn{
    syscall_ptr : felt*,
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(from_address : felt, amount : felt):

    let (caller) = get_caller_address()

    let (balance) = balances.read(from_address)
    assert_nn_le(amount, balance)
    balances.write(from_address, balance - amount)

    # decrease supply
    let (total) = total_supply.read()
    total_supply.write(total - amount)

    # send to burn address
    let (balance) = balances.read(0)
    balances.write(0, balance + amount)

    if caller != from_address:
      let (allowance) = allowances.read(from_address, caller)
      assert_nn_le(amount, allowance)
      allowances.write(from_address, caller, allowance - amount)
      tempvar syscall_ptr : felt* = syscall_ptr
      tempvar storage_ptr : Storage* = storage_ptr
      tempvar pedersen_ptr : HashBuiltin*= pedersen_ptr
      tempvar range_check_ptr = range_check_ptr
    else:
      tempvar syscall_ptr : felt* = syscall_ptr
      tempvar storage_ptr : Storage* = storage_ptr
      tempvar pedersen_ptr : HashBuiltin*= pedersen_ptr
      tempvar range_check_ptr = range_check_ptr
    end

    return ()
end
