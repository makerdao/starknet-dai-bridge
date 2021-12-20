#!/usr/bin/env python3

from starkware.starknet.services.api.gateway.contract_address import calculate_contract_address
from starkware.starknet.services.api.contract_definition import ContractDefinition
import json
import os
import marshmallow_dataclass
import multiprocessing as mp
import random

def build_salt_to_address(contract, calldata, caller):
    return lambda salt: calculate_contract_address(
        salt, contract, calldata, caller
    )

def main():
    random.seed(31415)

    contract_schema = marshmallow_dataclass.class_schema(ContractDefinition)()

    file = './starknet-artifacts/contracts/l2/dai.cairo/dai.json'

    dai = contract_schema.load(json.load(open(file)))
    calldata = [123]
    caller = 0

    salt_to_address = build_salt_to_address(dai, calldata, caller)


    print('Searching for vanity address...')

    i = 1

    while True:
        salt = random.getrandbits(251)
        address = salt_to_address(salt)
        prefix = hex(address)[2:5]
        print(i, ':', prefix, end=',', flush=True)
        if (prefix == 'da1'):
            print()
            print(salt, address, hex(address))
            return
        i += 1


main()