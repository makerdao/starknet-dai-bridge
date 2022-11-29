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
    const dai = 0x03e85bfbb8e2a42b7bead9e88e9a1b19dbccf661471061807292120462396ec9;
    const bridge = 0x057b7fe4e59d295de5e7955c373023514ede5b972e872e9aa5dcdf563f5cfacb;
    const bridge_legacy = 0x2b39999f94aade79f201008592854b2d0547b4abe31a10a92e5f6cfd7ccfc32;
    const teleport_gateway = 0x078e1e7cc88114fe71be7433d1323782b4586c532a1868f072fc44ce9abf6714;
    const new_gov_relay = 0x00275e3f018f7884f449a1fb418b6b1de77e01c74a9fefaed1599cb22322ff74;

    // rely new_gov_relay on dai, current bridge, teleport_gateway
    HasWards.rely(dai, new_gov_relay);
    HasWards.rely(bridge, new_gov_relay);
    HasWards.rely(bridge_legacy, new_gov_relay);
    HasWards.rely(teleport_gateway, new_gov_relay);

    // old gov relay will be denied in the following spell

    return ();
}