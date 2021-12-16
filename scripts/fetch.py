import argparse
import json
import web3
from web3.exceptions import InvalidAddress
from typing import Dict, List
import os
from dotenv import load_dotenv
import logging
from typing import Dict, List

from eth_typing.encoding import HexStr
from web3 import Web3
from web3.contract import Contract

from starkware.starknet.public.abi import get_storage_var_address

logger = logging.getLogger(__name__)

def _initialize_memory_page_map(
    memory_page_fact_registry_contract: Contract, from_block: int, to_block: int
) -> Dict[int, str]:
    """
    Returns a mapping between the memory pages' hashes and the Ethereum transaction's hash for the
    transactions in blocks [from_block, to_block).
    """
    memory_page_contract_event = (
        memory_page_fact_registry_contract.events.LogMemoryPageFactContinuous
    )
    logger.info(f"Constructing memory pages dictionary for blocks [{from_block}, {to_block}].")
    memory_page_events = get_contract_events(
        contract_event=memory_page_contract_event, from_block=from_block, to_block=to_block
    )
    return {
        event["args"]["memoryHash"]: event["transactionHash"].hex() for event in memory_page_events
    }


def _initialize_fact_memory_hashes_map(
    statement_verifier_impl_contracts: List[Contract], from_block: int, to_block: int
) -> Dict[bytes, bytes]:
    """
    Given a list of statement verifier implementation contracts and block numbers, returns a mapping
    between Cairo job's fact and the memory pages hashes for each verifier contract.
    """
    statement_verifier_events = []
    for statement_verifier_impl_contract in statement_verifier_impl_contracts:
        # Asserts that the contract is a statement verifier implementation contract.
        assert (
            "GpsStatementVerifier" in statement_verifier_impl_contract.functions.identify().call()
        ), (
            f"Contract with address {statement_verifier_impl_contract.address} is not a "
            "statement verifier contract."
        )
        statement_verifier_contract_event = (
            statement_verifier_impl_contract.events.LogMemoryPagesHashes
        )
        statement_verifier_events.extend(
            get_contract_events(
                contract_event=statement_verifier_contract_event,
                from_block=from_block,
                to_block=to_block,
            )
        )
    return {
        event["args"]["factHash"]: event["args"]["pagesHashes"]
        for event in statement_verifier_events
    }


