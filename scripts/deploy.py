import os
import sys
import re


def main():
    assert len(sys.argv) == 2

    cwd = os.getcwd()
    directory = os.path.abspath("%s/l2" % (cwd))
    os.chdir(directory)
    contract_name = sys.argv[1]

    print("Compiling...\n")
    stream = os.popen("starknet-compile ./%s.cairo \
                      --output ./%s.json \
                      --abi ./%s_abi.json" %
                      (contract_name, contract_name, contract_name))

    print("Deploying...\n")
    stream = os.popen("starknet deploy --contract ./%s.json" %
                      (contract_name))
    output = stream.read()
    print(output)

    assert output is not None

    match = re.search("(?<=Contract address: ).*", output)
    with open("./%s_address.txt" % (contract_name), 'w') as f:
        f.write(match.group(0))
