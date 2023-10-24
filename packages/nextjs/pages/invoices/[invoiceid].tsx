"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { storageChains } from "../../config/storage-chain";
import USDTabi from "../../generated/USDTabi.json";
import azuroAbi from "../../generated/azuroDoubleAbi.json";
// import testabi from "../../generated/testabi.json";
import { useEthersV5Provider } from "../../hooks/ethers/use-ethers-v5-provider";
import { useEthersV5Signer } from "../../hooks/ethers/use-ethers-v5-signer";
import Url from "./url";
import "@rainbow-me/rainbowkit/styles.css";
import { getPaymentNetworkExtension } from "@requestnetwork/payment-detection";
import { approveErc20, hasErc20Approval, hasSufficientFunds, payRequest } from "@requestnetwork/payment-processor";
import { RequestNetwork, Types, Utils } from "@requestnetwork/request-client.js";
import { prepareWriteContract, sendTransaction, signMessage, writeContract } from "@wagmi/core";
import toast from "react-hot-toast";
import { formatUnits, parseUnits, zeroAddress } from "viem";
// import { textResolverAbi } from "viem/dist/types/constants/abis";
import { useAccount, useContractEvent, useContractRead, useContractWrite, useNetwork, useSwitchNetwork } from "wagmi";
import Loading from "~~/components/Loading";
import {
  getApproveContractConfig,
  getErc20ShieldingTx,
  getShieldSignatureMessage,
} from "~~/utils/railgun/token-shielder";
import launchWallet from "~~/utils/railgun/wallet-engine";

const calculateStatus = (state: string, expectedAmount: bigint, balance: bigint) => {
  if (balance >= expectedAmount) {
    return "Paid";
  }
  if (state === Types.RequestLogic.STATE.ACCEPTED) {
    return "Accepted";
  } else if (state === Types.RequestLogic.STATE.CANCELED) {
    return "Canceled";
  } else if (state === Types.RequestLogic.STATE.CREATED) {
    return "Created";
  } else if (state === Types.RequestLogic.STATE.PENDING) {
    return "Pending";
  }
};

enum APP_STATUS {
  AWAITING_INPUT = "awaiting input",
  SUBMITTING = "submitting",
  PERSISTING_TO_IPFS = "persisting to ipfs",
  PERSISTING_ON_CHAIN = "persisting on-chain",
  REQUEST_CONFIRMED = "request confirmed",
  APPROVING = "approving",
  APPROVED = "approved",
  PAYING = "paying",
  REQUEST_PAID = "request paid",
  PAYMENT_ACCEPTED = "payment accepted",
  DEGENERACY_APPROVED = "degeneracy approved",
  BET_PLACED = "bet placed",
  BET_WON = "double won",
  BET_LOST = "double lost",
  PAYOUT_WITHDRAWN = "payout withdrawn",
  ERROR_OCCURRED = "error occurred",
}

