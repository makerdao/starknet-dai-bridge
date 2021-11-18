%lang starknet
%builtins pedersen range_check

from starkware.cairo.common.cairo_builtins import HashBuiltin
from starkware.cairo.common.math import assert_nn_le, assert_not_equal
from starkware.starknet.common.syscalls import delegate_call
from starkware.cairo.common.alloc import alloc

const EXECUTE_SELECTOR = 1017745666394979726211766185068760164586829337678283062942418931026954492996

@contract_interface
namespace IAuth:
    func rely(user : felt) -> ():
    end

    func deny(user : felt) -> ():
    end
end

@contract_interface
namespace ISpell:
  func execute() -> ():
  end
end

@storage_var
func _l1_governance_relay() -> (res : felt):
end

@constructor
func constructor{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(l1_governance_relay : felt):
    _l1_governance_relay.write(l1_governance_relay)

    return ()
end

@l1_handler
func relay{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(
    from_address : felt,
    target : felt
  ):
    let (l1_governance_relay) = _l1_governance_relay.read()
    assert l1_governance_relay = from_address

    let (calldata : felt*) = alloc()
    delegate_call(target, EXECUTE_SELECTOR, 0, calldata)

    return ()
end
