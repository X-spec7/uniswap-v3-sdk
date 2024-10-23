import React, { useState, useCallback, useEffect } from 'react'
import './App.css'

import {
  TokenTrade,
  createTrade,
  executeBundleTrade,
  executeTrade,
} from './libs/trading'
import {
  TransactionState,
  getProvider,
  getWalletAddress,
} from './libs/providers'
import { getCurrencyBalance, wrapETH } from './libs/wallet'
import { displayTrade } from './libs/utils'
import { CurrentConfig } from './config'

const useOnBlockUpdated = (callback: (blockNumber: number) => void) => {
  useEffect(() => {
    const fetchProvider = async () => {
      const provider = await getProvider(); // Await the promise to get the Provider instance
      const subscription = provider?.on('block', callback); // Now you can use the provider
      
      return () => {
        provider?.off('block', callback); // Use off instead of removeAllListeners for specific listeners
      };
    };

    const cleanup = fetchProvider();

    // Ensure cleanup is called when the component unmounts
    return () => {
      cleanup.then((cleanupFn) => cleanupFn?.());
    };
  }, [callback]); // Ensure the callback is a dependency
};

function App() {
  const [trade, setTrade] = useState<TokenTrade>()
  const [txState, setTxState] = useState<TransactionState>(TransactionState.New)

  const [tokenInBalance, setTokenInBalance] = useState<string>()
  const [tokenOutBalance, setTokenOutBalance] = useState<string>()
  const [blockNumber, setBlockNumber] = useState<number>(0)

  // Listen for new blocks and update the wallet
  useOnBlockUpdated(async (blockNumber: number) => {
    refreshBalances()
    setBlockNumber(blockNumber)
  })

  const refreshBalances = useCallback(async () => {
    const provider = getProvider()
    const address = getWalletAddress()
    if (!address || !provider) {
      return
    }

    setTokenInBalance(
      await getCurrencyBalance(provider, address, CurrentConfig.tokens.in)
    )
    setTokenOutBalance(
      await getCurrencyBalance(provider, address, CurrentConfig.tokens.out)
    )
  }, [])

  const onCreateTrade = useCallback(async () => {
    refreshBalances()
    setTrade(await createTrade())
  }, [refreshBalances])


  const onTrade = useCallback(async (trade: TokenTrade | undefined) => {
    if (trade) {
      setTxState(TransactionState.Sending)
      setTxState(await executeTrade(trade))
    }
  }, [])

  const onWrapEth = useCallback(async () => {
    // setTxState(TransactionState.Sending)
    await wrapETH(10)
  }, [])

  const onBundleTrade = useCallback(async (trade: TokenTrade | undefined) => {
    if (trade) {
      setTxState(TransactionState.Sending)
      setTxState(await executeBundleTrade(trade))
    }
  }, [])

  return (
    <div className="App bg-gray-100 min-h-screen flex flex-col items-center justify-center w-full">
      <header className="App-header text-center space-y-4">
        <h3 className="text-2xl font-semibold">
          Trading {CurrentConfig.tokens.amountIn} {CurrentConfig.tokens.in.symbol} for {CurrentConfig.tokens.out.symbol}
        </h3>
        <h3 className="text-xl">
          {trade && `Constructed Trade: ${displayTrade(trade)}`}
        </h3>

        <button
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          onClick={onCreateTrade}
        >
          <p>Create Trade</p>
        </button>

        <h3 className="text-lg">
          {`Wallet Address: ${getWalletAddress()}`}
        </h3>

        <h3 className="text-lg">
          {`Block Number: ${blockNumber + 1}`}
        </h3>
        <h3 className="text-lg">
          {`Transaction State: ${txState}`}
        </h3>
        <h3 className="text-lg">
          {`${CurrentConfig.tokens.in.symbol} Balance: ${tokenInBalance}`}
        </h3>
        <h3 className="text-lg">
          {`${CurrentConfig.tokens.out.symbol} Balance: ${tokenOutBalance}`}
        </h3>

        <button
          className="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded"
          onClick={() => onWrapEth()}
          disabled={getProvider() === null}
        >
          <p>Wrap ETH</p>
        </button>

        <button
          className={`bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded ${trade === undefined || txState === TransactionState.Sending || getProvider() === null ? 'opacity-50 cursor-not-allowed' : ''}`}
          onClick={() => onTrade(trade)}
          disabled={
            trade === undefined ||
            txState === TransactionState.Sending ||
            getProvider() === null
          }
        >
          <p>Trade</p>
        </button>
        <button
          className={`bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded ${trade === undefined || txState === TransactionState.Sending || getProvider() === null ? 'opacity-50 cursor-not-allowed' : ''}`}
          onClick={() => onBundleTrade(trade)}
          disabled={
            trade === undefined ||
            txState === TransactionState.Sending ||
            getProvider() === null
          }
        >
          <p>Bundled Trade</p>
        </button>
      </header>
    </div>
  )
}

export default App
