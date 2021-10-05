import os
import json
import pytest
import asyncio

from starkware.starknet.compiler.compile import (
    compile_starknet_files)
from starkware.starknet.testing.starknet import Starknet
from starkware.starknet.testing.contract import StarknetContract
from starkware.starkware_utils.error_handling import StarkException
from starkware.starknet.public.abi import get_selector_from_name

'''
from web3 import Web3, HTTPProvider
w3 = Web3(HTTPProvider('http://127.0.0.1:8545'))
'''

# The path to the contract source code.
L2_CONTRACTS_DIR = os.path.join(
        os.getcwd(), "contracts/l2")


class Contract():
    @classmethod
    async def before(self, contract_name):
        self.CONTRACT_FILE = os.path.join(
            L2_CONTRACTS_DIR, contract_name)
        await self.before_all(self)
        return self.contract

    def compile(self):
        return compile_starknet_files(
            [self.CONTRACT_FILE], debug_info=True)

    async def before_all(self):
        await self.deploy(self)

    async def deploy(self):
        contract_definition = self.compile(self)

        starknet = await Starknet.empty()

        contract_address = await starknet.deploy(
            contract_definition=contract_definition)
        self.contract = StarknetContract(
            starknet=starknet,
            abi=contract_definition.abi,
            contract_address=contract_address,
        )


async def initialize():
    global starknet
    starknet = await Starknet.empty()


async def deploy(contract_name):
    CONTRACT_FILE = os.path.join(L2_CONTRACTS_DIR, contract_name)

    contract_definition = compile_starknet_files(
            [CONTRACT_FILE],
            debug_info=True)

    contract_address = await starknet.deploy(
        contract_definition=contract_definition)
    contract = StarknetContract(
        starknet=starknet,
        abi=contract_definition.abi,
        contract_address=contract_address,
    )
    return contract


starknet = None
bridge_contract = None
dai_contract = None

# constant addresses
burn = 0
no_funds = 1
burn_balance = 0

user1 = None
user2 = None
user3 = None

'''
L1_DEPLOYMENTS_DIR = os.path.join(
        os.getcwd(), 'deployments/localhost')
with open(L1_DEPLOYMENTS_DIR + '/Starknet.json') as f:
    starknet_contract_json = json.load(f)
starknet_contract_address = starknet_contract_json['address']
starknet_contract_abi = starknet_contract_json['abi']
starknet_contract = w3.eth.contract(
    address=starknet_contract_address)
'''
starknet_contract_address = '0x0'


###########
# HELPERS #
###########
async def check_balances(
    expected_burn_balance,
    expected_user1_balance,
    expected_user2_balance,
):
    burn_balance = await dai_contract.balanceOf(burn).call()
    user1_balance = await dai_contract.balanceOf(user1.contract_address).call()
    user2_balance = await dai_contract.balanceOf(user2.contract_address).call()
    total_supply = await dai_contract.totalSupply().call()

    assert burn_balance == (expected_burn_balance,)
    assert user1_balance == (expected_user1_balance,)
    assert user2_balance == (expected_user2_balance,)
    assert total_supply == (expected_user1_balance+expected_user2_balance,)


async def check_no_funds():
    no_funds_balance = await dai_contract.balanceOf(no_funds).call()

    assert no_funds_balance == (0,)


async def call_from(call, user):
    selector = get_selector_from_name(call.function_abi['name'])
    res = await user.execute(
        call.contract_address,
        selector,
        call.calldata,
    ).invoke()
    return res


@pytest.fixture(scope="session")
def event_loop():
    return asyncio.get_event_loop()


@pytest.fixture(scope="session", autouse=True)
async def before_all():
    await initialize()
    global bridge_contract
    global dai_contract
    bridge_contract = await deploy("l2_dai_bridge.cairo")
    dai_contract = await deploy("dai.cairo")
    await bridge_contract.initialize(
        _dai=dai_contract.contract_address,
        _bridge=int(starknet_contract_address, 16),
    ).invoke()

    global user1
    global user2
    global user3
    global user1_account
    global user2_account
    global user3_account
    user1 = await deploy("Account.cairo")
    user2 = await deploy("Account.cairo")
    user3 = await deploy("Account.cairo")

    # change to L1 addresses
    await user1.initialize(0, user1.contract_address).invoke()
    await user2.initialize(0, user2.contract_address).invoke()
    await user3.initialize(0, user3.contract_address).invoke()