export default function Home() {
  const [storageChain, setStorageChain] = useState("100");
  const [approved, setApproved] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [confirmationDigits, setConfirmationDigits] = useState("");
  const router = useRouter();
  const { invoiceid } = router.query;
  const [status, setStatus] = useState(APP_STATUS.AWAITING_INPUT);
  const { address } = useAccount();
  const { chain } = useNetwork();
  const { chains, error, isLoading: isSwitchNetworkLoading, switchNetwork } = useSwitchNetwork();
  const [requestData, setRequestData] = useState<Types.IRequestDataWithEvents>();
  const provider = useEthersV5Provider();
  const signer = useEthersV5Signer();
  const [loading, setLoading] = useState(true);

  const [zkAddress, setZkAddress] = useState(null);

  let payout: number;

  const { write: bet } = useContractWrite({
    address: "0x40FE3b7d707D8243E7800Db704A55d7AAbe3B2d4",
    abi: azuroAbi,
    functionName: "bet",
  });

  const { data: gameResults } = useContractRead({
    address: "0x40FE3b7d707D8243E7800Db704A55d7AAbe3B2d4",
    abi: azuroAbi,
    functionName: "games",
  });

  const { write: approveUSDT } = useContractWrite({
    address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    abi: USDTabi,
    functionName: "approve",
  });

  const { write: withdrawAmountWon } = useContractWrite({
    address: "0x40FE3b7d707D8243E7800Db704A55d7AAbe3B2d4",
    abi: azuroAbi,
    functionName: "betPayout",
  });

  // TEST MOCK CONTR.
  /*useContractEvent({
    address: "0x853e0A7A0906102099eB24c5018c6A68B4C45c5b",
    abi: testabi,
    eventName: "GameResultFulfilled",
    listener(log) {
      payout = parseInt(log[0]["args"]["_payout"], 10);
      setFetching(false);
      if (payout > 0) {
        setStatus(APP_STATUS.BET_WON);
      } else {
        setStatus(APP_STATUS.BET_LOST);
      }
    },
  });*/

  useContractEvent({
    address: "0x40FE3b7d707D8243E7800Db704A55d7AAbe3B2d4",
    abi: azuroAbi,
    eventName: "GameResultFulfilled",
    listener(log) {
      payout = parseInt(log[0]["args"]["_payout"], 10);
      setFetching(false);
      if (payout > 0) {
        setStatus(APP_STATUS.BET_WON);
      } else {
        setStatus(APP_STATUS.BET_LOST);
      }
    },
  });

  useEffect(() => {
    setLoading(true);
    const requestClient = new RequestNetwork({
      nodeConnectionConfig: {
        baseURL: "https://xdai.gateway.request.network/",
      },
    });

    requestClient
      .fromRequestId(invoiceid as string)
      .then(request => {
        const _requestData = request.getData();
        setRequestData(_requestData);
        setZkAddress(_requestData.contentData.zkAddressRecipient ?? null);
        // console.log(request.getData());
      })
      .finally(() => {
        setLoading(false);
      });
  }, [address, invoiceid]);

  const getBaseUrl = () => {
    return "https://xdai.gateway.request.network/";
  };

  // console.log(requestData)

  // FUNCTIONS
  async function payTheRequest() {
    const requestClient = new RequestNetwork({
      nodeConnectionConfig: {
        baseURL: getBaseUrl(),
        // baseURL: storageChains.get(storageChain)?.gateway,
      },
    });

    try {
      const _request = await requestClient.fromRequestId(requestData?.requestId);
      let _requestData = _request.getData();
      const paymentTx = await payRequest(_requestData, signer);
      await paymentTx.wait(2);

      // Poll the request balance once every second until payment is detected
      // TODO Add a timeout
      while (_requestData.balance?.balance < _requestData.expectedAmount) {
        _requestData = await _request.refresh();
        alert(`balance = ${_requestData.balance?.balance}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      toast.success(`Payment detected!`);
      setRequestData(_requestData);
      setStatus(APP_STATUS.REQUEST_PAID);
    } catch (err) {
      setStatus(APP_STATUS.ERROR_OCCURRED);
      alert(err);
      console.log(err);
    }
  }

  async function approveBet() {
    const requestClient = new RequestNetwork({
      nodeConnectionConfig: {
        baseURL: storageChains.get(storageChain)?.gateway,
      },
    });

    const _request = await requestClient.fromRequestId(requestData?.requestId);
    const _requestData = _request.getData();

    try {
      const amount = _requestData.expectedAmount;
      //@ts-ignore
      approveUSDT({ args: ["0x40FE3b7d707D8243E7800Db704A55d7AAbe3B2d4", amount] });
    } catch (err) {
      setStatus(APP_STATUS.ERROR_OCCURRED);
      alert(err);
    }
    setTimeout(() => {
      setApproved(true);
      setStatus(APP_STATUS.DEGENERACY_APPROVED);
    }, 10000);
  }

  async function doubleYourIncome() {
    const requestClient = new RequestNetwork({
      nodeConnectionConfig: {
        baseURL: storageChains.get(storageChain)?.gateway,
      },
    });

    const _request = await requestClient.fromRequestId(requestData?.requestId);
    const _requestData = _request.getData();

    try {
      const amount = _requestData.expectedAmount;
      //@ts-ignore
      bet({ args: [amount] });
    } catch (err) {
      setStatus(APP_STATUS.ERROR_OCCURRED);
      alert(err);
    }

    setFetching(true);
    setStatus(APP_STATUS.BET_PLACED);
  }

  // // NOT USED DUE TO RAILGUN ISSUES
  // async function acceptPayment() {
  //   const signatureProvider = new Web3SignatureProvider(walletClient);
  //   const requestClient = new RequestNetwork({
  //     nodeConnectionConfig: {
  //       baseURL: storageChains.get(storageChain)!.gateway,
  //     },
  //     signatureProvider: signatureProvider,
  //   });

  //   try {
  //     const _request = await requestClient.fromRequestId(requestData!.requestId);
  //     let _requestData = _request.getData();

  //     const ETHEREUM_ADDRESS = "ethereumAddress";
  //     const ETHEREUM_SMART_CONTRACT = "ethereumSmartContract";

  //     const identity = {
  //       type: ETHEREUM_ADDRESS,
  //       value: requestData?.payee?.value,
  //     };
  //     //@ts-ignore
  //     const declareReceivedTx = await _request.declareReceivedPayment(
  //       _requestData.expectedAmount,
  //       "thank you",
  //       requestData?.payee,
  //     );
  //     console.log(declareReceivedTx);
  //     while (_requestData.state != Types.RequestLogic.STATE.ACCEPTED) {
  //       _requestData = await _request.refresh();
  //       alert(`state = ${_requestData.state}`);
  //       await new Promise(resolve => setTimeout(resolve, 1000));
  //     }
  //     alert(`payment accepted!`);
  //     setRequestData(_requestData);
  //     setStatus(APP_STATUS.PAYMENT_ACCEPTED);
  //   } catch (err) {
  //     setStatus(APP_STATUS.ERROR_OCCURRED);
  //     console.log(err);
  //     alert(err);
  //   }
  // }

  function handlePay(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();

    setStatus(APP_STATUS.PAYING);
    payTheRequest();
  }

  function handleApproveBet(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    approveBet();
  }

  function handleDoubleYourIncome(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    doubleYourIncome();
  }

  async function approve() {
    const requestClient = new RequestNetwork({
      nodeConnectionConfig: {
        baseURL: storageChains.get(storageChain)?.gateway,
      },
    });

    try {
      const _request = await requestClient.fromRequestId(requestData?.requestId);
      const _requestData = _request.getData();

      if (
        getPaymentNetworkExtension(_requestData)?.id === Types.Extension.PAYMENT_NETWORK_ID.ERC20_FEE_PROXY_CONTRACT
      ) {
        toast.success(`ERC20 Request detected. Checking approval...`);
        const _hasErc20Approval = await hasErc20Approval(_requestData, address as string, provider);
        toast.success(`_hasErc20Approval = ${_hasErc20Approval}`);
        if (!_hasErc20Approval) {
          const approvalTx = await approveErc20(_requestData, signer);
          await approvalTx.wait(2);
        }
      }
      setStatus(APP_STATUS.APPROVED);
    } catch (err) {
      setStatus(APP_STATUS.REQUEST_CONFIRMED);
      alert(JSON.stringify(err));
    }
  }

  function handleApprove(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();

    setStatus(APP_STATUS.APPROVING);
    approve();
  }

  function handleConfirmation() {
    //@ts-ignore
    if (confirmationDigits === requestData.payee?.value.slice(-6)) {
      // Check if the last 6 digits match
      //@ts-ignore
      document.getElementById("confirmation_modal").close(); // Close the modal
      setStatus(APP_STATUS.PAYING);
      payTheRequest(); // Continue with the payment process
    } else {
      // alert("The digits entered do not match. Please try again.");
      toast.error("Not implemented yet");
    }
  }

  // this part is needed to handle the withdrawal
  function withdrawPayout() {
    try {
      withdrawAmountWon();
      setStatus(APP_STATUS.PAYOUT_WITHDRAWN);
    } catch (err) {
      setStatus(APP_STATUS.ERROR_OCCURRED);
      alert(err);
    }
  }

  function handleWidthdrawPayout(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    withdrawPayout();
  }

  function degeneracyButtonTextManager(): string {
    if (status === APP_STATUS.PAYOUT_WITHDRAWN) {
      return "WITHDRAW CONFIRMING: BUY YOURSELF A GELATO";
    } else if (status === APP_STATUS.BET_LOST) {
      return "YOU LOST: SAY GOODBYE TO YOUR MONEY...";
    } else if (status === APP_STATUS.BET_WON) {
      return "YOU WON: CLICK HERE TO CLAIM THE PRIZE!";
    } else if (status === APP_STATUS.BET_PLACED) {
      return "CALCULATING... PLEASE WAIT";
    } else if (status === APP_STATUS.DEGENERACY_APPROVED) {
      return "DOUBLE OR NOTHING";
    } else if (!approved) {
      return "APPROVE DEGENERACY";
    }
  }

  function disableDegenButton(): boolean {
    if (status === APP_STATUS.BET_PLACED || status === APP_STATUS.BET_LOST) {
      return true;
    } else {
      return false;
    }
  }

  function degeneracyButtonManager(e: any): any {
    if (status === APP_STATUS.BET_WON) {
      return handleWidthdrawPayout(e);
    } else if (!approved) {
      return handleApproveBet(e);
    } else if (!fetching && status === APP_STATUS.DEGENERACY_APPROVED) {
      return handleDoubleYourIncome(e);
    } else {
      return null;
    }
  }

  async function handlePayZk(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    await launchWallet();

    // ERC20 approve for railgunSmartWalletContract
    // TODO control the allowance
    try {
      const { request } = await prepareWriteContract(getApproveContractConfig(requestData, chain));
      const { hash: approveHash } = await writeContract(request);
      console.log("hash approve", approveHash);
    } catch (error) {
      toast.error("Approve failed");
      return;
    }

    // start shielding
    let signedShieldSignMsg: string;
    try {
      const shieldSignatureMessage: string = getShieldSignatureMessage();
      signedShieldSignMsg = await signMessage({
        message: shieldSignatureMessage,
      });
    } catch (error) {
      console.log(error);
      toast.error("Signature failed");
      return;
    }

    // get tx for shielding
    let shieldingTX;
    try {
      shieldingTX = await getErc20ShieldingTx(signedShieldSignMsg, chain, requestData, address);
      console.log("tx", shieldingTX);
    } catch (error) {
      console.log(error);
      toast.error("Can't create a tx");
      return;
    }

    // const configShieldTx = await prepareSendTransaction(shieldingTX);

    // send tx with our wallet (via Wagmi in this case)
    try {
      const { hash: shieldHash } = await sendTransaction(shieldingTX);
      console.log("hash shield", shieldHash);
    } catch (error) {
      console.log(error);
      toast.error("Tx sending failed");
    }
  }

  if (loading) return <Loading />;

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-4/5 md:w-1/2 mt-12">
        <h3 className="text-center text-xl font-bold mb-4">Invoice</h3>
        <p className="text-xs break-all">id: {invoiceid}</p>

        <div className="my-8">
          <div className="flex justify-between">
            <span className="font-medium">From:</span>
            <span className="hidden lg:block">{requestData?.payer?.value}</span>
            <span className="block lg:hidden">
              {requestData?.payer?.value.slice(0, 5) + "..." + requestData?.payer?.value.slice(-6)}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="font-medium">To:</span>
            <span className="hidden lg:block">{requestData?.payee?.value}</span>
            <span className="block lg:hidden">
              {requestData?.payee?.value.slice(0, 5) + "..." + requestData?.payee?.value.slice(-6)}
            </span>{" "}
          </div>

          {zkAddress && (
            <div className="flex justify-between">
              <span className="font-medium">To zk address:</span>
              <span className="block">{zkAddress.slice(0, 5) + "..." + zkAddress.slice(-6)}</span>{" "}
            </div>
          )}
        </div>

        <div className="my-8">
          <div className="flex justify-between">
            <span className="font-medium">Amount:</span>
            <span>
              {requestData?.expectedAmount ? formatUnits(BigInt(requestData?.expectedAmount as any), 6) : null} USDT
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">Reason:</span>
            <span>{requestData?.contentData.reason}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">Status:</span>
            <span>
              {requestData &&
                calculateStatus(
                  requestData?.state as any,
                  BigInt(requestData?.expectedAmount as any),
                  BigInt(requestData?.balance?.balance || 0),
                )}
            </span>
          </div>
        </div>

        {/* {requestData?.payer?.value === address ? (
          <ul className="list-disc pl-5 mb-4 my-12">
            <li className="mb-2">
              <span>Get FAU on Goerli using the </span>
              <Link href="https://erc20faucet.com/" target="_blank" className="text-blue-500 underline">
                ERC20 Faucet by peppersec
              </Link>
            </li>
            <li>
              <span>Get USDC on Goerli using the </span>
              <Link href="https://usdcfaucet.com/" target="_blank" className="text-blue-500 underline">
                USDC Faucet by blockpatron
              </Link>
            </li>
          </ul>
        ) : null} */}

        {requestData?.payer?.value === address ? (
          <div className="my-16">
            <h4 className="text-lg font-semibold my-4 text-center">Pay an invoice</h4>

            <button
              disabled={!switchNetwork || !requestData || requestData?.currencyInfo.network === chain?.network}
              onClick={() =>
                switchNetwork?.(chains.find(chain => chain.network === requestData?.currencyInfo.network)?.id)
              }
              className="btn w-full mb-4"
            >
              Switch to Payment Chain: {requestData?.currencyInfo.network}
              {isSwitchNetworkLoading && " (switching)"}
            </button>

            <button type="button" onClick={handleApprove} className="btn w-full mb-4">
              Approve
            </button>
            <div className="text-red-500 mb-4">
              {!switchNetwork && "Programmatic switch network not supported by wallet."}
            </div>
            <div className="text-red-500 mb-4">{error && error.message}</div>

            {/* @ts-ignore */}

            {/* confirmation modal */}
            <dialog id="confirmation_modal" className="modal">
              <div className="modal-box bg-white">
                <h3 className="font-bold text-lg">Confirmation</h3>
                <p>Please confirm by writing the last 6 digits of the receiver address.</p>
                <input
                  type="text"
                  className="input input-bordered w-full mb-4"
                  maxLength={6}
                  value={confirmationDigits}
                  onChange={e => setConfirmationDigits(e.target.value)}
                />
                <div className="modal-action">
                  <button className="btn btn-primary" onClick={handleConfirmation}>
                    Confirm
                  </button>

                  <button
                    className="btn bg-white"
                    onClick={() => document.getElementById("confirmation_modal").close()}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </dialog>

            {!zkAddress ? (
              <button type="button" onClick={handlePay} className="btn btn-primary w-full mb-4">
                Pay now
              </button>
            ) : (
              <button type="button" onClick={handlePayZk} className="btn btn-primary w-full mb-4">
                Pay via Railgun
              </button>
            )}

            {/* <h4 className="text-lg font-semibold my-4">Info</h4> */}
            {/* <p className="">App status: {status}</p>
            <p className="">Request state: {requestData?.state}</p> */}
            {/* <pre className="bg-gray-200 p-4 rounded">{JSON.stringify(requestData, undefined, 2)}</pre> */}
          </div>
        ) : null}

        {requestData?.payee?.value === address && (
          <div className="my-16">
            <h4 className="text-lg font-semibold my-4 text-center">Manage</h4>

            <button
              disabled={!switchNetwork || !requestData || requestData?.currencyInfo.network === chain?.network}
              onClick={() =>
                switchNetwork?.(chains.find(chain => chain.network === requestData?.currencyInfo.network)?.id)
              }
              className="btn w-full mb-4"
            >
              Switch to Payment Chain: {requestData?.currencyInfo.network}
              {isSwitchNetworkLoading && " (switching)"}
            </button>

            <div className="text-red-500 mb-4">
              {!switchNetwork && "Programmatic switch network not supported by wallet."}
            </div>

            <div className="text-red-500 mb-4">{error && error.message}</div>

            <button
              type="button"
              onClick={e => degeneracyButtonManager(e)}
              className={approved ? "btn btn-primary w-full mb-4" : "btn w-full mb-4"}
              disabled={disableDegenButton()}
            >
              {degeneracyButtonTextManager()}
            </button>

            <div className="my-8">
              <h4 className="text-lg font-semibold my-4 text-center">Info</h4>
              <p className="my-0">App status: {status}</p>
              <p className="my-0">Invoice state: {requestData?.state}</p>
            </div>
          </div>
        )}
        <div className="my-16">
          <Url />
        </div>
      </div>
    </div>
  );
}
