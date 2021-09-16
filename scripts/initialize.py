import os
import json

artifacts_dir = 'artifacts/contracts'
deployments_dir = 'deployments/starknet'

with open('./{0}/dai.json'.format(deployments_dir), 'r') as f:
    dai_address = json.load(f)['address']

with open('./deployments/goerli/L1DAITokenBridge.json', 'r') as f:
    l1_bridge_address = json.load(f)['address']

print('Initializing L2 DAI bridge contract with parameters:')
print(' L1 Bridge Address:', l1_bridge_address)
print(' DAI Address:', dai_address)
print()
stream = os.popen('python ./scripts/interact.py invoke l2_dai_bridge initialize \
        {0} {1} {2}'.format(dai_address, l1_bridge_address, 0))
output = stream.read()
print(output)
