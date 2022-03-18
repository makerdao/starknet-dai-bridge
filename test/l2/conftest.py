import asyncio
import pytest
import dill
import os
import sys
from types import SimpleNamespace
import time

from starkware.starknet.compiler.compile import compile_starknet_files
from starkware.starknet.testing.starknet import Starknet, StarknetContract
from starkware.starknet.business_logic.state import BlockInfo
from starkware.starknet.public.abi import get_selector_from_name

from Signer import Signer

# pytest-xdest only shows stderr
sys.stdout = sys.stderr

SUPER_ADJUDICATOR_L1_ADDRESS = 0
CONTRACT_SRC = [os.path.dirname(__file__), "..", "..", "contracts", "starknet"]

VALID_DOMAINS = 36637008923134637018442198643
TARGET_DOMAIN = get_selector_from_name("optimism")

def compile(path):
    return compile_starknet_files(
        files=[path],
        debug_info=True,
        cairo_path=CONTRACT_SRC,
    )


def get_block_timestamp(starknet_state):
    return starknet_state.state.block_info.block_timestamp


def set_block_timestamp(starknet_state, timestamp):
    starknet_state.state.block_info = BlockInfo(
        starknet_state.state.block_info.block_number, timestamp
    )


def to_split_uint(a):
    return (a & ((1 << 128) - 1), a >> 128)


async def deploy_account(starknet, signer, source):
    return await starknet.deploy(
        source=source,
        constructor_calldata=[signer.public_key],
    )


# StarknetContracts contain an immutable reference to StarknetState, which
# means if we want to be able to use StarknetState's `copy` method, we cannot
# rely on StarknetContracts that were created prior to the copy.
# For this reason, we specifically inject a new StarknetState when
# deserializing a contract.
def serialize_contract(contract, abi):
    return dict(
        abi=abi,
        contract_address=contract.contract_address,
        deploy_execution_info=contract.deploy_execution_info,
    )


def unserialize_contract(starknet_state, serialized_contract):
    return StarknetContract(state=starknet_state, **serialized_contract)


@pytest.fixture(scope="session")
def event_loop():
    return asyncio.new_event_loop()

L1_ADDRESS = 0x1
L1_GOVERNANCE_ADDRESS = 0x1
L1_BRIDGE_ADDRESS = 0x1
EXECUTE = 1017745666394979726211766185068760164586829337678283062942418931026954492996
ECDSA_PUBLIC_KEY = 0

L2_CONTRACTS_DIR = os.path.join(os.getcwd(), "contracts/l2")
ACCOUNT_FILE = os.path.join(L2_CONTRACTS_DIR, "account.cairo")
DAI_FILE = os.path.join(L2_CONTRACTS_DIR, "dai.cairo")
BRIDGE_FILE = os.path.join(L2_CONTRACTS_DIR, "l2_dai_bridge.cairo")
WORMHOLE_BRIDGE_FILE = os.path.join(L2_CONTRACTS_DIR, "l2_dai_wormhole_bridge.cairo")
SPELL_FILE = os.path.join(L2_CONTRACTS_DIR, "sample_spell.cairo")
REGISTRY_FILE = os.path.join(L2_CONTRACTS_DIR, "registry.cairo")
GOVERNANCE_FILE = os.path.join(L2_CONTRACTS_DIR, "l2_governance_relay.cairo")


