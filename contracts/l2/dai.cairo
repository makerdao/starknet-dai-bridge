%lang starknet
%builtins pedersen range_check bitwise

from starkware.cairo.common.cairo_builtins import (HashBuiltin, BitwiseBuiltin)
from starkware.cairo.common.math import (assert_nn_le, assert_not_equal, assert_not_zero)
from starkware.starknet.common.syscalls import get_caller_address
from starkware.cairo.common.uint256 import (Uint256, uint256_add, uint256_sub, uint256_eq)

const MAX_SPLIT = 2**128

@storage_var
func _wards(user : felt) -> (res : felt):
end

@storage_var
func _initialized() -> (res : felt):
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
func totalSupply{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }() -> (res : Uint256):
    let (res : Uint256) = _total_supply.read()
    return (res)
end

@view
func balanceOf{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(user : felt) -> (res : Uint256):
    let (res : Uint256) = _balances.read(user=user)
    return (res)
end

@view
func allowance{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(owner : felt, spender : felt) -> (res : Uint256):
    let (res : Uint256) = _allowances.read(owner, spender)
    return (res)
end

@external
func initialize{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }():
    let (initialized) = _initialized.read()
    assert initialized = 0
    _initialized.write(1)

    let (caller) = get_caller_address()
    _wards.write(caller, 1)

    return ()
end

@external
func mint{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr,
    bitwise_ptr : BitwiseBuiltin*
  }(account : felt, amount : Uint256):
    alloc_locals

    local bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    auth()
    local syscall_ptr : felt* = syscall_ptr

    assert_not_equal(account, 0)

    let (local balance : Uint256) = _balances.read(account)
    let (local total : Uint256) = _total_supply.read()

    local syscall_ptr : felt* = syscall_ptr 
    local pedersen_ptr : HashBuiltin* = pedersen_ptr

    let (local sum1 : Uint256, carry : felt) = uint256_add(balance, amount)
    let (local sum2 : Uint256, carry : felt) = uint256_add(total, amount)

    local bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    # update balance
    _balances.write(account, sum1)
    # update total supply
    _total_supply.write(sum2)

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

    local bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    let (local caller) = get_caller_address()
    local syscall_ptr : felt* = syscall_ptr

    let (local balance : Uint256) = _balances.read(account)
    let (local total) = _total_supply.read()
    let (local allowance : Uint256) = _allowances.read(account, caller)

    local syscall_ptr : felt* = syscall_ptr
    local pedersen_ptr : HashBuiltin* = pedersen_ptr
    
    let (local diff1 : Uint256) = uint256_sub(balance, amount)
    let (local diff2 : Uint256) = uint256_sub(total, amount)
    let (local diff3 : Uint256) = uint256_sub(allowance, amount)
    local bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    let MAX = Uint256(low=MAX_SPLIT, high=MAX_SPLIT)
    let (local eq) = uint256_eq(allowance, MAX)
    
    # update balance
    _balances.write(account, diff1)
    # decrease supply
    _total_supply.write(diff2)

    # check allowance
    if caller != account:
      if eq == 0:
        _allowances.write(account, caller, diff3)
        tempvar syscall_ptr : felt* = syscall_ptr
        tempvar pedersen_ptr : HashBuiltin*= pedersen_ptr
        tempvar range_check_ptr = range_check_ptr
        tempvar bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
      else:
        tempvar syscall_ptr : felt* = syscall_ptr
        tempvar pedersen_ptr : HashBuiltin*= pedersen_ptr
        tempvar range_check_ptr = range_check_ptr
        tempvar bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
      end
    else:
      tempvar syscall_ptr : felt* = syscall_ptr
      tempvar pedersen_ptr : HashBuiltin*= pedersen_ptr
      tempvar range_check_ptr = range_check_ptr
      tempvar bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
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
func transfer{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr,
    bitwise_ptr : BitwiseBuiltin*
  }(recipient : felt, amount : Uint256):
    alloc_locals

    assert_not_equal(recipient, 0)

    local bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    let (caller) = get_caller_address()
    local syscall_ptr : felt* = syscall_ptr
    _transfer(caller, recipient, amount)

    return ()
end

@external
func transferFrom{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr,
    bitwise_ptr : BitwiseBuiltin*
  }(sender : felt, recipient : felt, amount : Uint256):
    alloc_locals

    local bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    let (local caller) = get_caller_address()

    _transfer(sender, recipient, amount)
    let (local allowance : Uint256) = _allowances.read(sender, caller)
    local syscall_ptr : felt* = syscall_ptr
    local pedersen_ptr : HashBuiltin* = pedersen_ptr

    local bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    let MAX = Uint256(low=MAX_SPLIT, high=MAX_SPLIT)
    let (local eq) = uint256_eq(allowance, MAX)
    let (diff : Uint256) = uint256_sub(allowance, amount)

    if caller != sender:
      if eq == 0:
        _allowances.write(sender, caller, diff)
        tempvar syscall_ptr : felt* = syscall_ptr
        tempvar pedersen_ptr : HashBuiltin*= pedersen_ptr
        tempvar range_check_ptr = range_check_ptr
        tempvar bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
      else:
        tempvar syscall_ptr : felt* = syscall_ptr
        tempvar pedersen_ptr : HashBuiltin*= pedersen_ptr
        tempvar range_check_ptr = range_check_ptr
        tempvar bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
      end
    else:
      tempvar syscall_ptr : felt* = syscall_ptr
      tempvar pedersen_ptr : HashBuiltin*= pedersen_ptr
      tempvar range_check_ptr = range_check_ptr
      tempvar bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    end

    return ()
end

@external
func approve{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(spender: felt, amount : Uint256):
    alloc_locals

    let (caller) = get_caller_address()
    local syscall_ptr : felt* = syscall_ptr
    _allowances.write(caller, spender, amount)
    return ()
end

@external
func increaseAllowance{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr,
    bitwise_ptr : BitwiseBuiltin*
  }(spender : felt, amount : Uint256):
    alloc_locals

    let (local caller) = get_caller_address()
    local syscall_ptr : felt* = syscall_ptr
    let (allowance : Uint256) = _allowances.read(caller, spender)
    local syscall_ptr : felt* = syscall_ptr
    local pedersen_ptr : HashBuiltin* = pedersen_ptr
    let (sum : Uint256, carry : felt) = uint256_add(amount, allowance)
    local bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    let MAX = Uint256(low=MAX_SPLIT, high=MAX_SPLIT)
    # assert_nn_le(amount, MAX - allowance)
    _allowances.write(caller, spender, sum)
    return ()
end

@external
func decreaseAllowance{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr,
    bitwise_ptr : BitwiseBuiltin*
  }(spender : felt, amount : Uint256):
    alloc_locals

    let (local caller) = get_caller_address()
    local syscall_ptr : felt* = syscall_ptr
    let (allowance : Uint256) = _allowances.read(caller, spender)
    local syscall_ptr : felt* = syscall_ptr
    local pedersen_ptr : HashBuiltin* = pedersen_ptr
    let (diff : Uint256) = uint256_sub(allowance, amount)
    local bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    # assert_nn_le(amount, allowance)
    _allowances.write(caller, spender, diff)
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

func _transfer{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr,
    bitwise_ptr : BitwiseBuiltin*
  }(sender : felt, recipient : felt, amount : Uint256):
    alloc_locals

    let (local sender_balance : Uint256) = _balances.read(sender)
    let (local recipient_balance : Uint256) = _balances.read(recipient)
    
    local syscall_ptr : felt* = syscall_ptr
    local pedersen_ptr : HashBuiltin* = pedersen_ptr

    let (local diff : Uint256) = uint256_sub(sender_balance, amount)
    let (local sum : Uint256, carry : felt) = uint256_add(recipient_balance, amount)
    
    local bitwise_ptr : BitwiseBuiltin* = bitwise_ptr

    _balances.write(sender, diff)
    _balances.write(recipient, sum)

    return ()
end
