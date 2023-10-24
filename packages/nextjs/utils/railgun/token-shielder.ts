import { keccak256 } from "@ethersproject/keccak256";
import { parseUnits } from "@ethersproject/units";
import {
  EVMGasType,
  NetworkName,
  RailgunERC20AmountRecipient,
  TransactionGasDetails,
  getEVMGasTypeForTransaction,
} from "@railgun-community/shared-models";
import {
  gasEstimateForShield,
  getRailgunSmartWalletContractForNetwork,
  getShieldPrivateKeySignatureMessage,
  populateShield,
} from "@railgun-community/wallet";
import { erc20ABI } from "@wagmi/core";

export const getApproveContractConfig = (request: any, chain: any) => {
  const network = getNetworkName(chain);
  const railgunSmartWalletContract = getRailgunSmartWalletContractForNetwork(network).address as `0x{string}`;
  const contractConfig = {
    address: request.currencyInfo.value,
    abi: erc20ABI,
    functionName: "approve",
    args: [railgunSmartWalletContract, BigInt(request.expectedAmount)],
  };

  return contractConfig;
};

export const getShieldSignatureMessage: () => string = () => {
  return getShieldPrivateKeySignatureMessage();
};

export const getErc20ShieldingTx = async (signedShieldSignMsg: string, network: any, request: any, from: any) => {
  const erc20AmountRecipients: RailgunERC20AmountRecipient[] = [
    {
      tokenAddress: request.currencyInfo.value,
      amount: parseUnits(request.expectedAmount, "wei").toHexString(),
      recipientAddress: request.contentData.zkAddressRecipient,
    },
  ];

  const shieldPrivateKey = keccak256(signedShieldSignMsg);

  const { gasEstimate } = await gasEstimateForShield(
    getNetworkName(network),
    shieldPrivateKey,
    erc20AmountRecipients,
    [], // nftAmountRecipients
    from,
  );

  const gasDetails = getGasDetails(network, gasEstimate);

  const { transaction } = await populateShield(
    getNetworkName(network),
    shieldPrivateKey,
    erc20AmountRecipients,
    [], // nftAmountRecipients
    gasDetails,
  );

  return transaction;
};

const getGasDetails: (network: any, gasEstimate: bigint) => TransactionGasDetails = (
  network: any,
  gasEstimate: bigint,
) => {
  const evmGasType = getEVMGasTypeForTransaction(getNetworkName(network), true);

  // Proper calculation of gas Max Fee and gas Max Priority Fee is not covered in this guide. See: https://docs.alchemy.com/docs/how-to-build-a-gas-fee-estimator-using-eip-1559
  // TODO change this
  const maxFeePerGas = BigInt("0x100000");
  const maxPriorityFeePerGas = BigInt("0x010000");

  const gasPrice = BigInt("0x1234567890");

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

const getNetworkName = (chain: any) => {
  if (chain.network === "goerli") {
    return NetworkName.EthereumGoerli;
  } else if (chain.network === "polygon") {
    return NetworkName.Polygon;
  }
};
