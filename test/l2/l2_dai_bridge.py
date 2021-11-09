import os
import pytest
import asyncio

from starkware.starknet.testing.starknet import Starknet
from starkware.starknet.testing.contract import StarknetContract
from starkware.starkware_utils.error_handling import StarkException


MAX = 2**120
L1_ADDRESS = 0x1

L2_CONTRACTS_DIR = os.path.join(os.getcwd(), "contracts/l2")
CONTRACT_FILE = os.path.join(L2_CONTRACTS_DIR, "l2_dai_bridge.cairo")


@pytest.fixture
async def starknet() -> Starknet:
    return await Starknet.empty()


@pytest.fixture
async def contract(starknet: Starknet) -> StarknetContract:
    return await starknet.deploy(source=CONTRACT_FILE)


dai_contract = None
registry_contract = None

burn = 0
no_funds = 1

auth_user = None
user1 = None
user2 = None
user3 = None

starknet_contract_address = 0x0


###########
# HELPERS #
###########
def to_split_uint(a):
    return (a & ((1 << 128) - 1), a >> 128)


def to_uint(a):
    return a[0] + (a[1] << 128)


async def check_balances(
    expected_user1_balance,
    expected_user2_balance,
):
    user1_balance = await dai_contract.balance_of(user1.contract_address).call()
    user2_balance = await dai_contract.balance_of(user2.contract_address).call()
    user3_balance = await dai_contract.balance_of(user3.contract_address).call()
    total_supply = await dai_contract.total_supply().call()

    assert user1_balance.result == (to_split_uint(expected_user1_balance),)
    assert user2_balance.result == (to_split_uint(expected_user2_balance),)
    assert user3_balance.result == (to_split_uint(0),)
    assert total_supply.result == (
            to_split_uint(expected_user1_balance+expected_user2_balance),)


@pytest.fixture
def event_loop():
    return asyncio.get_event_loop()


@pytest.fixture(autouse=True)
async def before_all(
    starknet: Starknet,
    contract: StarknetContract,
):
    global registry_contract
    REGISTRY_FILE = os.path.join(L2_CONTRACTS_DIR, "registry.cairo")
    registry_contract = await starknet.deploy(source=REGISTRY_FILE)

    ACCOUNT_FILE = os.path.join(L2_CONTRACTS_DIR, "account.cairo")
    global auth_user
    global user1
    global user2
    global user3
    auth_user = await starknet.deploy(source=ACCOUNT_FILE)
    user1 = await starknet.deploy(source=ACCOUNT_FILE)
    user2 = await starknet.deploy(source=ACCOUNT_FILE)
    user3 = await starknet.deploy(source=ACCOUNT_FILE)

    await registry_contract.register(
            int(L1_ADDRESS)).invoke(auth_user.contract_address)
    await registry_contract.register(
            int(L1_ADDRESS)).invoke(user1.contract_address)
    await registry_contract.register(
            int(L1_ADDRESS)).invoke(user2.contract_address)
    await registry_contract.register(
            int(L1_ADDRESS)).invoke(user3.contract_address)

    global dai_contract
    DAI_FILE = os.path.join(L2_CONTRACTS_DIR, "dai.cairo")
    dai_contract = await starknet.deploy(DAI_FILE)

    print("-------------------------------------------")
    print(contract.contract_address)
    print("-------------------------------------------")

    # TODO: replace starknet_contract_address with L1 bridge address
    await contract.initialize(
        dai_contract.contract_address,
        int(starknet_contract_address),
        registry_contract.contract_address,
        contract.contract_address,
    ).invoke(auth_user.contract_address)

    await dai_contract.initialize().invoke(auth_user.contract_address)

    await dai_contract.rely(
            contract.contract_address,
        ).invoke(auth_user.contract_address)


@pytest.fixture(autouse=True)
async def before_each():
    # intialize two users with 100 DAI
    global user1_balance
    global user2_balance

    await dai_contract.mint(
            user1.contract_address,
            to_split_uint(100)).invoke(auth_user.contract_address)
    await dai_contract.mint(
            user2.contract_address,
            to_split_uint(100)).invoke(auth_user.contract_address)

    balance = await dai_contract.balance_of(user1.contract_address).call()
    user1_balance = to_uint(balance.result[0])
    balance = await dai_contract.balance_of(user2.contract_address).call()
    user2_balance = to_uint(balance.result[0])


