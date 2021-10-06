import os
import sys
import re
import json

artifacts_dir = 'artifacts/contracts/l2'
deployments_dir = 'deployments/starknet'
contracts_dir = 'contracts/l2'

assert len(sys.argv) == 2

contract_name = sys.argv[1]

if not os.path.exists(artifacts_dir):
    os.makedirs(artifacts_dir)
if not os.path.exists(deployments_dir):
    os.makedirs(deployments_dir)

print(os.getcwd())
print('Compiling...\n')
contract_file = './{0}/{1}.cairo'.format(contracts_dir, contract_name)
output_file = './{0}/{1}.json'.format(artifacts_dir, contract_name)
abi_file = './{0}/{1}_abi.json'.format(artifacts_dir, contract_name)
stream = os.popen('starknet-compile {0} \
                  --output {1} \
                  --abi {2}'.format(
                      contract_file,
                      output_file,
                      abi_file,
                ))
output = stream.read()