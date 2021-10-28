import os
import pytest
import asyncio

from starkware.starknet.testing.starknet import Starknet
from starkware.starkware_utils.error_handling import StarkException
from starkware.starknet.public.abi import get_selector_from_name

# The path to the contract source code.
L2_CONTRACTS_DIR = os.path.join(
    os.getcwd(), "contracts/l2")
MAX = 2**120
L1_ADDRESS = 0x1


async def initialize():
    global starknet
    starknet = await Starknet.empty()


async def deploy(contract_name):
    CONTRACT_FILE = os.path.join(L2_CONTRACTS_DIR, contract_name)
    contract = await starknet.deploy(source=CONTRACT_FILE)

    return contract


starknet = None
bridge_contract = None
dai_contract = None
registry_contract = None

# constant addresses
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


@pytest.fixture(scope="session")
def event_loop():
    return asyncio.get_event_loop()


@pytest.fixture(scope="session", autouse=True)
async def before_all():
    await initialize()

    global registry_contract
    registry_contract = await deploy("registry.cairo")

    global auth_user
    global user1
    global user2
    global user3
    auth_user = await deploy("account.cairo")
    user1 = await deploy("account.cairo")
    user2 = await deploy("account.cairo")
    user3 = await deploy("account.cairo")

    await registry_contract.register(
            int(L1_ADDRESS)).invoke(auth_user.contract_address)
    await registry_contract.register(
            int(L1_ADDRESS)).invoke(user1.contract_address)
    await registry_contract.register(
            int(L1_ADDRESS)).invoke(user2.contract_address)
    await registry_contract.register(
            int(L1_ADDRESS)).invoke(user3.contract_address)

    global bridge_contract
    global dai_contract
    bridge_contract = await deploy("l2_dai_bridge.cairo")
    dai_contract = await deploy("dai.cairo")

    print("-------------------------------------------")
    print(bridge_contract.contract_address)
    print("-------------------------------------------")

    # TODO: replace starknet_contract_address with L1 bridge address
    await bridge_contract.initialize(
        dai_contract.contract_address,
        int(starknet_contract_address),
        registry_contract.contract_address,
        bridge_contract.contract_address,
    ).invoke(auth_user.contract_address)

    await dai_contract.initialize().invoke(auth_user.contract_address)

    await dai_contract.rely(
            bridge_contract.contract_address,
        ).invoke(auth_user.contract_address)


@pytest.fixture(scope="function", autouse=True)
async def before_each():
    # intialize two users with 100 DAI
    global user1_balance
    global user2_balance

    await dai_contract.mint(
            user1.contract_address, 100).invoke(auth_user.contract_address)
    await dai_contract.mint(
            user2.contract_address, 100).invoke(auth_user.contract_address)

    balance = await dai_contract.balanceOf(user1.contract_address).call()
    user1_balance = balance.result[0]
    balance = await dai_contract.balanceOf(user2.contract_address).call()
    user2_balance = balance.result[0]


#######
# DAI #
#######
@pytest.mark.asyncio
async def test_total_supply():
    total_supply = await dai_contract.totalSupply().call()

    assert total_supply.result == (200,)


@pytest.mark.asyncio
async def test_balance_of():
    balance = await dai_contract.balanceOf(user1.contract_address).call()

    assert balance.result == (user1_balance,)


@pytest.mark.asyncio
async def test_transfer():
    await dai_contract.transfer(
            user2.contract_address, 10).invoke(user1.contract_address)

    await check_balances(
        user1_balance-10,
        user2_balance+10)


@pytest.mark.asyncio
async def test_transfer_to_yourself():
    await dai_contract.transfer(
            user1.contract_address, 10).invoke(user1.contract_address)

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_transfer_from():
    await dai_contract.approve(
            user3.contract_address, 10).invoke(user1.contract_address)
    await dai_contract.transferFrom(
        user1.contract_address,
        user2.contract_address,
        10).invoke(user3.contract_address)

    await check_balances(
        user1_balance-10,
        user2_balance+10)


@pytest.mark.asyncio
async def test_transfer_to_yourself_using_transfer_from():
    await dai_contract.transferFrom(
        user1.contract_address,
        user1.contract_address,
        10).invoke(user1.contract_address)

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_should_not_transfer_beyond_balance():
    with pytest.raises(StarkException):
        await dai_contract.transfer(
                user2.contract_address,
                user1_balance+1,
            ).invoke(user1.contract_address)

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_should_not_transfer_to_zero_address():
    with pytest.raises(StarkException):
        await dai_contract.transfer(burn, 10).invoke()

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_should_not_transfer_to_dai_address():
    '''
    with pytest.raises(StarkException):
        await dai_contract.transfer(dai_contract.contract_address, 10).invoke()

    await check_balances(user1_balance, user2_balance)
    '''
    pass


