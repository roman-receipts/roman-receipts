"use client";

import { useState } from "react";
import { currencies } from "../config/currency";
import { storageChains } from "../config/storage-chain";
import styles from "../styles/page.module.css";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { RequestNetwork, Types, Utils } from "@requestnetwork/request-client.js";
import { Web3SignatureProvider } from "@requestnetwork/web3-signature";
import { parseUnits, zeroAddress } from "viem";
import { useAccount, useWalletClient } from "wagmi";

enum APP_STATUS {
  AWAITING_INPUT = "awaiting input",
  SUBMITTING = "submitting",
  PERSISTING_TO_IPFS = "persisting to ipfs",
  PERSISTING_ON_CHAIN = "persisting on-chain",
  REQUEST_CONFIRMED = "request confirmed",
  ERROR_OCCURRED = "error occurred",
}

export default function CreateInvoice() {
  const [storageChain, setStorageChain] = useState("100");
  const [expectedAmount, setExpectedAmount] = useState("");

  const [currency, setCurrency] = useState(
    "137_0xc2132D05D31c914a87C6611C10748AEb04B58e8F"
  );


  const [paymentRecipient, setPaymentRecipient] = useState("");
  const [zkAddressRecipient, setZkAddressRecipient] = useState("");
  const [payerIdentity, setPayerIdentity] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(APP_STATUS.AWAITING_INPUT);
  const { data: walletClient, isError, isLoading } = useWalletClient();
  const { address, isConnecting, isDisconnected } = useAccount();
  const [requestData, setRequestData] = useState<Types.IRequestDataWithEvents>();

  async function createRequest() {
    const signatureProvider = new Web3SignatureProvider(walletClient);
    const requestClient = new RequestNetwork({
      nodeConnectionConfig: {
        baseURL: storageChains.get(storageChain)!.gateway,
      },
      signatureProvider,
      // httpConfig: {
      //   getConfirmationMaxRetry: 40, // timeout after 120 seconds
      // },
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
        // Consider using rnf_invoice format from @requestnetwork/data-format package.
        reason: reason,
        dueDate: dueDate,
        zkAddressRecipient: zkAddressRecipient,
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
      setLoading(false);
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
    setLoading(true);
    createRequest();
  }

 

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 pt-12">
      <div className="bg-white p-8 rounded-lg shadow-md w-4/5 md:w-1/2">
        <h3 className="text-center text-xl font-bold mb-4">Create a invoice</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            Payee Identity *
            <ConnectButton chainStatus="none" showBalance={false} />
          </label>

          <label className="block">
            Storage Chain *
            <select
              name="storage-chain"
              onChange={e => setStorageChain(e.target.value)}
              defaultValue={storageChain}
              className="form-select mt-2 block w-full input border-2 border-secondary"
            >
              {Array.from(storageChains.entries()).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.name} ({value.type})
                </option>
              ))}
            </select>
            </label>
       <label className="block">
            Amount *
            <input
              type="number"
              name="expected-amount"
              step="any"
              onChange={e => setExpectedAmount(e.target.value)}
              className="form-input mt-2 block w-full input border-2 border-secondary"
            />
          </label>

          <label className="block">
            Currency *
            <select
              name="currency"
              onChange={e => setCurrency(e.target.value)}
              defaultValue={currency}
              className="form-select mt-2 block w-full input border-2 border-secondary"
            >
              {Array.from(currencies.entries()).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.symbol}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            ZkAddress Recipient
            <input
              type="text"

              name="payment-recipient-zkaddress"
              placeholder="0zk..."
              onChange={(e) => setZkAddressRecipient(e.target.value)}

              className="form-input mt-2 block w-full input border-2 border-secondary"
            />
          </label>

          <label className="block">
            Payer Identity
            <input
              type="text"
              name="payer-identity"
              placeholder="0x..."
              onChange={e => setPayerIdentity(e.target.value)}
              className="form-input mt-2 block w-full input border-2  border-secondary"
            />
          </label>

          <label className="block">
            Due Date
            <input
              type="date"
              name="due-date"
              onChange={e => setDueDate(e.target.value)}
              className="form-input mt-2 block w-full input border-2 border-secondary"
            />
          </label>

          <label className="block">
            Reason
            <input
              type="text"
              name="reason"
              onChange={e => setReason(e.target.value)}
              className=" mt-2 block w-full input border-2 input border-secondary"
            />
          </label>

          <button type="submit" disabled={!canSubmit()} className="btn btn-primary w-full mt-4">
            Submit
          </button>
        </form>

        <div className="mt-8">
          <h3 className="text-center text-xl font-bold mb-4">Created request</h3>
  
          <div className="flex">
            <p className="font-bold">{status}</p>
            <p> {loading && <span className="loading loading-ring loading-xl "></span>}</p>
          </div>
          <div></div>
          {/* <pre>{JSON.stringify(requestData, undefined, 2)}</pre>*/}
        </div>
      </div>
    </div>
  );
}
