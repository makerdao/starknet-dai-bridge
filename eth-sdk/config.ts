import { defineConfig } from "@dethcrypto/eth-sdk";

export default defineConfig({
  contracts: {
    mainnet: {
      maker: {
        vat: "0x35D1b3F3D7966A1DFe207aa4514C12a259A0492B",
        dai_join: "0x9759A6Ac90977b93B58547b4A71c78317f391A28",
        vow: "0xA950524441892A31ebddF91d3cEEFa04Bf454466",
        dai: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        pause_proxy: "0xBE8E3e3618f7474F8cB1d074A26afFef007E98FB",
        esm: "0x29CfBd381043D00a98fD9904a431015Fef07af2f",
      },
    },

    /*
    goerli: {
      maker: {
        vat: "0xB966002DDAa2Baf48369f5015329750019736031",
        dai_join: "0x6a60b7070befb2bfc964F646efDF70388320f4E0",
        vow: "0x23f78612769b9013b3145E43896Fa1578cAa2c2a",
        pause_proxy: "0x5DCdbD3cCF9B09EAAD03bc5f50fA2B3d3ACA0121",
        esm: "0x023A960cb9BE7eDE35B433256f4AfE9013334b55",
        dai: "0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844",
      },
    },
    */
    goerli: {
      maker: {
        vat: "0x2D833c7bC94409F02aF5bC9C4a5FA28359795CC5",
        dai_join: "0x65dA7Af225fA988B42f002bF05b95c8EE5DCfe9F",
        vow: "0xDAb7bC19b593A7C694AE7484Cd4cB346e372e68C",
        pause_proxy: "0x9FdeD504a45b3C13C96ebca7becDd9677D342340",
        esm: "0x0c2a6328b18091dd243F18e229F7dF442FB52D94",
        dai: "0xd7F24C609825a4348dEc3C856Aa8796696355Fcd",
      },
    },
  },
});
