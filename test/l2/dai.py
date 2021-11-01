import os
import pytest
import asyncio

from starkware.starknet.testing.starknet import Starknet
from starkware.starknet.testing.contract import StarknetContract
from starkware.starkware_utils.error_handling import StarkException


MAX = 2**120
L1_ADDRESS = 0x1

L2_CONTRACTS_DIR = os.path.join(os.getcwd(), "contracts/l2")
CONTRACT_FILE = os.path.join(L2_CONTRACTS_DIR, "dai.cairo")


@pytest.fixture
async def starknet() -> Starknet:
    return await Starknet.empty()


@pytest.fixture
async def contract(starknet: Starknet) -> StarknetContract:
    return await starknet.deploy(source=CONTRACT_FILE)

dai_contract = None
l2_bridge_contract = None

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
async def check_balances(
    expected_user1_balance,
    expected_user2_balance,
):
    user1_balance = await dai_contract.balanceOf(user1.contract_address).call()
    user2_balance = await dai_contract.balanceOf(user2.contract_address).call()
    user3_balance = await dai_contract.balanceOf(user3.contract_address).call()
    total_supply = await dai_contract.totalSupply().call()

    assert user1_balance.result == (expected_user1_balance,)
    assert user2_balance.result == (expected_user2_balance,)
    assert user3_balance.result == (0,)
    assert total_supply.result == (
            expected_user1_balance+expected_user2_balance,)


@pytest.fixture
def event_loop():
    return asyncio.get_event_loop()


@pytest.fixture(autouse=True)
async def before_all(
    starknet: Starknet,
    contract: StarknetContract,
):
    global dai_contract
    dai_contract = contract

    ACCOUNT_FILE = os.path.join(L2_CONTRACTS_DIR, "account.cairo")
    global auth_user
    global user1
    global user2
    global user3
    auth_user = await starknet.deploy(source=ACCOUNT_FILE)
    user1 = await starknet.deploy(source=ACCOUNT_FILE)
    user2 = await starknet.deploy(source=ACCOUNT_FILE)
    user3 = await starknet.deploy(source=ACCOUNT_FILE)

    global l2_bridge_contract
    BRIDGE_FILE = os.path.join(L2_CONTRACTS_DIR, "l2_dai_bridge.cairo")
    l2_bridge_contract = await starknet.deploy(BRIDGE_FILE)

    # TODO: replace starknet_contract_address with L1 bridge address
    await contract.initialize().invoke(auth_user.contract_address)

    await contract.rely(
            l2_bridge_contract.contract_address,
        ).invoke(auth_user.contract_address)


@pytest.fixture(scope="function", autouse=True)
async def before_each(
    starknet: Starknet,
    contract: StarknetContract,
):
    # intialize two users with 100 DAI
    global user1_balance
    global user2_balance

    await contract.mint(
            user1.contract_address, 100).invoke(auth_user.contract_address)
    await contract.mint(
            user2.contract_address, 100).invoke(auth_user.contract_address)

    balance = await contract.balance_of(user1.contract_address).call()
    user1_balance = balance.result[0]
    balance = await contract.balance_of(user2.contract_address).call()
    user2_balance = balance.result[0]


#########
# TESTS #
#########
@pytest.mark.asyncio
async def test_total_supply(
    starknet: Starknet,
    contract: StarknetContract,
):
    total_supply = await contract.total_supply().call()

    assert total_supply.result == (200,)


@pytest.mark.asyncio
async def test_balance_of(
    starknet: Starknet,
    contract: StarknetContract,
):
    balance = await contract.balance_of(user1.contract_address).call()

    assert balance.result == (user1_balance,)


@pytest.mark.asyncio
async def test_transfer(
    starknet: Starknet,
    contract: StarknetContract,
):
    await contract.transfer(
            user2.contract_address, 10).invoke(user1.contract_address)

    await check_balances(
        user1_balance-10,
        user2_balance+10)


