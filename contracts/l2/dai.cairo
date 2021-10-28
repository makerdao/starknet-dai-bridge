%lang starknet
%builtins pedersen range_check

from starkware.starknet.common.storage import Storage
from starkware.cairo.common.cairo_builtins import HashBuiltin
from starkware.cairo.common.math import assert_nn_le, assert_not_equal, assert_not_zero
from starkware.starknet.common.syscalls import get_caller_address

# change value
const MAX = 2**120

@storage_var
func _wards(user : felt) -> (res : felt):
end

@storage_var
func _initialized() -> (res : felt):
end

@storage_var
func _balances(user : felt) -> (res : felt):
end

@storage_var
func _total_supply() -> (res : felt):
end

@storage_var
func _allowances(owner : felt, spender : felt) -> (res : felt):
end

@view
func totalSupply{
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }() -> (res : felt):
    let (res) = _total_supply.read()
    return (res)
end

@view
func balanceOf{
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(user : felt) -> (res : felt):
    let (res) = _balances.read(user=user)
    return (res)
end

@view
func allowance{
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(owner : felt, spender : felt) -> (res : felt):
    let (res) = _allowances.read(owner, spender)
    return (res)
end

@external
func initialize{
    syscall_ptr : felt*,
    storage_ptr : Storage*,
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
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(account : felt, amount : felt):
    alloc_locals

    auth()
    local syscall_ptr : felt* = syscall_ptr

    assert_not_equal(account, 0)

    # update balance
    let (balance) = _balances.read(account)
    _balances.write(account, balance + amount)

    # update total supply
    let (total_supply) = _total_supply.read()
    _total_supply.write(total_supply + amount)

    return ()
end

@external
func burn{
    syscall_ptr : felt*,
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(account : felt, amount : felt):
    alloc_locals

    let (local caller) = get_caller_address()
    local syscall_ptr_local : felt* = syscall_ptr

    # update balance
    let (balance) = _balances.read(account)
    assert_nn_le(amount, balance)
    _balances.write(account, balance - amount)

    # decrease supply
    let (total_supply) = _total_supply.read()
    _total_supply.write(total_supply - amount)

    # check allowance
    if caller != account:
      let (allowance) = _allowances.read(account, caller)
      if allowance != MAX:
        assert_nn_le(amount, allowance)
        _allowances.write(account, caller, allowance - amount)
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

@external
func rely{
    syscall_ptr : felt*,
    storage_ptr : Storage*,
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
    storage_ptr : Storage*,
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
      let (allowance) = _allowances.read(sender, caller)
      if allowance != MAX:
        assert_nn_le(amount, allowance)
        _allowances.write(sender, caller, allowance - amount)
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
    _allowances.write(caller, spender, amount)
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
  let (allowance) = _allowances.read(caller, spender)
  # TODO: fix after uint256
  assert_nn_le(amount, MAX - allowance)
  _allowances.write(caller, spender, allowance + amount)
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
  let (allowance) = _allowances.read(caller, spender)
  assert_nn_le(amount, allowance)
  _allowances.write(caller, spender, allowance - amount)
  return ()
end

func auth{
    syscall_ptr : felt*,
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }():
  let (caller) = get_caller_address()

  let (ward) = _wards.read(caller)
  assert ward = 1

  return ()
end

func _transfer{
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(sender: felt, recipient : felt, amount : felt):

    assert_not_zero(sender)
    assert_not_zero(recipient)

    let (balance) = _balances.read(sender)
    assert_nn_le(amount, balance)
    _balances.write(sender, balance - amount)

    let (balance) = _balances.read(recipient)
    _balances.write(recipient, balance + amount)

    return ()
end
