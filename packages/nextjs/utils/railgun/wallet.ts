import { createRailgunWallet } from '@railgun-community/wallet';
import { NetworkName } from '@railgun-community/shared-models';
import { setEncryptionKeyFromPassword } from './encryption-key';

import { Mnemonic, randomBytes } from "ethers";

const mnemonic = Mnemonic.fromEntropy(randomBytes(16)).phrase.trim();
const encryptionKey = await setEncryptionKeyFromPassword("test-password");

type MapType<T> = {
  [key: string]: T;
};

// Block numbers for each chain when wallet was first created.
// If unknown, provide undefined.
const creationBlockNumberMap: MapType<number> = {
  [NetworkName.Ethereum]: 15725700,
  [NetworkName.Polygon]: 3421400,
  [NetworkName.EthereumGoerli]: 9820703,
};

const railgunWalletInfo = await createRailgunWallet(encryptionKey, mnemonic, creationBlockNumberMap);
const id = railgunWalletInfo.id; // Store this value.

localStorage.setItem("walletId", id);

// railgunWalletInfo contains other useful information, like the wallet's RAILGUN address, i.e. '0zk987...654'