@pytest.mark.asyncio
async def test_transfer_to_yourself(
    starknet: Starknet,
    contract: StarknetContract,
):
    await contract.transfer(
            user1.contract_address, 10).invoke(user1.contract_address)

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_transfer_from(
    starknet: Starknet,
    contract: StarknetContract,
):
    await contract.approve(
            user3.contract_address, 10).invoke(user1.contract_address)
    await contract.transfer_from(
        user1.contract_address,
        user2.contract_address,
        10).invoke(user3.contract_address)

    await check_balances(
        user1_balance-10,
        user2_balance+10)


@pytest.mark.asyncio
async def test_transfer_to_yourself_using_transfer_from(
    starknet: Starknet,
    contract: StarknetContract,
):
    await contract.transfer_from(
        user1.contract_address,
        user1.contract_address,
        10).invoke(user1.contract_address)

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_should_not_transfer_beyond_balance(
    starknet: Starknet,
    contract: StarknetContract,
):
    with pytest.raises(StarkException):
        await contract.transfer(
                user2.contract_address,
                user1_balance+1,
            ).invoke(user1.contract_address)

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_should_not_transfer_to_zero_address(
    starknet: Starknet,
    contract: StarknetContract,
):
    with pytest.raises(StarkException):
        await contract.transfer(burn, 10).invoke()

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_should_not_transfer_to_dai_address(
    starknet: Starknet,
    contract: StarknetContract,
):
    '''
    with pytest.raises(StarkException):
        await contract.transfer(contract.contract_address, 10).invoke()

    await check_balances(user1_balance, user2_balance)
    '''
    pass


@pytest.mark.asyncio
async def test_mint(starknet: Starknet, contract: StarknetContract):
    await contract.mint(
            user1.contract_address, 10).invoke(auth_user.contract_address)

    await check_balances(user1_balance+10, user2_balance)


@pytest.mark.asyncio
async def test_should_not_allow_minting_to_zero_address(
    starknet: Starknet,
    contract: StarknetContract,
):
    with pytest.raises(StarkException):
        await contract.mint(burn, 10).invoke(auth_user.contract_address)

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_should_not_allow_minting_to_dai_address(
    starknet: Starknet,
    contract: StarknetContract,
):
    '''
    with pytest.raises(StarkException):
        await contract.mint(
                contract.contract_address,
                10,
            ).invoke(auth_user.contract_address)

    await check_balances(user1_balance, user2_balance)
    '''
    pass


@pytest.mark.asyncio
async def test_should_not_allow_minting_to_address_beyond_max(
    starknet: Starknet,
    contract: StarknetContract,
):
    # not implemented
    pass


@pytest.mark.asyncio
async def test_burn(starknet: Starknet, contract: StarknetContract):
    await contract.burn(
            user1.contract_address, 10).invoke(user1.contract_address)

    await check_balances(user1_balance-10, user2_balance)


@pytest.mark.asyncio
async def test_should_not_burn_beyond_balance(
    starknet: Starknet,
    contract: StarknetContract,
):
    with pytest.raises(StarkException):
        await contract.burn(
                user1.contract_address,
                user1_balance+1,
            ).invoke(user1.contract_address)

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_should_not_burn_other(
    starknet: Starknet,
    contract: StarknetContract,
):
    with pytest.raises(StarkException):
        await contract.burn(
                user1.contract_address,
                10,
            ).invoke(user2.contract_address)

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_deployer_can_burn_other(
    starknet: Starknet,
    contract: StarknetContract,
):
    # not implemented
    pass


@pytest.mark.asyncio
async def test_approve(starknet: Starknet, contract: StarknetContract):
    await contract.approve(
            user2.contract_address, 10).invoke(user1.contract_address)

    allowance = await contract.allowance(
        user1.contract_address,
        user2.contract_address).call()

    assert allowance.result == (10,)


@pytest.mark.asyncio
async def test_can_burn_other_if_approved(
    starknet: Starknet,
    contract: StarknetContract,
):
    await contract.approve(
            user2.contract_address, 10).invoke(user1.contract_address)

    await contract.burn(
            user1.contract_address, 10).invoke(user2.contract_address)

    await check_balances(user1_balance-10, user2_balance)


# ALLOWANCE
@pytest.mark.asyncio
async def test_transfer_using_transfer_from_and_allowance(
    starknet: Starknet,
    contract: StarknetContract,
):
    await contract.approve(
            user3.contract_address, 10).invoke(user1.contract_address)

    await contract.transfer_from(
            user1.contract_address,
            user2.contract_address,
            10,
        ).invoke(user3.contract_address)

    await check_balances(user1_balance-10, user2_balance+10)