@pytest.fixture(scope="function", autouse=True)
async def for_each():
    # before each
    # intialize two users with 100 DAI
    global burn_balance
    global user1_balance
    global user2_balance

    await dai_contract.mint(user1.contract_address, 100).invoke()
    await dai_contract.mint(user2.contract_address, 100).invoke()

    balance = await dai_contract.balanceOf(0).call()
    burn_balance = balance[0]
    balance = await dai_contract.balanceOf(user1.contract_address).call()
    user1_balance = balance[0]
    print(user1_balance)
    balance = await dai_contract.balanceOf(user2.contract_address).call()
    user2_balance = balance[0]


#######
# DAI #
#######
@pytest.mark.asyncio
async def test_total_supply():
    total_supply = await dai_contract.totalSupply().call()

    assert total_supply == (200,)


@pytest.mark.asyncio
async def test_balance_of():
    balance = await dai_contract.balanceOf(user1.contract_address).call()

    assert balance == (user1_balance,)


@pytest.mark.asyncio
async def test_transfer():
    call = dai_contract.transfer(user2.contract_address, 10)
    await call_from(call, user1)

    await check_balances(
        burn_balance,
        user1_balance-10,
        user2_balance+10)


@pytest.mark.asyncio
async def test_transfer_to_yourself():
    call = dai_contract.transfer(user1.contract_address, 10)
    await call_from(call, user1)

    await check_balances(burn_balance, user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_transfer_from():
    call = dai_contract.approve(user3.contract_address, 10)
    await call_from(call, user1)
    call2 = dai_contract.transferFrom(
        user1.contract_address,
        user2.contract_address,
        10)
    await call_from(call2, user3)

    await check_balances(
        burn_balance,
        user1_balance-10,
        user2_balance+10)


@pytest.mark.asyncio
async def test_transfer_to_yourself_using_transfer_from():
    with pytest.raises(StarkException):
        call = dai_contract.transferFrom(
            user1.contract_address,
            user2.contract_address,
            10)
        await call_from(call, user1)

    await check_balances(burn_balance, user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_should_not_transfer_beyond_balance():
    with pytest.raises(StarkException):
        call = dai_contract.transfer(user2.contract_address, user1_balance+1)
        await call_from(call, user1)

    await check_balances(burn_balance, user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_should_not_transfer_to_zero_address():
    with pytest.raises(StarkException):
        await dai_contract.transfer(burn, 10).invoke()

    await check_balances(burn_balance, user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_should_not_transfer_to_dai_address():
    '''
    with pytest.raises(StarkException):
        await dai_contract.transfer(dai_contract.contract_address, 10).invoke()

    await check_balances(burn_balance, user1_balance, user2_balance)
    '''
    pass


@pytest.mark.asyncio
async def test_mint():
    await dai_contract.mint(user1.contract_address, 10).invoke()

    await check_balances(burn_balance, user1_balance+10, user2_balance)


@pytest.mark.asyncio
async def test_should_not_allow_minting_to_zero_address():
    with pytest.raises(StarkException):
        await dai_contract.mint(burn, 10).invoke()

    await check_balances(burn_balance, user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_should_not_allow_minting_to_dai_address():
    pass
    '''
    with pytest.raises(StarkException):
        await dai_contract.mint(
                dai_contract.contract_address,
                10,
            ).invoke()

    await check_balances(burn_balance, user1_balance, user2_balance)
    '''


@pytest.mark.asyncio
async def test_should_not_allow_minting_to_address_beyond_max():
    # not implemented
    pass


@pytest.mark.asyncio
async def test_burn():
    call = dai_contract.burn(user1.contract_address, 10)
    await call_from(call, user1)

    await check_balances(burn_balance+10, user1_balance-10, user2_balance)


@pytest.mark.asyncio
async def test_should_not_burn_beyond_balance():
    with pytest.raises(StarkException):
        call = dai_contract.burn(user1.contract_address, user1_balance+1)
        await call_from(call, user1)

    await check_balances(burn_balance, user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_should_not_burn_other():
    with pytest.raises(StarkException):
        call = dai_contract.burn(user1.contract_address, 10)
        await call_from(call, user2)

    await check_balances(burn_balance, user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_deployer_can_burn_other():
    # not implemented
    pass


@pytest.mark.asyncio
async def test_approve():
    call = dai_contract.approve(user2.contract_address, 10)
    await call_from(call, user1)

    allowance = await dai_contract.allowance(
        user1.contract_address,
        user2.contract_address).call()

    assert allowance == (10,)


@pytest.mark.asyncio
async def test_can_burn_other_if_approved():
    call = dai_contract.approve(user2.contract_address, 10)
    await call_from(call, user1)

    call2 = dai_contract.burn(user1.contract_address, 10)
    await call_from(call2, user2)

    await check_balances(burn_balance+10, user1_balance-10, user2_balance)


@pytest.mark.asyncio
async def test_approve_to_increase_allowance_with_permit():
    # not implemented
    pass


@pytest.mark.asyncio
async def test_does_not_approve_with_expired_permit():
    # not implemented
    pass


@pytest.mark.asyncio
async def test_does_not_approve_with_invalid_permit():
    # not implemented
    pass


@pytest.mark.asyncio
async def test_transfer_using_transfer_from_and_allowance():
    call = dai_contract.approve(user3.contract_address, 10)
    await call_from(call, user1)

    call2 = dai_contract.transferFrom(
        user1.contract_address,
        user2.contract_address,
        10)
    await call_from(call2, user3)

    await check_balances(burn_balance, user1_balance-10, user2_balance+10)


@pytest.mark.asyncio
async def test_should_not_transfer_beyond_allowance():
    call = dai_contract.approve(user3.contract_address, 10)
    await call_from(call, user1)

    with pytest.raises(StarkException):
        call2 = dai_contract.transferFrom(
            user1.contract_address,
            user2.contract_address,
            20)
        await call_from(call2, user3)

    await check_balances(burn_balance, user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_burn_using_burn_and_allowance():
    call = dai_contract.approve(user2.contract_address, 10)
    await call_from(call, user1)

    call2 = dai_contract.burn(user1.contract_address, 10)
    await call_from(call2, user2)

    await check_balances(burn_balance+10, user1_balance-10, user2_balance)


@pytest.mark.asyncio
async def test_should_not_burn_beyond_allowance():
    call = dai_contract.approve(user2.contract_address, 10)
    await call_from(call, user1)

    call2 = dai_contract.burn(user1.contract_address, 20)
    with pytest.raises(StarkException):
        await call_from(call2, user2)

    await check_balances(burn_balance, user1_balance, user2_balance)


##########
# Bridge #
##########
@pytest.mark.asyncio
async def test_second_initialize():
    # expect failure
    with pytest.raises(Exception):
        await bridge_contract.initialize(
            _dai=3,
            _bridge=4,
            enable_l1_messages=0,
        ).invoke()


@pytest.mark.asyncio
async def test_withdraw():
    '''
    call = bridge_contract.withdraw(
        l2_address=user1.contract_address,
        l1_address=user2.contract_address,
        amount=10)
    await call_from(call, user1)

    # check DAI contract balances
    # user2 should be unaffected as the withdraw goes to the burn address
    await check_balances(burn_balance+10, user1_balance-10, user2_balance)
    # check l1 message?
    '''
    pass


@pytest.mark.asyncio
async def test_withdraw_insufficient_funds():
    with pytest.raises(StarkException):
        await bridge_contract.withdraw(
            l2_address=no_funds,
            l1_address=user2.contract_address,
            amount=10).invoke()

    await check_balances(burn_balance, user1_balance, user2_balance)
    await check_no_funds()


#############
# Workflows #
#############
@pytest.mark.asyncio
async def test_finalize_deposit():
    await bridge_contract.finalizeDeposit(
        from_address=int(starknet_contract_address, 16),
        l2_address=user2.contract_address,
        amount=10).invoke()

    # user1 should be unaffected as the new coin is minted
    await check_balances(burn_balance, user1_balance, user2_balance+10)
