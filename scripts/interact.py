import os
import sys


artifacts_dir = 'artifacts/contracts/l2'

assert len(sys.argv) >= 4

func_type = sys.argv[1].lower()
assert (func_type == 'invoke' or func_type == 'call')

contract_name = sys.argv[2]
func = sys.argv[3]

inputs = sys.argv[4:]

address_file = './{0}/{1}_address.txt'.format(artifacts_dir, contract_name)
abi_file = './{0}/{1}_abi.json'.format(artifacts_dir, contract_name)

with open(address_file, 'r') as f:
    CONTRACT_ADDRESS = f.read()

stream = os.popen('starknet {0} --address {1} \
        --abi {2} \
        --function {3} \
        --inputs {4}'.format(
                    func_type,
                    CONTRACT_ADDRESS,
                    abi_file,
                    func,
                    ' '.join(inputs)))
output = stream.read()
print(output)
