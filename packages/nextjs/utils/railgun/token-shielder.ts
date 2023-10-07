import { NetworkName, RailgunERC20AmountRecipient } from "@railgun-community/shared-models";
import { EVMGasType, TransactionGasDetails, getEVMGasTypeForTransaction } from "@railgun-community/shared-models";
import { gasEstimateForShield, getShieldPrivateKeySignatureMessage, populateShield } from "@railgun-community/wallet";
import { prepareWriteContract, erc20ABI } from "@wagmi/core";
import { ContractTransaction } from 'ethers';

import {
  ShieldNote,
  RailgunEngine,
  ShieldRequestStruct,
  randomHex,
  hexToBytes,
  ShieldNoteERC20,
  ShieldNoteNFT,
  ERC721_NOTE_VALUE,
} from '@railgun-community/engine';

import {
  RailgunPopulateTransactionResponse,
  RailgunTransactionGasEstimateResponse,
  NetworkName,
  RailgunERC20AmountRecipient,
  RailgunNFTAmountRecipient,
  NFTTokenType,
  TransactionGasDetails,
  calculateGasLimit,
} from '@railgun-community/shared-models';

export const getShieldSignatureMessage: () => string = () => {
  return getShieldPrivateKeySignatureMessage();
};

//   const shieldPrivateKey = keccak256(
//     await wallet.signMessage(shieldSignatureMessage),
//   );

const getGasDetails: (network: any, gasEstimate: bigint) => TransactionGasDetails = (
  network: any,
  gasEstimate: bigint,
) => {
  const evmGasType = getEVMGasTypeForTransaction(network.name, true);

  // Proper calculation of gas Max Fee and gas Max Priority Fee is not covered in this guide. See: https://docs.alchemy.com/docs/how-to-build-a-gas-fee-estimator-using-eip-1559
  const maxFeePerGas = BigInt("0x100000");
  const maxPriorityFeePerGas = BigInt("0x010000");

  const gasPrice = BigInt("0x1234567890"); // TODO change this

  if (evmGasType === EVMGasType.Type0) {
    return {
      evmGasType,
      gasEstimate,
      gasPrice,
    };
  } else if (evmGasType === EVMGasType.Type1) {
    return {
      evmGasType,
      gasEstimate,
      gasPrice,
    };
  } else {
    return {
      evmGasType,
      gasEstimate,
      maxFeePerGas,
      maxPriorityFeePerGas,
    };
  }
};

// tx to send
export const getErc20ShieldingTx = async (shieldPrivateKey: string, network: any, request: any, from: any) => {
  const erc20AmountRecipients: RailgunERC20AmountRecipient[] = [
    {
      tokenAddress: request.currencyInfo.value,
      amount: BigInt(request.expectedAmount),
      // amount: request.hexAmount, // ethers.utils.parseUnits(request.expectedAmount, tokenDecimals).toHexString(), // must be hex request.expectedAmount), // hexadecimal amount
      recipientAddress: request.zkAddress, // RAILGUN address
    },
  ];

  // const { gasEstimate } = await gasEstimateForShield(
  //   getNetworkName(network),
  //   shieldPrivateKey,
  //   erc20AmountRecipients,
  //   [], // nftAmountRecipients
  //   from,
  // );

  // const gasDetails = getGasDetails(network, gasEstimate);

  // const { transaction } = await populateShield(network.name, shieldPrivateKey, erc20AmountRecipients, [], gasDetails);

  console.log(getNetworkName(network));
  const { transaction } = await populateShield(getNetworkName(network), shieldPrivateKey, erc20AmountRecipients, []);

  return transaction;
};

export const getConfigForApprove = async (request: any, network: any) => {
  console.log(network, request);
  const config = await prepareWriteContract({
    address: request.currencyInfo.value,
    abi: erc20ABI,
    functionName: "approve",
    args: [getRailgunSmartWalletContract(network), BigInt(request.expectedAmount)],
  });

  return config;
};

const getRailgunSmartWalletContract = (chain: any) => {
  if (chain.name === "goerli") {
    return "0x14a57CA7C5c1AD54fB6c642f428d973fcD696ED4";
  } else if (chain.name === "Polygon") {
    return "0x19B620929f97b7b990801496c3b361CA5dEf8C71";
  }
};

