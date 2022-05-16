import axios from "axios";
import { task } from "hardhat/config";

import { getRequiredEnv } from "./utils";

async function inspectWards(key: string) {
  const address = `0x${BigInt(getRequiredEnv(key)).toString(16)}`;

  const url = `http://starknet.events/api/v1/get_events?chain_id=mainnet&contract=${address}&from_block=0&name=Rely&name=Deny`;
  const response: any = await axios.get(url);
  const log = response.data.items.map(
    (event: any) =>
      `${event.timestamp} - ${event.name} ${event.parameters[0].value}`
  );
  const wards = response.data.items.reduce((s: Set<string>, event: any) => {
    if (event.name === "Rely") {
      s.add(event.parameters[0].value);
    } else {
      s.delete(event.parameters[0].value);
    }
    return s;
  }, new Set());

  console.log(key, address);
  console.log("Logs");
  console.log(log.join("\n"));
  console.log("Wards");
  console.log(Array.from(wards).join("\n"));
}

task("inspect-wards", "Inspect wards").setAction(async () => {
  await inspectWards(`ALPHA_MAINNET_L2_DAI_ADDRESS`);
  await inspectWards(`ALPHA_MAINNET_L2_DAI_BRIDGE`);
});
