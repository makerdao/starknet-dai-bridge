#!/usr/bin/env python3

from starkware.starknet.services.api.gateway.contract_address import calculate_contract_address
from starkware.starknet.services.api.contract_definition import ContractDefinition
import json
import marshmallow_dataclass
import multiprocessing as mp
import random
import argparse

def build_salt_to_address(contract, calldata, caller):
    return lambda salt: calculate_contract_address(
        salt, contract, calldata, caller
    )

def main():

    parser = argparse.ArgumentParser(description='Find salt for DAI deplyment that results with contract address with prefix = da1')
    parser.add_argument('--ward', type=lambda x: int(x, 0))
    parser.add_argument('--start_from', type=int, default=1)

    ward = parser.parse_args().ward
    start_from = parser.parse_args().start_from

    random.seed(31415)

    contract_schema = marshmallow_dataclass.class_schema(ContractDefinition)()

    file = './starknet-artifacts/contracts/l2/dai.cairo/dai.json'

    dai = contract_schema.load(json.load(open(file)))
    calldata = [ward]
    caller = 0

    salt_to_address = build_salt_to_address(dai, calldata, caller)

    for i in range(start_from):
        random.getrandbits(251)

    i += 1

    print('Searching for vanity address...')
    print('starting from:', i)
    print('with calldata =', calldata)

    while True:
        salt = random.getrandbits(251)
        address = salt_to_address(salt)
        prefix = hex(address)[2:5]
        print( f'{i}:{prefix}', end=', ', flush=True)
        if (prefix == 'da1' or i == 1):
            print()
            print('Found:')
            print('salt:', hex(salt))
            print('dai address:', hex(address))
            return
        i += 1

main()