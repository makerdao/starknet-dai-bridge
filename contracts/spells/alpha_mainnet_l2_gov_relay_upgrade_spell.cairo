%lang starknet

from starkware.cairo.common.cairo_builtins import HashBuiltin
from starkware.starknet.common.syscalls import get_caller_address

@contract_interface
namespace HasWards {
    func rely(user: felt) {
    }
    func deny(user: felt) {
    }
}

@external
func execute{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}() {
    const dai = 0x00da114221cb83fa859dbdb4c44beeaa0bb37c7537ad5ae66fe5e0efd20e6eb3;
    const bridge = 0x075ac198e734e289a6892baa8dd14b21095f13bf8401900f5349d5569c3f6e60;
    const bridge_legacy = 0x001108cdbe5d82737b9057590adaf97d34e74b5452f0628161d237746b6fe69e;
    const teleport_gateway = 0x05b20d8c7b85456c07bdb8eaaeab52a6bf3770a586af6da8d3f5071ef0dcf234;
    const new_gov_relay = 0x05f4d9b039f82e9a90125fb119ace0531f4936ff2a9a54a8598d49a4cd4bd6db;

    // rely new_gov_relay on dai, current bridge, teleport_gateway
    HasWards.rely(dai, new_gov_relay);
    HasWards.rely(bridge, new_gov_relay);
    HasWards.rely(bridge_legacy, new_gov_relay);
    HasWards.rely(teleport_gateway, new_gov_relay);
    
    // old gov relay will be denied in the following spell

    return ();
}