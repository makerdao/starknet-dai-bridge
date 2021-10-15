%lang starknet
%builtins pedersen range_check

from starkware.starknet.common.storage import Storage
from starkware.cairo.common.cairo_builtins import HashBuiltin
from starkware.cairo.common.math import assert_nn_le, assert_not_equal
from starkware.starknet.common.syscalls import get_caller_address

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
    storage_ptr : Storage*,
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
    storage_ptr : Storage*,
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
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(to_address : felt, amount : felt):
    alloc_locals

    auth()
    local syscall_ptr : felt* = syscall_ptr

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
    alloc_locals

    let (local caller) = get_caller_address()
    local syscall_ptr_local : felt* = syscall_ptr

    let (balance) = balances.read(from_address)
    assert_nn_le(amount, balance)
    balances.write(from_address, balance - amount)

    # decrease supply
    let (total) = total_supply.read()
    total_supply.write(total - amount)

    if caller != from_address:
      let (allowance) = allowances.read(from_address, caller)
      if allowance != MAX:
        assert_nn_le(amount, allowance)
        allowances.write(from_address, caller, allowance - amount)
        tempvar syscall_ptr : felt* = syscall_ptr_local
        tempvar storage_ptr : Storage* = storage_ptr
        tempvar pedersen_ptr : HashBuiltin*= pedersen_ptr
        tempvar range_check_ptr = range_check_ptr
      else:
        tempvar syscall_ptr : felt* = syscall_ptr_local
        tempvar storage_ptr : Storage* = storage_ptr
        tempvar pedersen_ptr : HashBuiltin*= pedersen_ptr
        tempvar range_check_ptr = range_check_ptr
      end
    else:
      tempvar syscall_ptr : felt* = syscall_ptr_local
      tempvar storage_ptr : Storage* = storage_ptr
      tempvar pedersen_ptr : HashBuiltin*= pedersen_ptr
      tempvar range_check_ptr = range_check_ptr
    end

    return ()
end


###################
# ERC20 Functions #
###################
@storage_var
func balances(user : felt) -> (res : felt):
end

@storage_var
func total_supply() -> (res : felt):
end

@storage_var
func allowances(owner : felt, spender : felt) -> (res : felt):
end

@view
func totalSupply{
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }() -> (res : felt):
    let (res) = total_supply.read()
    return (res)
end

@view
func balanceOf{
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(user : felt) -> (res : felt):
    let (res) = balances.read(user=user)
    return (res)
end

@view
func allowance{
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(owner : felt, spender : felt) -> (res : felt):
    let (res) = allowances.read(owner, spender)
    return (res)
end

@external
func rely{
    syscall_ptr : felt*,
    storage_ptr : Storage*,
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
    storage_ptr : Storage*,
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
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(recipient : felt, amount : felt):
    alloc_locals

    assert_not_equal(recipient, 0)

    let (caller) = get_caller_address()
    local syscall_ptr : felt* = syscall_ptr
    _transfer(caller, recipient, amount)

    return ()
end

@external
func transferFrom{
    syscall_ptr : felt*,
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(sender : felt, recipient : felt, amount : felt):
    alloc_locals

    let (local caller) = get_caller_address()
    local syscall_ptr_local : felt* = syscall_ptr

    _transfer(sender, recipient, amount)

    if caller != sender:
      let (allowance) = allowances.read(sender, caller)
      if allowance != MAX:
        assert_nn_le(amount, allowance)
        allowances.write(sender, caller, allowance - amount)
        tempvar syscall_ptr : felt* = syscall_ptr_local
        tempvar storage_ptr : Storage* = storage_ptr
        tempvar pedersen_ptr : HashBuiltin*= pedersen_ptr
        tempvar range_check_ptr = range_check_ptr
      else:
        tempvar syscall_ptr : felt* = syscall_ptr_local
        tempvar storage_ptr : Storage* = storage_ptr
        tempvar pedersen_ptr : HashBuiltin*= pedersen_ptr
        tempvar range_check_ptr = range_check_ptr
      end
    else:
      tempvar syscall_ptr : felt* = syscall_ptr_local
      tempvar storage_ptr : Storage* = storage_ptr
      tempvar pedersen_ptr : HashBuiltin*= pedersen_ptr
      tempvar range_check_ptr = range_check_ptr
    end

    return ()
end

func _transfer{
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(sender: felt, recipient : felt, amount : felt):
    let (balance) = balances.read(sender)
    assert_nn_le(amount, balance)
    balances.write(sender, balance - amount)

    let (balance) = balances.read(recipient)
    balances.write(recipient, balance + amount)

    return ()
end

@external
func approve{
    syscall_ptr : felt*,
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(spender: felt, amount : felt):
    alloc_locals

    let (caller) = get_caller_address()
    local syscall_ptr : felt* = syscall_ptr
    allowances.write(caller, spender, amount)

    return ()
end

@external
func increaseAllowance{
    syscall_ptr : felt*,
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(spender : felt, amount : felt):
  let (caller) = get_caller_address()
  let (allowance) = allowances.read(caller, spender)
  assert_nn_le(amount, MAX - allowance)
  allowances.write(caller, spender, allowance + amount)
  return ()
end

@external
func decreaseAllowance{
    syscall_ptr : felt*,
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(spender : felt, amount : felt):
  let (caller) = get_caller_address()
  let (allowance) = allowances.read(caller, spender)
  assert_nn_le(amount, allowance)
  allowances.write(caller, spender, allowance - amount)
  return ()
end