class MemoryPagesFetcher:
    """
    Given a fact hash and using onchain data, retrieves the memory pages that the GPS statement
    verifier outputted for the relevant Cairo job.
    """

    def __init__(
        self,
        web3: Web3,
        memory_page_transactions_map: Dict[int, str],
        fact_memory_pages_map: Dict[bytes, bytes],
        memory_page_fact_registry_contract: Contract,
    ):
        self.web3 = web3
        # Mapping from memory page hash to memory page Ethereum transaction.
        self.memory_page_transactions_map = memory_page_transactions_map
        # Mapping from Cairo job's fact to the Cairo job memory pages list.
        self.fact_memory_pages_map = fact_memory_pages_map
        self.memory_page_fact_registry_contract = memory_page_fact_registry_contract

    @classmethod
    def create(
        cls,
        web3: Web3,
        from_block: int,
        gps_statement_verifier_contract: Contract,
        memory_page_fact_registry_contract: Contract
    ) -> "MemoryPagesFetcher":
        """
        Creates an initialized instance by reading contract logs from the given web3 provider.
        If is_verifier_proxied is true, then gps_statement_verifier_contract is the proxy contract
        rather than the statement verifier implementation.
        """
        last_block = web3.eth.block_number
        memory_page_transactions_map = {}
        fact_memory_pages_map = {}
        gps_statement_verifier_impl_contracts = [gps_statement_verifier_contract]

        batch_size = 10000
        for start in range(from_block, last_block, batch_size+1):
            end = start + batch_size
            if end > last_block:
                end = last_block
            memory_page_transactions_map.update(_initialize_memory_page_map(
                memory_page_fact_registry_contract=memory_page_fact_registry_contract,
                from_block=start,
                to_block=end,
            ))

            fact_memory_pages_map.update(_initialize_fact_memory_hashes_map(
                statement_verifier_impl_contracts=gps_statement_verifier_impl_contracts,
                from_block=start,
                to_block=end,
            ))

        return cls(
            web3=web3,
            memory_page_transactions_map=memory_page_transactions_map,
            fact_memory_pages_map=fact_memory_pages_map,
            memory_page_fact_registry_contract=memory_page_fact_registry_contract,
        )

    def _get_memory_pages_hashes_from_fact(self, fact_hash: bytes):
        """
        An auxiliary function for retrieveing the memory pages' hashes of a fact.
        """
        if fact_hash not in self.fact_memory_pages_map:
            raise Exception(
                f"Fact hash {fact_hash.hex()} was not registered in the verifier contracts."
            )
        return self.fact_memory_pages_map[fact_hash]

    def get_memory_pages_from_fact(self, fact_hash: bytes) -> List[List[int]]:
        """
        Given a fact hash, retrieves the memory pages which are relevant for that fact.
        """
        memory_pages = []
        memory_pages_hashes = self._get_memory_pages_hashes_from_fact(fact_hash)

        assert memory_pages_hashes is not None
        for memory_page_hash in memory_pages_hashes:
            transaction_str = self.memory_page_transactions_map[
                int.from_bytes(memory_page_hash, "big")
            ]
            memory_pages_tx = self.web3.eth.getTransaction(HexStr(transaction_str))
            tx_decoded_values = self.memory_page_fact_registry_contract.decode_function_input(
                memory_pages_tx["input"]
            )[1]["values"]
            memory_pages.append(tx_decoded_values)
        return memory_pages

    def get_memory_pages(self) -> List[List[int]]:
        """
        Retrieves all of the memory pages.
        """
        memory_pages = []
        for memory_pages_hashes in self.fact_memory_pages_map.values():
            for memory_page_hash in memory_pages_hashes[1:]:
                transaction_str = self.memory_page_transactions_map[
                    int.from_bytes(memory_page_hash, "big")
                ]
                memory_pages_tx = self.web3.eth.getTransaction(HexStr(transaction_str))
                tx_decoded_values = self.memory_page_fact_registry_contract.decode_function_input(
                    memory_pages_tx["input"]
                )[1]["values"]
                memory_pages.append(tx_decoded_values)
        return memory_pages


DEFAULT_GET_LOGS_MAX_CHUNK_SIZE = 10 ** 6
def get_contract_events(
    contract_event,
    from_block: int,
    to_block: int,
    get_logs_max_chunk_size: int = DEFAULT_GET_LOGS_MAX_CHUNK_SIZE,
) -> list:
    """
    Given a contract event and block numbers, retrieves a list of events in blocks
    [from_block, to_block).
    Splits the query in order to avoid Infura's maximal query limitation.
    See https://infura.io/docs/ethereum/json-rpc/eth_getLogs.
    """
    events = []
    assert from_block <= to_block
    split_queries_block_nums = list(range(from_block, to_block, get_logs_max_chunk_size))
    split_queries = [
        (query_from_block, query_to_block)
        for query_from_block, query_to_block in zip(
            split_queries_block_nums, split_queries_block_nums[1:] + [to_block]
        )
    ]

    for query_from_block, query_to_block in split_queries:
        events.extend(
            list(contract_event.getLogs(fromBlock=query_from_block, toBlock=query_to_block))
        )
    return events


def load_contracts(
    web3: web3.Web3, contracts_file: str, contracts_names: List[str]
) -> Dict[str, web3.contract.Contract]:
    """
    Given a list of contract names, returns a dict of contract names and contracts.
    """
    res = {}
    with open(contracts_file) as infile:
        source_json = json.load(infile)
    for contract_name in contracts_names:
        try:
            res[contract_name] = web3.eth.contract(
                address=source_json[contract_name]["address"], abi=source_json[contract_name]["abi"]
            )
        except (KeyError, InvalidAddress) as ex:
            raise ex
    return res


