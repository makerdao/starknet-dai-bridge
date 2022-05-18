import assert from "assert";
import { BigNumber, Wallet } from "ethers";
import { arrayify, hashMessage, keccak256 } from "ethers/lib/utils";

interface TeleportGUID {
  sourceDomain: string;
  targetDomain: string;
  receiver: string;
  operator: string;
  amount: string;
  nonce: number;
  timestamp: number;
}

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  assert(value, `Please provide ${key} in .env file`);

  return value;
}

async function signTeleportData(
  teleportData: string,
  signers: any
): Promise<{ signHash: string; signatures: string }> {
  signers = signers.sort((s1: any, s2: any) => {
    const bn1 = BigNumber.from(s1.address);
    const bn2 = BigNumber.from(s2.address);
    if (bn1.lt(bn2)) return -1;
    if (bn1.gt(bn2)) return 1;
    return 0;
  });

  const guidHash = keccak256(teleportData);
  const sigs = await Promise.all(
    signers.map((signer: any) => signer.signMessage(arrayify(guidHash)))
  );
  const signatures = `0x${sigs.map((sig: any) => sig.slice(2)).join("")}`;
  const signHash = hashMessage(arrayify(guidHash));
  return { signHash, signatures };
}

export async function generateAttestation(
  eventData: any[]
): Promise<{ signatures: string; teleportGUID: TeleportGUID }> {
  const sourceDomain = `0x${BigInt(eventData[0])
    .toString(16)
    .padStart(64, "0")}`;
  const targetDomain = `0x${BigInt(eventData[1])
    .toString(16)
    .padStart(64, "0")}`;
  const receiver = `0x${BigInt(eventData[2]).toString(16).padStart(64, "0")}`;
  const operator = `0x${BigInt(eventData[3]).toString(16).padStart(64, "0")}`;
  const amount = `0x${BigInt(eventData[4]).toString(16)}`;
  const nonce = parseInt(eventData[5]);
  const date = new Date(parseInt(eventData[6]));
  const timestamp = date.getTime();
  let message = "0x";
  message += sourceDomain.slice(2);
  message += targetDomain.slice(2);
  message += receiver.slice(2);
  message += operator.slice(2);
  message += amount.slice(2).padStart(64, "0");
  message += nonce.toString(16).padStart(64, "0");
  message += timestamp.toString(16).padStart(64, "0");

  const oracleMnemonic = getRequiredEnv("ORACLE_MNEMONIC");
  const oracleWallet = Wallet.fromMnemonic(oracleMnemonic);
  const { signatures } = await signTeleportData(message, [oracleWallet]);
  return {
    signatures,
    teleportGUID: {
      sourceDomain,
      targetDomain,
      receiver,
      operator,
      amount,
      nonce,
      timestamp,
    },
  };
}
