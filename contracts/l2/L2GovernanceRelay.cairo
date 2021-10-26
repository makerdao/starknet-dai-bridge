%lang starknet
%builtins pedersen range_check

from starkware.starknet.common.storage import Storage
from starkware.cairo.common.cairo_builtins import HashBuiltin
from starkware.cairo.common.math import assert_nn_le, assert_not_equal
from starkware.starknet.common.syscalls import call_contract


@contract_interface
namespace IAuth:
  func rely(user : felt) -> ():
  end

  func deny(user : felt) -> ():
  end
end

@storage_var
func l1_governance_relay() -> (res : felt):
end

@storage_var
func dai() -> (res : felt):
end

@storage_var
func bridge() -> (res : felt):
end

@storage_var
func initialized() -> (res : felt):
end

@external
func initialize{
    syscall_ptr : felt*,
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(_l1_governance_relay : felt, _dai : felt, _bridge : felt):
    let (_initialized) = initialized.read()
    assert _initialized = 0
    initialized.write(1)

    l1_governance_relay.write(_l1_governance_relay)
    dai.write(_dai)
    bridge.write(_bridge)

    return ()
end

# external is temporary
@external
@l1_handler
func rely{
    syscall_ptr : felt*,
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  } (from_address : felt, target : felt):
    let (l1_governance_relay_address) = l1_governance_relay.read()
    assert l1_governance_relay_address = from_address

    let (dai_address) = dai.read()
    let (bridge_address) = bridge.read()
    IAuth.rely(contract_address=dai_address, user=target)
    IAuth.rely(contract_address=bridge_address, user=target)

    return ()
end

# external is temporary
@external
@l1_handler
func deny{
    syscall_ptr : felt*,
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  } (from_address : felt, target : felt):
    let (l1_governance_relay_address) = l1_governance_relay.read()
    assert l1_governance_relay_address = from_address

    let (dai_address) = dai.read()
    let (bridge_address) = bridge.read()
    IAuth.deny(contract_address=dai_address, user=target)
    IAuth.deny(contract_address=bridge_address, user=target)

    return ()
end

# external is temporary
@external
@l1_handler
func relay{
    syscall_ptr : felt*,
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  } (
    from_address : felt,
    target : felt,
    selector : felt,
    calldata_len : felt,
    calldata : felt*
  ):
    let (l1_governance_relay_address) = l1_governance_relay.read()
    assert l1_governance_relay_address = from_address

    call_contract(
      contract_address=target,
      function_selector=selector,
      calldata_size=calldata_len,
      calldata=calldata
    )

    return ()
end
