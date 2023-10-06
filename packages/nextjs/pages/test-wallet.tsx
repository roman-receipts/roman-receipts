import type { NextPage } from "next";
import { useEffect } from "react";
import launchWallet from "~~/utils/railgun";
import createTestWallet from "~~/utils/railgun/wallet";

const Home: NextPage = () => {

  useEffect(() => {
    launchWallet();
    createTestWallet();
  });

  console.log("test wallet");
  return <p>test wallet</p>;
};

export default Home;