def main():

    # get all deployed account contracts
    deployed_contracts = os.listdir('./deployments/goerli')
    account_contracts = filter(lambda x: x.startswith('account'), deployed_contracts)
    account_addresses = {}
    for contract in account_contracts:
        account_name = contract.split('-')[1].split('.')[0]
        with open('./deployments/goerli/account-%s.json' % (account_name), 'r') as f:
            address = int(json.load(f)['address'], 16)
            account_addresses.update({address: account_name})

    load_dotenv()
    INFURA_API_KEY = os.environ["INFURA_API_KEY"]
    contract_names = ["GpsStatementVerifier", "MemoryPageFactRegistry"]

    parser = argparse.ArgumentParser()
    parser.add_argument('--chain', dest='chain', default='goerli')
    parser.add_argument('--contract', dest='contracts', default='dai,registry')
    args = parser.parse_args()

    node_url = 'https://%s.infura.io/v3/%s' % (args.chain, INFURA_API_KEY)
    w3 = web3.Web3(web3.HTTPProvider(node_url))
    assert w3.isConnected(), f"Cannot connect to http provider {node_url}."

    contracts_path = os.path.join(os.path.dirname(__file__), "contracts.json")
    contracts_dict = load_contracts(
        web3=w3, contracts_file=contracts_path, contracts_names=contract_names
    )
    (gps_statement_verifier_contract, memory_pages_contract) = [contracts_dict[contract_name] for contract_name in contract_names]

    # get contracts whose state we want
    contracts = args.contracts.split(',')
    contract_addresses = {}
    contract_blocks = []
    for contract_name in contracts:
        with open('./deployments/goerli/%s.json' % (contract_name), 'r') as f:
            contract = json.load(f)
        address = hex(int(contract['address'], 16))
        block = int(contract['block'])
        contract_addresses.update({address: contract_name})
        contract_blocks.append(block)

    # get the memory pages starting at the block when the oldest contract was deployed
    from_block = min(contract_blocks)
    memory_pages_fetcher = MemoryPagesFetcher.create(
        web3=w3,
        from_block=from_block,
        gps_statement_verifier_contract=gps_statement_verifier_contract,
        memory_page_fact_registry_contract=memory_pages_contract
    )
    pages = memory_pages_fetcher.get_memory_pages()

    # flatten the memory pages
    diffs = [item for page in pages for item in page]

    # filter to get most recent state of each variable of each contract in contract_addresses
    filtered_diffs = get_diffs(diffs, contract_addresses)

    balances = get_balances(filtered_diffs['dai'], account_addresses)
    l1_addresses = get_l1_addresses(filtered_diffs['registry'], account_addresses)
    print('Balances:')
    for account_name, value in balances.items():
        print(' ', account_name + ':', value)
    print()
    print('L1 Addresses:')
    for account_name, value in l1_addresses.items():
        print(' ', account_name + ':', value)


def get_diffs(diffs, contract_addresses):
    filtered_diffs = {contract_name: {} for contract_name in contract_addresses.values()}
    while len(diffs) > 0:
        len_deployments = diffs.pop(0)
        for _ in range(len_deployments):
            diffs.pop(0)

        num_contracts = diffs.pop(0)

        for i in range(num_contracts):
            contract_address = hex(int(diffs.pop(0)))
            num_updates = diffs.pop(0)
            for _ in range(num_updates):
                if contract_address in contract_addresses.keys():
                    contract_name = contract_addresses[contract_address]
                    storage_var_address = diffs.pop(0)
                    filtered_diffs[contract_name][storage_var_address] = diffs.pop(0)
                else:
                    diffs.pop(0)
                    diffs.pop(0)
    return filtered_diffs


def get_balances(diffs, contract_addresses):
    balances = {}
    for contract_address, contract_name in contract_addresses.items():
        storage_var_address = get_storage_var_address('_balances', contract_address)
        if storage_var_address in diffs.keys():
            balances.update({contract_name: diffs[storage_var_address]})
    return balances


def get_l1_addresses(diffs, contract_addresses):
    l1_addresses = {}
    for contract_address, contract_name in contract_addresses.items():
        storage_var_address = get_storage_var_address('_l1_addresses', contract_address)
        if storage_var_address in diffs.keys():
            l1_addresses.update({contract_name: diffs[storage_var_address]})
    return l1_addresses


if __name__ == "__main__":
    main()
