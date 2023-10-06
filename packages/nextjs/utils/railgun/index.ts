// main.ts
import { createArtifactStore } from "./create-artifact-store";
import { FallbackProviderJsonConfig, NetworkName } from "@railgun-community/shared-models";
import { setLoggers, startRailgunEngine } from "@railgun-community/wallet";
import { loadProvider } from "@railgun-community/wallet";
import LevelDB from "level-js";

// We'll get to this in Step 2: Build a persistent store

const initializeEngine = (): void => {
  // Name for your wallet implementation.
  // Encrypted and viewable in private transaction history.
  // Maximum of 16 characters, lowercase.
  const walletSource = "quickstart demo";

  // LevelDOWN compatible database for storing encrypted wallets.
  const dbPath = "engine.db";
  const db = new LevelDB(dbPath);

  // Whether to forward Engine debug logs to Logger.
  const shouldDebug = true;

  // Persistent store for downloading large artifact files required by Engine.
  const artifactStore = createArtifactStore();

  // Whether to download native C++ or web-assembly artifacts.
  // True for mobile. False for nodejs and browser.
  const useNativeArtifacts = false;

  // Whether to skip merkletree syncs and private balance scans.
  // Only set to TRUE in shield-only applications that don't
  // load private wallets or balances.
  const skipMerkletreeScans = false;

  startRailgunEngine(walletSource, db, shouldDebug, artifactStore, useNativeArtifacts, skipMerkletreeScans);
};

const loadEngineProvider = async () => {
  const ETH_PROVIDERS_JSON: FallbackProviderJsonConfig = {
    chainId: 1,
    providers: [
      // The following are example providers. Use your preferred providers here.
      {
        provider: "https://cloudflare-eth.com/",
        priority: 1,
        weight: 1,
      },
      {
        provider: "https://rpc.ankr.com/eth",
        priority: 2,
        weight: 1,
      },
    ],
  };

  const shouldDebug = 1;

  const { feesSerialized } = await loadProvider(ETH_PROVIDERS_JSON, NetworkName.Ethereum, shouldDebug);
  return feesSerialized;
};

const setEngineLoggers = () => {
  const logMessage: Optional<(msg: any) => void> = console.log;
  const logError: Optional<(err: any) => void> = console.error;
  setLoggers(logMessage, logError);
};

// App launch
try {
  initializeEngine();
  setEngineLoggers();
  await loadEngineProvider();
} catch (err) {
  // Handle err
}