const getNetworkName = (chain: any) => {
  console.log(chain)
  if (chain.network === "goerli") {
    return NetworkName.EthereumGoerli;
  } else if (chain.name === "Polygon") {
    return NetworkName.Polygon;
  }
};

export const populateShield = async (
  networkName: NetworkName,
  shieldPrivateKey: string,
  erc20AmountRecipients: RailgunERC20AmountRecipient[],
  nftAmountRecipients: RailgunNFTAmountRecipient[],
  gasDetails?: TransactionGasDetails,
): Promise<RailgunPopulateTransactionResponse> => {
  // try {
    const transaction = await generateShieldTransaction(
      networkName,
      shieldPrivateKey,
      erc20AmountRecipients,
      nftAmountRecipients,
    );

    if (gasDetails) {
      const sendWithPublicWallet = true;
      setGasDetailsForTransaction(
        networkName,
        transaction,
        gasDetails,
        sendWithPublicWallet,
      );
    }

    return {
      transaction,
    };
  // } catch (err) {
    
  // }
};

export const generateShieldTransaction = async (
  networkName: NetworkName,
  shieldPrivateKey: string,
  erc20AmountRecipients: RailgunERC20AmountRecipient[],
  // nftAmountRecipients: RailgunNFTAmountRecipient[],
): Promise<ContractTransaction> => {
  // try {
    const railgunSmartWalletContract =
      getRailgunSmartWalletContractForNetwork(networkName);
    const random = randomHex(16);

    const shieldInputs: ShieldRequestStruct[] = await Promise.all([
      ...erc20AmountRecipients.map(erc20AmountRecipient =>
        generateERC20ShieldRequests(
          erc20AmountRecipient,
          random,
          shieldPrivateKey,
        ),
      ),
      [],
    ]);

    const transaction = await railgunSmartWalletContract.generateShield(
      shieldInputs,
    );
    return transaction;

};

export const setGasDetailsForTransaction = (
  networkName: NetworkName,
  transaction: ContractTransaction,
  gasDetails: TransactionGasDetails,
  sendWithPublicWallet: boolean,
) => {
  const { gasEstimate } = gasDetails;

  // eslint-disable-next-line no-param-reassign
  transaction.gasLimit = calculateGasLimit(gasEstimate);

  const evmGasType = getEVMGasTypeForTransaction(
    networkName,
    sendWithPublicWallet,
  );

  if (gasDetails.evmGasType !== evmGasType) {
    const transactionType = sendWithPublicWallet ? 'self-signed' : 'Relayer';
    throw new Error(
      `Invalid evmGasType for ${networkName} (${transactionType}): expected Type${evmGasType}, received Type${gasDetails.evmGasType} in gasDetails. Retrieve appropriate gas type with getEVMGasTypeForTransaction (@railgun-community/shared-models).`,
    );
  }

  // eslint-disable-next-line no-param-reassign
  transaction.type = gasDetails.evmGasType;

  switch (gasDetails.evmGasType) {
    case EVMGasType.Type0: {
      // eslint-disable-next-line no-param-reassign
      transaction.gasPrice = gasDetails.gasPrice;
      // eslint-disable-next-line no-param-reassign
      delete transaction.accessList;
      break;
    }
    case EVMGasType.Type1: {
      // eslint-disable-next-line no-param-reassign
      transaction.gasPrice = gasDetails.gasPrice;
      break;
    }
    case EVMGasType.Type2: {
      // eslint-disable-next-line no-param-reassign
      transaction.maxFeePerGas = gasDetails.maxFeePerGas;
      // eslint-disable-next-line no-param-reassign
      transaction.maxPriorityFeePerGas = gasDetails.maxPriorityFeePerGas;
      break;
    }
  }
};

const generateERC20ShieldRequests = async (
  erc20AmountRecipient: RailgunERC20AmountRecipient,
  random: string,
  shieldPrivateKey: string,
): Promise<ShieldRequestStruct> => {
  const railgunAddress = erc20AmountRecipient.recipientAddress;

  // assertValidRailgunAddress(railgunAddress);

  const { masterPublicKey, viewingPublicKey } =
    RailgunEngine.decodeAddress(railgunAddress);

  const shield = new ShieldNoteERC20(
    masterPublicKey,
    random,
    erc20AmountRecipient.amount,
    erc20AmountRecipient.tokenAddress,
  );
  return shield.serialize(hexToBytes(shieldPrivateKey), viewingPublicKey);
};