%lang starknet
%builtins pedersen range_check

from starkware.cairo.common.cairo_builtins import HashBuiltin
from starkware.cairo.common.math import assert_nn_le, assert_not_equal
from starkware.starknet.common.syscalls import get_caller_address

@contract_interface
namespace IDAI:
  func mint(to_address: felt, amount: felt) -> ():
  end
end

@storage_var
func _dai() -> (res : felt):
end

@storage_var
func _user() -> (res : felt):
end

@storage_var
func _initialized() -> (res : felt):
end

@external
func initialize{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(dai : felt, user : felt):
    let (initialized) = _initialized.read()
    assert initialized = 0
    _dai.write(dai)
    _user.write(user)
    _initialized.write(1)

    return ()
end

@external
func execute{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }():
    let (dai) = _dai.read()
    let (user) = _user.read()
    IDAI.mint(contract_address=dai, to_address=user, amount=10)

    return ()
end