async def build_copyable_deployment():
    starknet = await Starknet.empty()

    # initialize a realistic timestamp
    set_block_timestamp(starknet.state, round(time.time()))

    signers = dict(
        user1=Signer(23904852345),
        user2=Signer(23904852345),
        user3=Signer(23904852345),
        auth_user=Signer(83745982347),
    )

    # Maps from name -> account contract
    accounts = SimpleNamespace(
        **{
            name: (await deploy_account(starknet, signer, ACCOUNT_FILE))
            for name, signer in signers.items()
        }
    )

    l2_governance_relay = await starknet.deploy(
            source=GOVERNANCE_FILE,
            constructor_calldata=[
                int(L1_GOVERNANCE_ADDRESS),
            ])

    registry = await starknet.deploy(source=REGISTRY_FILE)

    dai = await starknet.deploy(
            source=DAI_FILE,
            constructor_calldata=[
                accounts.auth_user.contract_address,
            ])

    l2_bridge = await starknet.deploy(
        source=BRIDGE_FILE,
        constructor_calldata=[
            accounts.auth_user.contract_address,
            dai.contract_address,
            L1_ADDRESS,
            registry.contract_address,
        ],
    )

    l2_wormhole_bridge = await starknet.deploy(
        source=WORMHOLE_BRIDGE_FILE,
        constructor_calldata=[
            accounts.auth_user.contract_address,
            dai.contract_address,
            L1_ADDRESS,
            get_selector_from_name("starknet"),
        ],
    )
    await l2_wormhole_bridge.file(
        VALID_DOMAINS, TARGET_DOMAIN, 1,
    ).invoke(accounts.auth_user.contract_address)

    contract = '''%%lang starknet
        %%builtins pedersen range_check

        from starkware.cairo.common.cairo_builtins import HashBuiltin
        from starkware.cairo.common.uint256 import Uint256

        @contract_interface
        namespace IDAI:
          func mint(account: felt, amount: Uint256) -> ():
          end
        end

        @external
        func execute{
            syscall_ptr : felt*,
            pedersen_ptr : HashBuiltin*,
            range_check_ptr
          }():
            let dai = %s
            let user = %s
            let amount = Uint256(low=10, high=0)
            IDAI.mint(contract_address=dai, account=user, amount=amount)

            return ()
        end''' % (dai.contract_address, accounts.user1.contract_address)

    with open(SPELL_FILE, 'w') as f:
        f.write(contract)

    sample_spell = await starknet.deploy(source=SPELL_FILE)

    await registry.set_L1_address(
            int(L1_ADDRESS)).invoke(accounts.auth_user.contract_address)
    await registry.set_L1_address(
            int(L1_ADDRESS)).invoke(accounts.user1.contract_address)
    await registry.set_L1_address(
            int(L1_ADDRESS)).invoke(accounts.user2.contract_address)
    await registry.set_L1_address(
            int(L1_ADDRESS)).invoke(accounts.user3.contract_address)

    print("-------------------------------------------")
    print(l2_bridge.contract_address)
    print("-------------------------------------------")

    await dai.rely(
            l2_bridge.contract_address,
        ).invoke(accounts.auth_user.contract_address)
    await dai.rely(
            l2_governance_relay.contract_address,
        ).invoke(accounts.auth_user.contract_address)
    await l2_bridge.rely(
            l2_governance_relay.contract_address,
        ).invoke(accounts.auth_user.contract_address)

    defs = SimpleNamespace(
        account=compile(ACCOUNT_FILE),
        dai=compile(DAI_FILE),
        l2_bridge=compile(BRIDGE_FILE),
        l2_wormhole_bridge=compile(WORMHOLE_BRIDGE_FILE),
        sample_spell=compile(SPELL_FILE),
        registry=compile(REGISTRY_FILE),
        l2_governance_relay=compile(GOVERNANCE_FILE),
    )
    os.remove(SPELL_FILE)

    await dai.rely(
            l2_bridge.contract_address,
        ).invoke(accounts.auth_user.contract_address)

    consts = SimpleNamespace(
    )

    # intialize two users with 100 DAI
    await dai.mint(
            accounts.user1.contract_address,
            to_split_uint(100)).invoke(accounts.auth_user.contract_address)
    await dai.mint(
            accounts.user2.contract_address,
            to_split_uint(100)).invoke(accounts.auth_user.contract_address)

    return SimpleNamespace(
        starknet=starknet,
        consts=consts,
        signers=signers,
        serialized_contracts=dict(
            user1=serialize_contract(accounts.user1, defs.account.abi),
            user2=serialize_contract(accounts.user2, defs.account.abi),
            user3=serialize_contract(accounts.user3, defs.account.abi),
            auth_user=serialize_contract(accounts.auth_user, defs.account.abi),
            dai=serialize_contract(dai, defs.dai.abi),
            sample_spell=serialize_contract(sample_spell, defs.sample_spell.abi),
            l2_bridge=serialize_contract(l2_bridge, defs.l2_bridge.abi),
            l2_wormhole_bridge=serialize_contract(l2_wormhole_bridge, defs.l2_wormhole_bridge.abi),
            registry=serialize_contract(registry, defs.registry.abi),
            l2_governance_relay=serialize_contract(l2_governance_relay, defs.l2_governance_relay.abi),
        ),
    )


