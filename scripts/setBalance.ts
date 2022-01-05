import { ethers } from "ethers";


function call() {
  const provider = ethers.getDefaultProvider("http://localhost:8545");
  const mnemonic: string | undefined = process.env.MNEMONIC;
  if (!mnemonic) {
    throw new Error("Please set your MNEMONIC in a .env file");
  }
  const addressFromMnemonic = ethers.Wallet.fromMnemonic(mnemonic).address;
  // const _address = address || addressFromMnemonic;
  const _address = addressFromMnemonic;
  void provider.getBalance(_address).then(balance => {
    console.log(balance);
  });
}

call();