@pytest.mark.asyncio
async def test_mint():
    await dai_contract.mint(
            user1.contract_address, 10).invoke(auth_user.contract_address)

    await check_balances(user1_balance+10, user2_balance)


@pytest.mark.asyncio
async def test_should_not_allow_minting_to_zero_address():
    with pytest.raises(StarkException):
        await dai_contract.mint(burn, 10).invoke(auth_user.contract_address)

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_should_not_allow_minting_to_dai_address():
    '''
    with pytest.raises(StarkException):
        await dai_contract.mint(
                dai_contract.contract_address,
                10,
            ).invoke(auth_user.contract_address)

    await check_balances(user1_balance, user2_balance)
    '''
    pass


@pytest.mark.asyncio
async def test_should_not_allow_minting_to_address_beyond_max():
    # not implemented
    pass


@pytest.mark.asyncio
async def test_burn():
    await dai_contract.burn(
            user1.contract_address, 10).invoke(user1.contract_address)

    await check_balances(user1_balance-10, user2_balance)


@pytest.mark.asyncio
async def test_should_not_burn_beyond_balance():
    with pytest.raises(StarkException):
        await dai_contract.burn(
                user1.contract_address,
                user1_balance+1,
            ).invoke(user1.contract_address)

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_should_not_burn_other():
    with pytest.raises(StarkException):
        await dai_contract.burn(
                user1.contract_address,
                10,
            ).invoke(user2.contract_address)

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_deployer_can_burn_other():
    # not implemented
    pass


@pytest.mark.asyncio
async def test_approve():
    await dai_contract.approve(
            user2.contract_address, 10).invoke(user1.contract_address)

    allowance = await dai_contract.allowance(
        user1.contract_address,
        user2.contract_address).call()

    assert allowance.result == (10,)


@pytest.mark.asyncio
async def test_can_burn_other_if_approved():
    await dai_contract.approve(
            user2.contract_address, 10).invoke(user1.contract_address)

    await dai_contract.burn(
            user1.contract_address, 10).invoke(user2.contract_address)

    await check_balances(user1_balance-10, user2_balance)


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


# ALLOWANCE
@pytest.mark.asyncio
async def test_transfer_using_transfer_from_and_allowance():
    await dai_contract.approve(
            user3.contract_address, 10).invoke(user1.contract_address)

    await dai_contract.transferFrom(
            user1.contract_address,
            user2.contract_address,
            10,
        ).invoke(user3.contract_address)

    await check_balances(user1_balance-10, user2_balance+10)


@pytest.mark.asyncio
async def test_should_not_transfer_beyond_allowance():
    await dai_contract.approve(
            user3.contract_address, 10).invoke(user1.contract_address)

    allowance = await dai_contract.allowance(
        user1.contract_address,
        user3.contract_address).call()

    with pytest.raises(StarkException):
        await dai_contract.transferFrom(
            user1.contract_address,
            user2.contract_address,
            allowance.result[0]+1).invoke(user3.contract_address)

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_burn_using_burn_and_allowance():
    await dai_contract.approve(
            user2.contract_address, 10).invoke(user1.contract_address)

    await dai_contract.burn(
            user1.contract_address, 10).invoke(user2.contract_address)

    await check_balances(user1_balance-10, user2_balance)


@pytest.mark.asyncio
async def test_should_not_burn_beyond_allowance():
    await dai_contract.approve(
            user2.contract_address, 10).invoke(user1.contract_address)

    allowance = await dai_contract.allowance(
        user1.contract_address,
        user2.contract_address).call()

    with pytest.raises(StarkException):
        await dai_contract.burn(
                user1.contract_address,
                allowance.result[0]+1,
            ).invoke(user2.contract_address)

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_increase_allowance():
    await dai_contract.approve(
            user2.contract_address, 10).invoke(user1.contract_address)
    await dai_contract.increaseAllowance(
            user2.contract_address, 10).invoke(user1.contract_address)

    allowance = await dai_contract.allowance(
        user1.contract_address,
        user2.contract_address).call()
    assert allowance.result == (20,)


@pytest.mark.asyncio
async def test_should_not_increase_allowance_beyond_max():
    await dai_contract.approve(
            user2.contract_address, 10).invoke(user1.contract_address)
    with pytest.raises(StarkException):
        await dai_contract.increaseAllowance(
                user2.contract_address, MAX).invoke(user1.contract_address)


@pytest.mark.asyncio
async def test_decrease_allowance():
    await dai_contract.approve(
            user2.contract_address, 10).invoke(user1.contract_address)
    await dai_contract.decreaseAllowance(
            user2.contract_address, 1).invoke(user1.contract_address)

    allowance = await dai_contract.allowance(
        user1.contract_address,
        user2.contract_address).call()
    assert allowance.result == (9,)


