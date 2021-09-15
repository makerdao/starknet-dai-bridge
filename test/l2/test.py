import os
import pytest
import asyncio

from starkware.starknet.compiler.compile import (
    compile_starknet_files)
from starkware.starknet.testing.starknet import Starknet
from starkware.starknet.testing.contract import StarknetContract
from starkware.starkware_utils.error_handling import StarkException

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

# both user addresses will be incremented by 2
user1 = 0
user2 = 1


async def check_balances(
    expected_user1_balance,
    expected_user2_balance,
):
    # burn_balance = await dai_contract.balanceOf(burn).call()
    user1_balance = await dai_contract.balanceOf(user1).call()
    user2_balance = await dai_contract.balanceOf(user2).call()

    # assert burn_balance == (expected_burn_balance,)
    assert user1_balance == (expected_user1_balance,)
    assert user2_balance == (expected_user2_balance,)


async def check_no_funds():
    no_funds_balance = await dai_contract.balanceOf(no_funds).call()

    assert no_funds_balance == (0,)


@pytest.fixture(scope="function", autouse=True)
async def before_each():
    # intialize two users with 100 DAI
    global user1
    global user2
    user1 += 2
    user2 += 2
    await dai_contract.mint(user1, 100).invoke()
    await dai_contract.mint(user2, 100).invoke()


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
        _bridge=2,
        enable_l1_messages=0,
    ).invoke()
    # initialize the burn address with 100 DAI
    await dai_contract.mint(burn, 100).invoke()


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
    await bridge_contract.withdraw(
        from_address=user1,
        to_address=user2,
        amount=10).invoke()

    # check DAI contract balances
    # user2 should be unaffected as the withdraw goes to the burn address
    await check_balances(90, 100)
    # check l1 message?


@pytest.mark.asyncio
async def test_finalize_deposit():
    # disabled until l1 messages can be sent
    '''
    await bridge_contract.finalizeDeposit(
        from_address=user1,
        to_address=user2,
        amount=10)

    # check DAI contract balances
    # user1 should be unaffected as the deposit goes from the burn address
    check_balances(100, 90)
    '''
    pass


@pytest.mark.asyncio
async def test_mint():
    await dai_contract.mint(to_address=user1, value=10).invoke()

    await check_balances(110, 100)


@pytest.mark.asyncio
async def test_burn():
    await dai_contract.burn(from_address=user1, value=10).invoke()

    await check_balances(90, 100)


@pytest.mark.asyncio
async def test_burn_insufficient_funds():
    with pytest.raises(StarkException):
        await dai_contract.burn(from_address=no_funds, value=10).invoke()

    await check_balances(100, 100)
    await check_no_funds()


@pytest.mark.asyncio
async def test_withdraw_insufficient_funds():
    with pytest.raises(StarkException):
        await bridge_contract.withdraw(
            from_address=no_funds,
            to_address=user2,
            amount=10).invoke()

    await check_balances(100, 100)
    await check_no_funds()