#########
# TESTS #
#########
@pytest.mark.asyncio
async def test_second_initialize(
    starknet: Starknet,
    contract: StarknetContract,
):
    with pytest.raises(StarkException):
        await contract.initialize(3, 4, 5, 6).invoke()


@pytest.mark.asyncio
async def test_withdraw(starknet: Starknet, contract: StarknetContract):
    '''
    await dai_contract.approve(
            contract.contract_address,
            to_split_uint(10),
        ).invoke(user1.contract_address)
    await contract.withdraw(
            user2.contract_address, to_split_uint(10)).invoke(user1.contract_address)

    await check_balances(user1_balance-10, user2_balance)
    '''
    # AWAITING FIX: CAIRO PROBLEM WITH SENDING CALL TO EXTERNAL CONTRACT
    pass


@pytest.mark.asyncio
async def test_close_should_fail_when_not_authorized(
    starknet: Starknet,
    contract: StarknetContract,
):
  with pytest.raises(Exception):
    await contract.close().invoke(user1.contract_address)


@pytest.mark.asyncio
async def test_withdraw_should_fail_when_closed(
    starknet: Starknet,
    contract: StarknetContract,
):
    await dai_contract.approve(
            contract.contract_address,
            to_split_uint(10),
        ).invoke(user1.contract_address)

    await contract.close().invoke(auth_user.contract_address)

    with pytest.raises(Exception):
        await contract.withdraw(
                user2.contract_address, to_split_uint(10)).invoke(user1.contract_address)


@pytest.mark.asyncio
async def test_withdraw_insufficient_funds(
    starknet: Starknet,
    contract: StarknetContract,
):
    with pytest.raises(StarkException):
        await contract.withdraw(
                user2.contract_address, to_split_uint(10)).invoke(user3.contract_address)
    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_finalize_deposit(
    starknet: Starknet,
    contract: StarknetContract,
):
    # TODO: replace starknet_contract_address with L1 bridge address
    '''
    await contract.finalize_deposit(
            int(starknet_contract_address),
            user2.contract_address,
            to_split_uint(10),
        ).invoke(user2.contract_address)

    await check_balances(user1_balance, user2_balance+10)
    '''
    # AWAITING FIX: CAIRO PROBLEM WITH SENDING CALL TO EXTERNAL CONTRACT
    pass


@pytest.mark.asyncio
async def test_finalize_force_withdrawal(
    starknet: Starknet,
    contract: StarknetContract,
):
    # TODO: replace starknet_contract_address with L1 bridge address
    '''
    await dai_contract.approve(
            contract.contract_address,
            to_split_uint(10),
        ).invoke(user1.contract_address)
    await contract.finalize_force_withdrawal(
            int(starknet_contract_address),
            user1.contract_address,
            int(L1_ADDRESS),
            10, 0,
        ).invoke(user1.contract_address)

    await check_balances(user1_balance-10, user2_balance)
    '''
    # AWAITING FIX: CAIRO PROBLEM WITH SENDING CALL TO EXTERNAL CONTRACT
    pass


@pytest.mark.asyncio
async def test_finalize_force_withdrawal_insufficient_funds(
    starknet: Starknet,
    contract: StarknetContract,
):
    # TODO: replace starknet_contract_address with L1 bridge address
    '''
    await dai_contract.approve(
            contract.contract_address,
            to_split_uint(10),
        ).invoke(user3.contract_address)
    await contract.finalize_force_withdrawal(
            int(starknet_contract_address),
            user3.contract_address,
            int(L1_ADDRESS),
            10, 0,
        ).invoke(user3.contract_address)

    await check_balances(user1_balance, user2_balance)
    '''
    # AWAITING FIX: CAIRO PROBLEM WITH SENDING CALL TO EXTERNAL CONTRACT
    pass


@pytest.mark.asyncio
async def test_finalize_force_withdrawal_insufficient_allowance(
    starknet: Starknet,
    contract: StarknetContract,
):
    # TODO: replace starknet_contract_address with L1 bridge address
    '''
    await contract.finalize_force_withdrawal(
            int(starknet_contract_address),
            user1.contract_address,
            int(L1_ADDRESS),
            10, 0,
        ).invoke(user1.contract_address)

    await check_balances(user1_balance, user2_balance)
    '''
    # AWAITING FIX: CAIRO PROBLEM WITH SENDING CALL TO EXTERNAL CONTRACT
    pass
