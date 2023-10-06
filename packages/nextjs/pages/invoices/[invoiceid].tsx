"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { currencies } from "../../config/currency";
import { storageChains } from "../../config/storage-chain";
import { useEthersV5Provider } from "../../hooks/ethers/use-ethers-v5-provider";
import { useEthersV5Signer } from "../../hooks/ethers/use-ethers-v5-signer";
import styles from "@/app/page.module.css";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { getPaymentNetworkExtension } from "@requestnetwork/payment-detection";
import { approveErc20, hasErc20Approval, hasSufficientFunds, payRequest } from "@requestnetwork/payment-processor";
import { RequestNetwork, Types, Utils } from "@requestnetwork/request-client.js";
import { Web3SignatureProvider } from "@requestnetwork/web3-signature";
import { formatUnits, parseUnits, zeroAddress } from "viem";
import { useAccount, useNetwork, useSwitchNetwork, useWalletClient } from "wagmi";

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
  ERROR_OCCURRED = "error occurred",
}

export default function Home() {
  const [storageChain, setStorageChain] = useState("5");
  const [expectedAmount, setExpectedAmount] = useState("");
  const [currency, setCurrency] = useState("5_0xBA62BCfcAaFc6622853cca2BE6Ac7d845BC0f2Dc");
  const router = useRouter();
  const { invoiceid } = router.query;

  const [paymentRecipient, setPaymentRecipient] = useState("");
  const [payerIdentity, setPayerIdentity] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState(APP_STATUS.AWAITING_INPUT);
  const { data: walletClient, isError, isLoading } = useWalletClient();
  const { address, isConnecting, isDisconnected } = useAccount();
  const { chain } = useNetwork();
  const { chains, error, isLoading: isSwitchNetworkLoading, switchNetwork } = useSwitchNetwork();
  const [requestData, setRequestData] = useState<Types.IRequestDataWithEvents>();
  const provider = useEthersV5Provider();
  const signer = useEthersV5Signer();

  useEffect(() => {
    console.log(invoiceid);
  }, []);

  useEffect(() => {
    const requestClient = new RequestNetwork({
      nodeConnectionConfig: {
        baseURL: "https://goerli.gateway.request.network/",
      },
    });
    requestClient.fromRequestId(invoiceid as string).then(request => {
      setRequestData(request.getData());
      console.log(request.getData());
    });
  }, [address, invoiceid]);

  async function payTheRequest() {
    const requestClient = new RequestNetwork({
      nodeConnectionConfig: {
        baseURL: storageChains.get(storageChain)!.gateway,
      },
    });

    try {
      const _request = await requestClient.fromRequestId(requestData!.requestId);
      let _requestData = _request.getData();
      const paymentTx = await payRequest(_requestData, signer);
      await paymentTx.wait(2);

      // Poll the request balance once every second until payment is detected
      // TODO Add a timeout
      while (_requestData.balance?.balance! < _requestData.expectedAmount) {
        _requestData = await _request.refresh();
        alert(`balance = ${_requestData.balance?.balance}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      alert(`payment detected!`);
      setRequestData(_requestData);
      setStatus(APP_STATUS.REQUEST_PAID);
    } catch (err) {
      setStatus(APP_STATUS.APPROVED);
      alert(err);
    }
  }

  function handlePay(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();

    setStatus(APP_STATUS.PAYING);
    payTheRequest();
  }

  async function approve() {
    const requestClient = new RequestNetwork({
      nodeConnectionConfig: {
        baseURL: storageChains.get(storageChain)!.gateway,
      },
    });

    try {
      const _request = await requestClient.fromRequestId(requestData!.requestId);
      const _requestData = _request.getData();
      alert(`Checking if payer has sufficient funds...`);
      const _hasSufficientFunds = await hasSufficientFunds(_requestData, address as string, { provider: provider });
      alert(`_hasSufficientFunds = ${_hasSufficientFunds}`);
      if (!_hasSufficientFunds) {
        setStatus(APP_STATUS.REQUEST_CONFIRMED);
        return;
      }
      if (
        getPaymentNetworkExtension(_requestData)?.id === Types.Extension.PAYMENT_NETWORK_ID.ERC20_FEE_PROXY_CONTRACT
      ) {
        alert(`ERC20 Request detected. Checking approval...`);
        const _hasErc20Approval = await hasErc20Approval(_requestData, address as string, provider);
        alert(`_hasErc20Approval = ${_hasErc20Approval}`);
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

  async function createRequest() {
    const signatureProvider = new Web3SignatureProvider(walletClient);
    const requestClient = new RequestNetwork({
      nodeConnectionConfig: {
        baseURL: storageChains.get(storageChain)!.gateway,
      },
      signatureProvider,
    });
    const requestCreateParameters: Types.ICreateRequestParameters = {
      requestInfo: {
        currency: {
          type: currencies.get(currency)!.type,
          value: currencies.get(currency)!.value,
          network: currencies.get(currency)!.network,
        },
        expectedAmount: parseUnits(expectedAmount as `${number}`, currencies.get(currency)!.decimals).toString(),
        payee: {
          type: Types.Identity.TYPE.ETHEREUM_ADDRESS,
          value: address as string,
        },
        timestamp: Utils.getCurrentTimestampInSecond(),
      },
      paymentNetwork: {
        id: Types.Extension.PAYMENT_NETWORK_ID.ERC20_FEE_PROXY_CONTRACT,
        parameters: {
          paymentNetworkName: currencies.get(currency)!.network,
          paymentAddress: paymentRecipient || address,
          feeAddress: zeroAddress,
          feeAmount: "0",
        },
      },
      contentData: {
        // Tip: Consider using rnf_invoice v0.0.3 format from @requestnetwork/data-format
        reason: reason,
        dueDate: dueDate,
      },
      signer: {
        type: Types.Identity.TYPE.ETHEREUM_ADDRESS,
        value: address as string,
      },
    };

    if (payerIdentity.length > 0) {
      requestCreateParameters.requestInfo.payer = {
        type: Types.Identity.TYPE.ETHEREUM_ADDRESS,
        value: payerIdentity,
      };
    }

    try {
      setStatus(APP_STATUS.PERSISTING_TO_IPFS);
      const request = await requestClient.createRequest(requestCreateParameters);

      setStatus(APP_STATUS.PERSISTING_ON_CHAIN);
      setRequestData(request.getData());
      const confirmedRequestData = await request.waitForConfirmation();

      setStatus(APP_STATUS.REQUEST_CONFIRMED);
      setRequestData(confirmedRequestData);
    } catch (err) {
      setStatus(APP_STATUS.ERROR_OCCURRED);
      alert(err);
    }
  }

  function canSubmit() {
    return (
      status !== APP_STATUS.SUBMITTING &&
      !isDisconnected &&
      !isConnecting &&
      !isError &&
      !isLoading &&
      storageChain.length > 0 &&
      // Payment Recipient is empty || isAddress
      (paymentRecipient.length === 0 || (paymentRecipient.startsWith("0x") && paymentRecipient.length === 42)) &&
      // Payer is empty || isAddress
      (payerIdentity.length === 0 || (payerIdentity.startsWith("0x") && payerIdentity.length === 42)) &&
      expectedAmount.length > 0 &&
      currency.length > 0
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit()) {
      return;
    }
    setRequestData(undefined);
    setStatus(APP_STATUS.SUBMITTING);
    createRequest();
  }

  function handleClear(_: React.MouseEvent<HTMLButtonElement>) {
    setRequestData(undefined);
    setStatus(APP_STATUS.AWAITING_INPUT);
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
    <div className="bg-white p-8 rounded-lg shadow-md w-4/5 md:w-1/2">
        <h3 className="text-center text-xl font-bold mb-4">Pay an invoice</h3>

        <div className="flex justify-between mb-2">
            <span className="font-medium">From:</span>
            <span>{requestData?.payee?.value}</span>
        </div>

        <div className="flex justify-between mb-2">
            <span className="font-medium">To:</span>
            <span>{requestData?.payer?.value}</span> {/* Assuming this is correct, but you may want to adjust this if "To" and "From" values are different */}
        </div>

        <div className="flex justify-between">
            <span className="font-medium">Amount:</span>
            <span>{requestData?.expectedAmount ? formatUnits(BigInt(requestData?.expectedAmount as any), 18) : null}</span>
        </div>
        <div className="flex justify-between">
            <span className="font-medium">Reason:</span>
            <span>{requestData?.contentData.reason}</span>
        </div>
        <h4 className="text-lg font-semibold my-4">Get Testnet Funds</h4>
        <ul className="list-disc pl-5 mb-4">
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

        <h4 className="text-lg font-semibold my-4">Pay a request</h4>
       
        <button
            disabled={!switchNetwork || !requestData || requestData?.currencyInfo.network === chain?.network}
            onClick={() => switchNetwork?.(chains.find(chain => chain.network === requestData?.currencyInfo.network)?.id)}
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
        <div className="text-red-500 mb-4">
            {error && error.message}
        </div>
        <button type="button" onClick={handlePay} className="btn btn-primary w-full mb-4">
            Pay now
        </button>

        <h4 className="text-lg font-semibold my-4">Request info</h4>
        <button type="button" onClick={handleClear} className="btn btn-secondary w-full mb-4">
            Clear
        </button>
        <p className="mb-2">App status: {status}</p>
        <p className="mb-4">Request state: {requestData?.state}</p>
        <pre className="bg-gray-200 p-4 rounded">{JSON.stringify(requestData, undefined, 2)}</pre>
    </div>
</div>

  );
}