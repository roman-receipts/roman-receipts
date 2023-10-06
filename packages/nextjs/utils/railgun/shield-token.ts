import {
  RailgunERC20AmountRecipient,
  NetworkName,
  EVMGasType,
  TransactionGasDetails
} from '@railgun-community/shared-models';
import {
  gasEstimateForShield,
  getShieldPrivateKeySignatureMessage,
  populateShield
} from '@railgun-community/wallet';
import { keccak256, Wallet } from 'ethers';

// Formatted token amounts and recipients.
const erc20AmountRecipients: RailgunERC20AmountRecipient[] = [
  {
    tokenAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
    amount: BigInt('0x10'), // hexadecimal amount
    recipientAddress: '0zk123...456', // RAILGUN address
  },
  {
    tokenAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
    amount: BigInt('0x20'), // hexadecimal amount
    recipientAddress: '0zk987...654', // RAILGUN address
  },
];

// The shieldPrivateKey enables the sender to decrypt 
// the receiver's address in the future.
const pKey = ...; // Private key of public wallet we are shielding from
const wallet = new Wallet(pKey);
const shieldSignatureMessage = getShieldPrivateKeySignatureMessage();
const shieldPrivateKey = keccak256(
  await wallet.signMessage(shieldSignatureMessage),
);



// Address of public wallet we are shielding from
const fromWalletAddress = '0xab5801a7d398351b8be11c439e05c5b3259aec9b';

const { gasEstimate } = await gasEstimateForShield(
  NetworkName.Ethereum,
  shieldPrivateKey,
  erc20AmountRecipients,  
  [], // nftAmountRecipients
  fromWalletAddress,
);


const evmGasType = EVMGasType.Type2, // Depends on the chain (BNB uses type 0)
const gasEstimate = ...; // Output from gasEstimateForShield in above example

// Proper calculation of gas Max Fee and gas Max Priority Fee is not covered in this guide. See: https://docs.alchemy.com/docs/how-to-build-a-gas-fee-estimator-using-eip-1559
const maxFeePerGas: BigInt('0x100000');
const maxPriorityFeePerGas: BigInt('0x010000');

const gasDetails: TransactionGasDetails = {
  evmGasType,
  gasEstimate,
  maxFeePerGas,
  maxPriorityFeePerGas,
}

const { transaction } = await populateShield(
  NetworkName.Ethereum,
  shieldPrivateKey,
  erc20AmountRecipients,  
  [], // nftAmountRecipients
  gasDetails,
);

// Public wallet to shield from.
transaction.from = '0xab5...c9b';

// Send transaction. e.g. const wallet = new Wallet(pKey, provider); wallet.sendTransaction(transaction); from ethers.js