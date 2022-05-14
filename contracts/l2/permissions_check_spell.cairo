%lang starknet

from starkware.cairo.common.cairo_builtins import HashBuiltin
from starkware.starknet.common.syscalls import get_contract_address

@contract_interface
namespace WardsLike:
    func wards(user : felt) -> (res : felt):
    end
end

@external
func execute{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }():

  let dai = 0x00da114221cb83fa859dbdb4c44beeaa0bb37c7537ad5ae66fe5e0efd20e6eb3
  let l2_dai_bridge = 0x001108cdbe5d82737b9057590adaf97d34e74b5452f0628161d237746b6fe69e
  let (contract_address) = get_contract_address()

  let (is_dai_ward) = WardsLike.wards(dai, contract_address)
  assert is_dai_ward = 1

  let (is_l2_dai_bridge) = WardsLike.wards(l2_dai_bridge, contract_address)
  assert is_l2_dai_bridge = 1

  return ()
end
