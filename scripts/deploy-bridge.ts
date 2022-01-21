import { deployBridge, printAddresses } from "./deploy";

deployBridge()
  .then(() => console.log("Successfully deployed"))
  .then(() => printAddresses())
  .catch((err) => console.log(err));