@pytest.fixture(scope="session")
async def copyable_deployment(request):
    CACHE_KEY = "deployment"
    val = request.config.cache.get(CACHE_KEY, None)
    val = await build_copyable_deployment()
    res = dill.dumps(val).decode("cp437")
    request.config.cache.set(CACHE_KEY, res)
    return val


@pytest.fixture(scope="session")
async def ctx_factory(copyable_deployment):
    def make():
        serialized_contracts = copyable_deployment.serialized_contracts
        signers = copyable_deployment.signers
        consts = copyable_deployment.consts

        starknet_state = copyable_deployment.starknet.state.copy()
        contracts = {
            name: unserialize_contract(starknet_state, serialized_contract)
            for name, serialized_contract in serialized_contracts.items()
        }

        async def execute(account_name, contract_address, selector_name, calldata):
            return await signers[account_name].send_transaction(
                contracts[account_name],
                contract_address,
                selector_name,
                calldata,
            )

        def advance_clock(num_seconds):
            set_block_timestamp(
                starknet_state, get_block_timestamp(starknet_state) + num_seconds
            )

        return SimpleNamespace(
            starknet=Starknet(starknet_state),
            advance_clock=advance_clock,
            consts=consts,
            execute=execute,
            **contracts,
        )

    return make

@pytest.fixture(scope="function")
def ctx(ctx_factory):
    ctx = ctx_factory()
    return ctx

@pytest.fixture(scope="function")
async def starknet(ctx) -> Starknet:
    return ctx.starknet

@pytest.fixture(scope="function")
async def user1(ctx) -> StarknetContract:
    return ctx.user1

@pytest.fixture(scope="function")
async def user2(ctx) -> StarknetContract:
    return ctx.user2

@pytest.fixture(scope="function")
async def user3(ctx) -> StarknetContract:
    return ctx.user3

@pytest.fixture(scope="function")
async def auth_user(ctx) -> StarknetContract:
    return ctx.auth_user

@pytest.fixture(scope="function")
async def sample_spell(ctx) -> StarknetContract:
    return ctx.sample_spell

@pytest.fixture(scope="function")
async def registry(ctx) -> StarknetContract:
    return ctx.registry

@pytest.fixture(scope="function")
async def l2_governance_relay(ctx) -> StarknetContract:
    return ctx.l2_governance_relay

@pytest.fixture(scope="function")
async def l2_bridge(ctx) -> StarknetContract:
    return ctx.l2_bridge

@pytest.fixture(scope="function")
async def l2_wormhole_bridge(ctx) -> StarknetContract:
    return ctx.l2_wormhole_bridge

@pytest.fixture(scope="function")
async def dai(ctx) -> StarknetContract:
    return ctx.dai

@pytest.fixture
async def check_balances(
    dai: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
    user3: StarknetContract,
):
    async def internal_check_balances(
        expected_user1_balance,
        expected_user2_balance,
    ):
        user1_balance = await dai.balanceOf(user1.contract_address).call()
        user2_balance = await dai.balanceOf(user2.contract_address).call()
        user3_balance = await dai.balanceOf(user3.contract_address).call()
        total_supply = await dai.totalSupply().call()

        assert user1_balance.result == (to_split_uint(expected_user1_balance),)
        assert user2_balance.result == (to_split_uint(expected_user2_balance),)
        assert user3_balance.result == (to_split_uint(0),)
        assert total_supply.result == (
                to_split_uint(expected_user1_balance+expected_user2_balance),)

    return internal_check_balances