@pytest.mark.asyncio
async def test_should_not_decrease_allowance_beyond_allowance():
    await dai_contract.approve(
            user2.contract_address, 10).invoke(user1.contract_address)

    allowance = await dai_contract.allowance(
        user1.contract_address,
        user2.contract_address).call()

    with pytest.raises(StarkException):
        await dai_contract.decreaseAllowance(
            user2.contract_address,
            allowance.result[0] + 1).invoke(user1.contract_address)


# MAXIMUM ALLOWANCE
@pytest.mark.asyncio
async def test_does_not_decrease_allowance_using_transfer_from():
    await dai_contract.approve(
            user3.contract_address, MAX).invoke(user1.contract_address)
    await dai_contract.transferFrom(
            user1.contract_address,
            user2.contract_address,
            10,
        ).invoke(user3.contract_address)

    allowance = await dai_contract.allowance(
        user1.contract_address,
        user3.contract_address).call()
    assert allowance.result == (MAX,)


@pytest.mark.asyncio
async def test_does_not_decrease_allowance_using_burn():
    await dai_contract.approve(
            user3.contract_address, MAX).invoke(user1.contract_address)
    await dai_contract.burn(
            user1.contract_address, 10).invoke(user3.contract_address)

    allowance = await dai_contract.allowance(
        user1.contract_address,
        user3.contract_address).call()
    assert allowance.result == (MAX,)


##########
# Bridge #
##########
@pytest.mark.asyncio
async def test_second_initialize():
    with pytest.raises(Exception):
        await bridge_contract.initialize(3, 4).invoke()


@pytest.mark.asyncio
async def test_withdraw():
    '''
    await dai_contract.approve(
            bridge_contract.contract_address,
            10,
        ).invoke(user1.contract_address)
    await bridge_contract.withdraw(
            user2.contract_address, 10).invoke(user1.contract_address)

    await check_balances(user1_balance-10, user2_balance)
    '''
    # AWAITING FIX: CAIRO PROBLEM WITH SENDING CALL TO EXTERNAL CONTRACT
    pass


@pytest.mark.asyncio
async def test_withdraw_should_fail_when_closed():
    await dai_contract.approve(
            bridge_contract.contract_address,
            10,
        ).invoke(user1.contract_address)

    await bridge_contract.close().invoke(auth_user.contract_address)

    with pytest.raises(Exception):
        await bridge_contract.withdraw(
                user2.contract_address, 10).invoke(user1.contract_address)


@pytest.mark.asyncio
async def test_withdraw_insufficient_funds():
    with pytest.raises(StarkException):
        await bridge_contract.withdraw(
                user2.contract_address, 10).invoke(user3.contract_address)
    await check_balances(user1_balance, user2_balance)


#############
# Workflows #
#############
@pytest.mark.asyncio
async def test_finalize_deposit():
    # TODO: replace starknet_contract_address with L1 bridge address
    '''
    await bridge_contract.finalize_deposit(
            int(starknet_contract_address),
            user2.contract_address,
            10,
        ).invoke(user2.contract_address)

    await check_balances(user1_balance, user2_balance+10)
    '''
    # AWAITING FIX: CAIRO PROBLEM WITH SENDING CALL TO EXTERNAL CONTRACT
    pass


@pytest.mark.asyncio
async def test_finalize_force_withdrawal():
    # TODO: replace starknet_contract_address with L1 bridge address
    '''
    await dai_contract.approve(
            bridge_contract.contract_address,
            10,
        ).invoke(user1.contract_address)
    await bridge_contract.finalize_force_withdrawal(
            int(starknet_contract_address),
            user1.contract_address,
            int(L1_ADDRESS),
            10,
        ).invoke(user1.contract_address)

    await check_balances(user1_balance-10, user2_balance)
    '''
    # AWAITING FIX: CAIRO PROBLEM WITH SENDING CALL TO EXTERNAL CONTRACT
    pass


@pytest.mark.asyncio
async def test_finalize_force_withdrawal_insufficient_funds():
    # TODO: replace starknet_contract_address with L1 bridge address
    '''
    await dai_contract.approve(
            bridge_contract.contract_address,
            10,
        ).invoke(user3.contract_address)
    await bridge_contract.finalize_force_withdrawal(
            int(starknet_contract_address),
            user3.contract_address,
            int(L1_ADDRESS),
            10,
        ).invoke(user3.contract_address)

    await check_balances(user1_balance, user2_balance)
    '''
    # AWAITING FIX: CAIRO PROBLEM WITH SENDING CALL TO EXTERNAL CONTRACT
    pass


@pytest.mark.asyncio
async def test_finalize_force_withdrawal_insufficient_allowance():
    # TODO: replace starknet_contract_address with L1 bridge address
    '''
    await bridge_contract.finalize_force_withdrawal(
            int(starknet_contract_address),
            user1.contract_address,
            int(L1_ADDRESS),
            10,
        ).invoke(user1.contract_address)

    await check_balances(user1_balance, user2_balance)
    '''
    # AWAITING FIX: CAIRO PROBLEM WITH SENDING CALL TO EXTERNAL CONTRACT
    pass
