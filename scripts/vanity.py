#!/usr/bin/env python3

from starkware.starknet.services.api.gateway.contract_address import calculate_contract_address
from starkware.starknet.services.api.contract_definition import ContractDefinition
import json
import marshmallow_dataclass
import multiprocessing as mp
import random
import argparse
import datetime
import sys

def build_salt_to_address(contract, calldata, caller):
    return lambda salt: calculate_contract_address(
        salt, contract, calldata, caller
    )

def main():

    parser = argparse.ArgumentParser(description='Find salt for DAI deplyment that results with contract address with prefix = da1')
    parser.add_argument('--ward', type=lambda x: int(x, 0))
    parser.add_argument('--start_from', type=int, default=1)
    parser.add_argument('--seed', type=int, default=random.randrange(sys.maxsize))

    start_from = parser.parse_args().start_from

    ward = parser.parse_args().ward

    seed = parser.parse_args().seed
    random.seed(seed)

    contract_schema = marshmallow_dataclass.class_schema(ContractDefinition)()

    file = './starknet-artifacts/contracts/l2/dai.cairo/dai.json'

    dai = contract_schema.load(json.load(open(file)))
    calldata = [ward]
    caller = 0

    salt_to_address = build_salt_to_address(dai, calldata, caller)

    started = datetime.datetime.now()

    for i in range(start_from ):
        random.getrandbits(251)

    i = i + 1

    print('Searching for vanity address...')
    print('with calldata =', calldata)
    print('seed:', seed)
    print('starting from:', i)

    prefixes = set()

    while True:
        salt = random.getrandbits(251)
        address = salt_to_address(salt)
        prefix = hex(address)[2:5]
        prefixes.add(prefix)
        print( f'{i}:{prefix}({"{:.2%}".format(len(prefixes)/4096)})\033[K', flush=True, end='\r')
        if (prefix == 'da1'):
            print()
            print('Found salt!')
            print('\tstarted from:', start_from)
            print('\titerations:', i - start_from + 1)
            print('\tprefixes:', len(prefixes))
            print('\twhich took:', datetime.datetime.now() - started)
            print('\tsalt:', hex(salt))
            print('\tcalldata', calldata)
            print('\tdai address:', hex(address))
            return
        i += 1

main()
