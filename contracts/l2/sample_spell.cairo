%lang starknet
%builtins pedersen range_check

from starkware.cairo.common.cairo_builtins import HashBuiltin
from starkware.cairo.common.math import assert_nn_le, assert_not_equal
from starkware.starknet.common.syscalls import get_caller_address
from starkware.cairo.common.uint256 import Uint256

@contract_interface
namespace IDAI:
  func mint(account: felt, amount: Uint256) -> ():
  end
end

@storage_var
func _dai() -> (res : felt):
end

@storage_var
func _user() -> (res : felt):
end

@constructor
func constructor{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(dai : felt, user : felt):
    _dai.write(dai)
    _user.write(user)

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
    let amount = Uint256(low=10, high=0)
    IDAI.mint(contract_address=dai, account=user, amount=amount)

    return ()
end
