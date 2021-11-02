%lang starknet
%builtins pedersen range_check bitwise

from starkware.cairo.common.cairo_builtins import (HashBuiltin, BitwiseBuiltin)
from starkware.cairo.common.math import (assert_nn_le, assert_not_equal, split_felt)
from starkware.starknet.common.syscalls import get_caller_address
from contracts.l2.uint import (uint256, add, sub, is_eq)

# change value
const MAX = 2**120

@storage_var
func wards(user : felt) -> (res : felt):
end

@storage_var
func initialized() -> (res : felt):
end


func auth{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }() -> ():
  let (caller) = get_caller_address()

  let (ward) = wards.read(caller)
  assert ward = 1

  return ()
end

@external
func initialize{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }() -> ():
  let (_initialized) = initialized.read()
  assert _initialized = 0
  initialized.write(1)

  let (caller) = get_caller_address()
  wards.write(caller, 1)

  return ()
end

@external
func mint{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr,
    bitwise_ptr : BitwiseBuiltin*
  }(to_address : felt, amount : uint256):
    alloc_locals

    local bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    auth()
    local syscall_ptr : felt* = syscall_ptr

    assert_not_equal(to_address, 0)
    # assert_not_equal(to_address, this)

    let (local balance : uint256) = balances.read(to_address)
    let (local total : uint256) = total_supply.read()

    local syscall_ptr : felt* = syscall_ptr 
    local pedersen_ptr : HashBuiltin* = pedersen_ptr

    let (local sum1 : uint256) = add(balance, amount)
    let (local sum2 : uint256) = add(total, amount)

    local bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    balances.write(to_address, sum1)
    total_supply.write(sum2)

    return ()
end

@external
func burn{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr,
    bitwise_ptr : BitwiseBuiltin*
  }(from_address : felt, amount : uint256):
    alloc_locals

    local bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    let (local caller) = get_caller_address()
    local syscall_ptr : felt* = syscall_ptr

    let (local balance : uint256) = balances.read(from_address)
    let (local total) = total_supply.read()
    let (local allowance : uint256) = allowances.read(from_address, caller)

    local syscall_ptr : felt* = syscall_ptr
    local pedersen_ptr : HashBuiltin* = pedersen_ptr
    
    let (local diff1 : uint256) = sub(balance, amount)
    let (local diff2 : uint256) = sub(total, amount)
    let (local diff3 : uint256) = sub(allowance, amount)
    local bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    let (low, high) = split_felt(MAX)
    let split_max = uint256(low=low, high=high)
    let (local eq) = is_eq(allowance, split_max)
    
    balances.write(from_address, diff1)
    total_supply.write(diff2)

    if caller != from_address:
      if eq == 0:
        allowances.write(from_address, caller, diff3)
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


###################
# ERC20 Functions #
###################
@storage_var
func balances(user : felt) -> (res : uint256):
end

@storage_var
func total_supply() -> (res : uint256):
end

@storage_var
func allowances(owner : felt, spender : felt) -> (res : uint256):
end


@view
func totalSupply{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }() -> (low : felt, high : felt):
    let (res : uint256) = total_supply.read()
    return (low=res.low, high=res.high)
end

@view
func balanceOf{
    syscall_ptr: felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(user : felt) -> (low : felt, high : felt):
    let (res : uint256) = balances.read(user=user)
    return (low=res.low, high=res.high)
end

@view
func allowance{
    syscall_ptr: felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(owner : felt, spender : felt) -> (low : felt, high : felt):
    let (res : uint256) = allowances.read(owner, spender)
    return (low=res.low, high=res.high)
end

@external
func rely{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(user : felt) -> ():
  auth()
  wards.write(user, 1)
  return ()
end

@external
func deny{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(user : felt) -> ():
  auth()
  wards.write(user, 0)
  return ()
end

@external
func transfer{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr,
    bitwise_ptr : BitwiseBuiltin*
  }(recipient : felt, amount : uint256):
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
  }(sender : felt, recipient : felt, amount : uint256):
    alloc_locals

    local bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    let (local caller) = get_caller_address()
    local syscall_ptr_local : felt* = syscall_ptr

    _transfer(sender, recipient, amount)
    let (local allowance : uint256) = allowances.read(sender, caller)
    local syscall_ptr : felt* = syscall_ptr
    local pedersen_ptr : HashBuiltin* = pedersen_ptr

    local bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    let (low, high) = split_felt(MAX)
    let split_max = uint256(low=low, high=high)
    let (local eq) = is_eq(allowance, split_max)
    let (diff : uint256) = sub(allowance, amount)

    if caller != sender:
      if eq == 0:
        allowances.write(sender, caller, diff)
        tempvar syscall_ptr : felt* = syscall_ptr_local
        tempvar pedersen_ptr : HashBuiltin*= pedersen_ptr
        tempvar range_check_ptr = range_check_ptr
        tempvar bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
      else:
        tempvar syscall_ptr : felt* = syscall_ptr_local
        tempvar pedersen_ptr : HashBuiltin*= pedersen_ptr
        tempvar range_check_ptr = range_check_ptr
        tempvar bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
      end
    else:
      tempvar syscall_ptr : felt* = syscall_ptr_local
      tempvar pedersen_ptr : HashBuiltin*= pedersen_ptr
      tempvar range_check_ptr = range_check_ptr
      tempvar bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    end

    return ()
end

func _transfer{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr,
    bitwise_ptr : BitwiseBuiltin*
  }(sender: felt, recipient : felt, amount : uint256):
    alloc_locals

    let (local sender_balance : uint256) = balances.read(sender)
    let (local recipient_balance : uint256) = balances.read(recipient)
    
    local syscall_ptr : felt* = syscall_ptr
    local pedersen_ptr : HashBuiltin* = pedersen_ptr

    let (local diff : uint256) = sub(sender_balance, amount)
    let (local sum : uint256) = add(recipient_balance, amount)
    
    local bitwise_ptr : BitwiseBuiltin* = bitwise_ptr

    balances.write(sender, diff)
    balances.write(recipient, sum)

    return ()
end

@external
func approve{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(spender: felt, amount : uint256):
    alloc_locals

    let (caller) = get_caller_address()
    local syscall_ptr : felt* = syscall_ptr
    allowances.write(caller, spender, amount)

    return ()
end

@external
func increaseAllowance{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr,
    bitwise_ptr : BitwiseBuiltin*
  }(spender : felt, amount : uint256):
    alloc_locals

    let (local caller) = get_caller_address()
    local syscall_ptr : felt* = syscall_ptr
    let (allowance : uint256) = allowances.read(caller, spender)
    local syscall_ptr : felt* = syscall_ptr
    local pedersen_ptr : HashBuiltin* = pedersen_ptr
    let (sum : uint256) = add(amount, allowance)
    local bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    allowances.write(caller, spender, sum)
    return ()
end

@external
func decreaseAllowance{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr,
    bitwise_ptr : BitwiseBuiltin*
  }(spender : felt, amount : uint256):
    alloc_locals

    let (local caller) = get_caller_address()
    local syscall_ptr : felt* = syscall_ptr
    let (allowance : uint256) = allowances.read(caller, spender)
    local syscall_ptr : felt* = syscall_ptr
    local pedersen_ptr : HashBuiltin* = pedersen_ptr
    let (diff : uint256) = sub(allowance, amount)
    local bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    allowances.write(caller, spender, diff)
    return ()
end
