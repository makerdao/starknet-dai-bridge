import os
import sys


def main():
    assert len(sys.argv) >= 3

    func_type = sys.argv[1].lower()
    assert (func_type == 'invoke' or func_type == 'call')

    call = sys.argv[2].split('.')
    assert len(call) == 2
    (contract_name, func) = call

    inputs = sys.argv[3:]

    cwd = os.getcwd()
    directory = os.path.abspath("%s/l2" % (cwd))
    os.chdir(directory)
    with open("./%s_address.txt" % (contract_name), 'r') as f:
        CONTRACT_ADDRESS = f.read()

    stream = os.popen("starknet %s --address %s \
            --abi ./%s_abi.json \
            --function %s \
            --inputs %s" %
                      (
                        func_type,
                        CONTRACT_ADDRESS,
                        contract_name,
                        func,
                        ' '.join(inputs)))
    output = stream.read()
    print(output)