@pytest.mark.asyncio
async def test_should_not_transfer_beyond_allowance(
    starknet: Starknet,
    contract: StarknetContract,
):
    await contract.approve(
            user3.contract_address, 10).invoke(user1.contract_address)

    allowance = await contract.allowance(
        user1.contract_address,
        user3.contract_address).call()

    with pytest.raises(StarkException):
        await contract.transfer_from(
            user1.contract_address,
            user2.contract_address,
            allowance.result[0]+1).invoke(user3.contract_address)

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_burn_using_burn_and_allowance(
    starknet: Starknet,
    contract: StarknetContract,
):
    await contract.approve(
            user2.contract_address, 10).invoke(user1.contract_address)

    await contract.burn(
            user1.contract_address, 10).invoke(user2.contract_address)

    await check_balances(user1_balance-10, user2_balance)


@pytest.mark.asyncio
async def test_should_not_burn_beyond_allowance(
    starknet: Starknet,
    contract: StarknetContract,
):
    await contract.approve(
            user2.contract_address, 10).invoke(user1.contract_address)

    allowance = await contract.allowance(
        user1.contract_address,
        user2.contract_address).call()

    with pytest.raises(StarkException):
        await contract.burn(
                user1.contract_address,
                allowance.result[0]+1,
            ).invoke(user2.contract_address)

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_increase_allowance(
    starknet: Starknet,
    contract: StarknetContract,
):
    await contract.approve(
            user2.contract_address, 10).invoke(user1.contract_address)
    await contract.increase_allowance(
            user2.contract_address, 10).invoke(user1.contract_address)

    allowance = await contract.allowance(
        user1.contract_address,
        user2.contract_address).call()
    assert allowance.result == (20,)


@pytest.mark.asyncio
async def test_should_not_increase_allowance_beyond_max(
    starknet: Starknet,
    contract: StarknetContract,
):
    await contract.approve(
            user2.contract_address, 10).invoke(user1.contract_address)
    with pytest.raises(StarkException):
        await contract.increase_allowance(
                user2.contract_address, MAX).invoke(user1.contract_address)


@pytest.mark.asyncio
async def test_decrease_allowance(
    starknet: Starknet,
    contract: StarknetContract,
):
    await contract.approve(
            user2.contract_address, 10).invoke(user1.contract_address)
    await contract.decrease_allowance(
            user2.contract_address, 1).invoke(user1.contract_address)

    allowance = await contract.allowance(
        user1.contract_address,
        user2.contract_address).call()
    assert allowance.result == (9,)


@pytest.mark.asyncio
async def test_should_not_decrease_allowance_beyond_allowance(
    starknet: Starknet,
    contract: StarknetContract,
):
    await contract.approve(
            user2.contract_address, 10).invoke(user1.contract_address)

    allowance = await contract.allowance(
        user1.contract_address,
        user2.contract_address).call()

    with pytest.raises(StarkException):
        await contract.decrease_allowance(
            user2.contract_address,
            allowance.result[0] + 1).invoke(user1.contract_address)


# MAXIMUM ALLOWANCE
@pytest.mark.asyncio
async def test_does_not_decrease_allowance_using_transfer_from(
    starknet: Starknet,
    contract: StarknetContract,
):
    await contract.approve(
            user3.contract_address, MAX).invoke(user1.contract_address)
    await contract.transfer_from(
            user1.contract_address,
            user2.contract_address,
            10,
        ).invoke(user3.contract_address)

    allowance = await contract.allowance(
        user1.contract_address,
        user3.contract_address).call()
    assert allowance.result == (MAX,)


@pytest.mark.asyncio
async def test_does_not_decrease_allowance_using_burn(
    starknet: Starknet,
    contract: StarknetContract,
):
    await contract.approve(
            user3.contract_address, MAX).invoke(user1.contract_address)
    await contract.burn(
            user1.contract_address, 10).invoke(user3.contract_address)

    allowance = await contract.allowance(
        user1.contract_address,
        user3.contract_address).call()
    assert allowance.result == (MAX,)
