%lang starknet
%builtins pedersen range_check

from starkware.starknet.common.storage import Storage
from starkware.cairo.common.cairo_builtins import HashBuiltin
from starkware.cairo.common.math import assert_nn_le
from starkware.starknet.common.syscalls import get_caller_address


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
func transfer{
    syscall_ptr : felt*,
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(recipient : felt, amount : felt):
    alloc_locals

    let (sender) = get_caller_address()
    local syscall_ptr_local : felt* = syscall_ptr
    _transfer(sender, recipient, amount)
    let syscall_ptr : felt* = syscall_ptr_local
    return ()
end

@external
func transferFrom{
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    syscall_ptr : felt*,
    range_check_ptr
  }(sender : felt, recipient : felt, amount : felt):
    alloc_locals

    let (local caller) = get_caller_address()
    let (local caller_allowance) = allowances.read(owner=sender, spender=caller)
    local syscall_ptr_local : felt* = syscall_ptr
    assert_nn_le(amount, caller_allowance)
    _transfer(sender, recipient, amount)
    allowances.write(sender, caller, caller_allowance - amount)
    let syscall_ptr : felt* = syscall_ptr_local
    return ()
end

func _transfer{
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(sender: felt, recipient : felt, amount : felt):
    decrease_balance(sender, amount)
    increase_balance(recipient, amount)
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
    local syscall_ptr_local : felt* = syscall_ptr
    allowances.write(caller, spender, amount)
    let syscall_ptr : felt* = syscall_ptr_local
    return ()
end

func increase_balance{
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(address : felt, amount : felt):
    let (balance) = balances.read(address)
    balances.write(address, balance + amount)

    return ()
end

func decrease_balance{
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(address : felt, value : felt):
    let (balance) = balances.read(address)
    assert_nn_le(value, balance)
    balances.write(address, balance - value)

    let (total) = total_supply.read()
    total_supply.write(total - value)

    return ()
end

func increase_supply{
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(value : felt):
    let (total) = total_supply.read()
    total_supply.write(total + value)

    return ()
end

func decrease_supply{
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(value : felt):
    let (total) = total_supply.read()
    total_supply.write(total - value)

    return ()
end
