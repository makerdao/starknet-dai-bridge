%lang starknet

    from starkware.cairo.common.cairo_builtins import HashBuiltin
    from starkware.starknet.common.syscalls import get_caller_address

    @contract_interface
    namespace DAI {
        func rely(user: felt) {
        }
    }

    @contract_interface
    namespace Bridge {
        func close() {
        }
    }

    @external
    func execute{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}() {
        let dai = 0x00da114221cb83fa859dbdb4c44beeaa0bb37c7537ad5ae66fe5e0efd20e6eb3;
        let new_bridge = 0x075ac198e734e289a6892baa8dd14b21095f13bf8401900f5349d5569c3f6e60;
        let old_bridge = 0x001108cdbe5d82737b9057590adaf97d34e74b5452f0628161d237746b6fe69e;

        DAI.rely(dai, new_bridge);
        Bridge.close(old_bridge);

        return ();
    }