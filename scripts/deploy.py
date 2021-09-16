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

print('Deploying...\n')
stream = os.popen('starknet deploy --contract {0}'.format(
                  output_file))
output = stream.read()
print(output)

assert output is not None

with open(abi_file, 'r') as f:
    abi = json.load(f)

match = re.search('(?<=Contract address: ).*', output)
address_file = './{0}/{1}.json'.format(deployments_dir, contract_name)
with open(address_file, 'w') as f:
    json.dump({'address': match.group(0), 'abi': abi}, f)
