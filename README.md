# StarkNet DAI Bridge

## Setup

Create and open a Python3.7 virtual environment. Run the following to install the Python dependencies.
```
pip install -r requirements.txt
```

Install the Node.js dependencies.
```
yarn install
```

Setup environment variables.
```
cp .env.example .env
```

In `.env` set the `INFURA_API_KEY` and `MNEMONIC` variables.


## Run local environment
In a separate terminal, run the following to start the hardhat chain
```
yarn chain
```

Deploy the L1 contracts
```
yarn deploy:l1:escrow --network localhost
yarn deploy:l1:bridge --network localhost
```


Deploy the L2 contracts
```
yarn deploy:l2:dai
yarn deploy:l2:bridge
```


The deploy contracts and abi are stored in a json in `./deployments/NETWORK/CONTRACT_NAME.json`.
