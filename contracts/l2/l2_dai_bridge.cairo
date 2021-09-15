%lang starknet
%builtins pedersen range_check

from starkware.cairo.common.alloc import alloc
from starkware.starknet.common.messages import send_message_to_l1
from starkware.starknet.common.storage import Storage
from starkware.cairo.common.cairo_builtins import HashBuiltin
from starkware.cairo.common.math import assert_le

@contract_interface
namespace IDAI:
    func mint(to_address : felt, value : felt):
    end

    func burn(from_address : felt, value : felt):
    end
end

@storage_var
func dai() -> (res : felt):
end

@storage_var
func bridge() -> (res : felt):
end

@storage_var
func l1_messages() -> (res : felt):
end


@external
func initialize{storage_ptr : Storage*, pedersen_ptr : HashBuiltin*, range_check_ptr}(
    _dai : felt, _bridge : felt, enable_l1_messages : felt):
    let (dai_address) = dai.read()
    let (bridge_address) = bridge.read()
    assert dai_address = 0
    assert bridge_address = 0
    dai.write(_dai)
    bridge.write(_bridge)

    assert_le(enable_l1_messages, 1)
    l1_messages.write(enable_l1_messages)

    return ()
end

@external
func withdraw{syscall_ptr : felt*, storage_ptr : Storage*, pedersen_ptr : HashBuiltin*, range_check_ptr}(
        from_address : felt, to_address : felt, amount : felt):
    alloc_locals
    let (dai_address) = dai.read()
    IDAI.burn(contract_address=dai_address, from_address=from_address, value=amount)

    # temporary l1 message check
    let (enable_l1_messages: felt) = l1_messages.read()
    if enable_l1_messages == 0:
      return ()
    else:
      # Send the withdrawal message.
      let (payload : felt*) = alloc()
      assert payload[0] = from_address
      assert payload[1] = to_address
      assert payload[2] = amount
      let (bridge_address) = bridge.read()

      send_message_to_l1(to_address=bridge_address, payload_size=3, payload=payload)
      return ()
    end
end

@l1_handler
func finalizeDeposit{syscall_ptr : felt*, storage_ptr : Storage*, pedersen_ptr : HashBuiltin*, range_check_ptr}(
        from_address : felt, to_address : felt, amount : felt):
    let (dai_address) = dai.read()
    IDAI.mint(contract_address=dai_address, to_address=to_address, value=amount)
    return ()
end
