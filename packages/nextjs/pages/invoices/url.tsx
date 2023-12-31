"use client";

import { useRouter } from "next/router";
// import { CopyIcon } from "~~/components/example-ui/assets/CopyIcon";
import { copyToClipboard } from "~~/utils/utils";
import QRCode from "react-qr-code";

export default function Url() {
  const { asPath } = useRouter();

  const getFullUrl = () => {
    // if (typeof window !== 'undefined') {
    //   return window ? `${window.location.protocol}//${window.location.host}${asPath}` : "";
    // }
    // return null;
    return `http://localhost:3000/${asPath}`;
  };

  const fullUrl = getFullUrl();

  if (fullUrl) {
    return (
      <div className="flex flex-col justify-center items-center">
        <span className="mb-2 break-all text-sm text-gray-400" onClick={e => copyToClipboard(fullUrl)}>
          {fullUrl}
        </span>
        {/* <span><CopyIcon className="h-4" /></span> */}
        <QRCode value={fullUrl} size={150} className="mt-8" />
      </div>
    );
  } else {
    return null;
  }
}
