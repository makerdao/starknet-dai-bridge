import { execSync } from "child_process";
import { ethers } from "ethers";
import fs from "fs";
import { StarknetContract } from "hardhat/types/runtime";
const { sign, ec, privateToStarkKey } = require("./signature");

const DEPLOYMENTS_DIR = `deployments`;
const MASK_250 = BigInt(2 ** 250 - 1);

export function getAddress(contract: string, network: string) {
  try {
    return JSON.parse(
      fs.readFileSync(`./deployments/${network}/${contract}.json`).toString()
    ).address;
  } catch (err) {
    throw Error(
      `${contract} deployment on ${network} not found, run 'yarn deploy:${network}'`
    );
  }
}

export function getAccounts(network: string) {
  const files = fs.readdirSync(`./deployments/${network}`);
  return files
    .filter((file) => file.slice(0, 7) === "account")
    .map((file) => {
      return file.split("-")[1].split(".")[0];
    });
}

export function parseCalldataL1(calldata: string, network: string) {
  const _calldata = calldata ? calldata.split(",") : [];
  const accounts = getAccounts(network);
  return _calldata.map((input: string) => {
    if (accounts.includes(input)) {
      return BigInt(getAddress(`account-${input}`, network)).toString();
    } else if (input === "l2_dai_bridge") {
      return getAddress("l2_dai_bridge", network);
    } else if (input === "L1DAIBridge") {
      return getAddress("L1DAIBridge", network);
    } else {
      return input;
    }
  });
}

function getInputAbi(contract: string, func: string) {
  const abi = JSON.parse(
    fs
      .readFileSync(
        `./starknet-artifacts/contracts/l2/${contract}.cairo/${contract}.json`
      )
      .toString()
  )["abi"];
  let res: any[] = [];
  abi.forEach((_: any) => {
    if (_.name === func) {
      res = _.inputs;
    }
  });
  return res;
}

export function parseCalldataL2(
  calldata: string,
  network: string,
  contract: any,
  func: string
) {
  const _calldata = calldata ? calldata.split(",") : [];
  const accounts = getAccounts(network);
  const res: Record<string, any> = {};
  const inputs = getInputAbi(contract, func);
  for (let i = 0; i < _calldata.length; i++) {
    const input = _calldata[i];
    const inputName: string = inputs[i].name;
    const inputType: string = inputs[i].type;
    if (accounts.includes(input)) {
      res[inputName] = BigInt(
        getAddress(`account-${input}`, network)
      ).toString();
    } else if (input === "l2_dai_bridge") {
      res[inputName] = BigInt(getAddress("l2_dai_bridge", network)).toString();
    } else if (input === "L1DAIBridge") {
      res[inputName] = BigInt(getAddress("L1DAIBridge", network)).toString();
    } else if (inputType === "Uint256") {
      res[inputName] = [input, _calldata[i + 1]];
      i++;
    } else {
      res[inputName] = input;
    }
  }
  return res;
}

export function save(name: string, contract: any, network: string) {
  if (!fs.existsSync(`${DEPLOYMENTS_DIR}/${network}`)) {
    fs.mkdirSync(`${DEPLOYMENTS_DIR}/${network}`, { recursive: true });
  }
  fs.writeFileSync(
    `${DEPLOYMENTS_DIR}/${network}/${name}.json`,
    JSON.stringify({
      address: contract.address,
    })
  );
}

export function getSelectorFromName(name: string) {
  return (
    BigInt(ethers.utils.keccak256(Buffer.from(name))) % MASK_250
  ).toString();
}

export async function callFrom(
  caller: StarknetContract,
  contract: StarknetContract,
  call: string,
  calldata: any[] | any
) {
  const selector = getSelectorFromName(call);
  const _calldata = flatten(calldata);
  return caller.invoke("execute", {
    to: BigInt(contract.address).toString(),
    selector,
    calldata: _calldata,
  });
}

function flatten(calldata: any): any[] {
  const res: any = [];
  Object.values(calldata).forEach((data: any) => {
    if (typeof data === "object") {
      res.push(...data);
    } else {
      res.push(data);
    }
  });
  return res;
}

export class Signer {
  keyPair;
  privateKey;
  publicKey;

  constructor(privateKey: string) {
    this.privateKey = privateKey;
    this.publicKey = privateToStarkKey(privateKey);
    this.keyPair = ec.keyFromPrivate(privateKey, "");
  }

  sign(messageHash: any): any {
    return sign(this.keyPair, messageHash);
  }

  async sendTransaction(
    caller: StarknetContract,
    contract: StarknetContract,
    selectorName: string,
    calldata: any[] | any,
    nonce: number = 0
  ) {
    if (nonce === 0) {
      const executionInfo = await caller.call("get_nonce");
      nonce = executionInfo.res;
    }

    const selector = getSelectorFromName(selectorName);
    const contractAddress = BigInt(contract.address).toString();
    const _calldata = flatten(calldata);
    const _result = execSync(
      `python ./scripts/Signer.py ${this.privateKey} ${caller.address} ${
        contract.address
      } ${selector} ${_calldata.join(",")} ${nonce}`
    );
    const result = _result.toString().split("\n");
    // const messageHash = BigInt(result[0]);
    const sigR = BigInt(result[1]);
    const sigS = BigInt(result[2]);

    /*
    const messageHash = hashMessage(
      caller.address,
      contract.address,
      selector,
      _calldata,
      nonce,
    );
  
    const signature = this.sign(messageHash);
    const publicKey = ec.keyFromPublic(this.publicKey, "");
    const verified = verify(publicKey, messageHash, { r: sigR, s: sigS });
    */

    return caller.invoke(
      "execute",
      {
        to: contractAddress,
        selector,
        calldata: _calldata,
      },
      [sigR, sigS]
    );
  }
}

/*
function computeHashOnElements(data: any[]) {
  let hash = pedersen([data[0], data[1]]);
  for (let i=2; i<data.length; i++) {
    hash = pedersen([hash, data[i]]);
  }
  return hash;
}

function hashMessage(
  sender: any,
  to: any,
  selector: any,
  calldata: any,
  nonce: any,
) {
  const message = [
    sender.slice(3),
    to.slice(3),
    parseInt(selector).toString(16),
    computeHashOnElements(calldata),
    nonce.toString()
  ];
  return computeHashOnElements(message);
}
*/
