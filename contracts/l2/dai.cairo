%lang starknet
%builtins pedersen range_check bitwise

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
func total_supply{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }() -> (res : Uint256):
    let (res : Uint256) = _total_supply.read()
    return (res)
end

@view
func balance_of{
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

@view
func wards{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(user : felt) -> (res : felt):
    let (res : felt) = _wards.read(user)
    return (res)
end

@constructor
func constructor{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(ward : felt):
    _wards.write(ward, 1)
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
    assert_not_zero(account)
    let (contract_address) = get_contract_address()
    assert_not_equal(account, contract_address)

    # check valid amount
    uint256_check(amount)

    # update balance
    let (balance : Uint256) = _balances.read(account)
    let (new_balance : Uint256, balance_carry : felt) = uint256_add(balance, amount)
    assert balance_carry = 0
    _balances.write(account, new_balance)

    # update total supply
    let (total : Uint256) = _total_supply.read()
    let (new_total : Uint256, total_carry : felt) = uint256_add(total, amount)
    assert total_carry = 0
    _total_supply.write(new_total)

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
    uint256_check(amount)

    # update balance
    let (local balance : Uint256) = _balances.read(account)

    let (is_le) = uint256_le(amount, balance)
    assert is_le = 1
    let (new_balance : Uint256) = uint256_sub(balance, amount)
    _balances.write(account, new_balance)

    # decrease supply
    let (local total_supply : Uint256) = _total_supply.read()

    ## overflow check disabled for effeciency
    # let (is_le) = uint256_le(amount, total_supply)
    # assert is_le = 1
    let (new_total_supply : Uint256) = uint256_sub(total_supply, amount)
    _total_supply.write(new_total_supply)

    if caller != account:
      let (allowance : Uint256) = _allowances.read(account, caller)
      let MAX = Uint256(low=ALL_ONES, high=ALL_ONES)
      let (local eq) = uint256_eq(allowance, MAX)
      if eq == 0:
        let (is_le) = uint256_le(amount, allowance)
        assert is_le = 1
        let (new_allowance : Uint256) = uint256_sub(allowance, amount)
        _allowances.write(account, caller, new_allowance)

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
  }(recipient : felt, amount : Uint256) -> (res : felt):
    let (caller) = get_caller_address()
    _transfer(caller, recipient, amount)

    return (res=1)
end

@external
func transfer_from{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr,
    bitwise_ptr : BitwiseBuiltin*
  }(sender : felt, recipient : felt, amount : Uint256) -> (res : felt):
    alloc_locals

    let (local caller) = get_caller_address()

    _transfer(sender, recipient, amount)

    if caller != sender:
      let (allowance : Uint256) = _allowances.read(sender, caller)
      let MAX = Uint256(low=ALL_ONES, high=ALL_ONES)
      let (local max_allowance) = uint256_eq(allowance, MAX)
      if max_allowance == 0:
        let (is_le) = uint256_le(amount, allowance)
        assert is_le = 1
        let (new_allowance: Uint256) = uint256_sub(allowance, amount)

        _allowances.write(sender, caller, new_allowance)

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

    return (res=1)
end

@external
func approve{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(spender: felt, amount : Uint256) -> (res : felt):

    uint256_check(amount)
    let (caller) = get_caller_address()
    _approve(caller, spender, amount)

    return (res=1)
end

@external
func increase_allowance{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr,
    bitwise_ptr : BitwiseBuiltin*
  }(spender : felt, amount : Uint256) -> (res : felt):
    alloc_locals

    uint256_check(amount)
    let (local caller) = get_caller_address()
    let (allowance : Uint256) = _allowances.read(caller, spender)
    let (new_allowance: Uint256, carry : felt) = uint256_add(amount, allowance)
    # check overflow
    assert carry = 0
    _approve(caller, spender, new_allowance)
    return (res=1)
end

@external
func decrease_allowance{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr,
    bitwise_ptr : BitwiseBuiltin*
  }(spender : felt, amount : Uint256) -> (res : felt):
    alloc_locals

    uint256_check(amount)
    let (local caller) = get_caller_address()
    let (local allowance : Uint256) = _allowances.read(caller, spender)
    let (is_le) = uint256_le(amount, allowance)
    assert is_le = 1
    let (new_allowance : Uint256) = uint256_sub(allowance, amount)
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

    # check valid amount
    uint256_check(amount)

    assert_not_zero(recipient)
    let (contract_address) = get_contract_address()
    assert_not_equal(recipient, contract_address)

    # decrease sender balance
    let (local sender_balance : Uint256) = _balances.read(sender)
    let (is_le) = uint256_le(amount, sender_balance)
    assert is_le = 1
    let (local new_balance: Uint256) = uint256_sub(sender_balance, amount)
    _balances.write(sender, new_balance)

    # increase recipient balance
    let (local recipient_balance : Uint256) = _balances.read(recipient)
    let (local sum : Uint256, carry : felt) = uint256_add(recipient_balance, amount)
    assert carry = 0
    _balances.write(recipient, sum)

    return ()
end

func _approve{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(caller: felt, spender: felt, amount: Uint256):
    assert_not_zero(spender)
    _allowances.write(caller, spender, amount)
    return ()
end
