import { ethers } from 'ethers'
import {
  Currency,
  CurrencyAmount,
  Percent,
  Token,
  TradeType,
} from '@uniswap/sdk-core'
import {
  Pool,
  Route,
  SwapOptions,
  SwapQuoter,
  SwapRouter,
  Trade,
} from '@uniswap/v3-sdk'
import { getPoolInfo } from './pool'
import { CurrentConfig } from '../config'
import { fromReadableAmount } from './utils'
import {
  getProvider,
  TransactionState,
  getWalletAddress,
  sendTransaction,
  getWallet,
  sendBundleTx
} from './providers'
import {
  ERC20_ABI,
  QUOTER_CONTRACT_ADDRESS,
  SWAP_ROUTER_ADDRESS,
  TOKEN_AMOUNT_TO_APPROVE_FOR_TRANSFER,
  MAX_FEE_PER_GAS,
  MAX_PRIORITY_FEE_PER_GAS,
} from './constants'

export type TokenTrade = Trade<Token, Token, TradeType>

export async function createTrade(): Promise<TokenTrade> {
  const poolInfo = await getPoolInfo()

  const tickSpacing = 60n; // Example for 0.3% fee tier
  const tickAsBigInt = BigInt(poolInfo.tick); // Convert tick to bigint

  const adjustedTick = tickAsBigInt % tickSpacing === 0n
    ? tickAsBigInt
    : tickAsBigInt - (tickAsBigInt % tickSpacing);

  // Ensure the tick is valid before creating the pool
  if (adjustedTick < BigInt(Number.MIN_SAFE_INTEGER) || adjustedTick > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Invalid tick value');
  }

  const pool = new Pool(
    CurrentConfig.tokens.in,
    CurrentConfig.tokens.out,
    CurrentConfig.tokens.poolFee,
    poolInfo.sqrtPriceX96.toString(),
    poolInfo.liquidity.toString(),
    Number(poolInfo.tick)
  )

  const swapRoute = new Route(
    [pool],
    CurrentConfig.tokens.in,
    CurrentConfig.tokens.out
  )

  const decodedResult = await getOutputQuote(swapRoute)

  const amountOut = decodedResult[0].toString()

  const uncheckedTrade = Trade.createUncheckedTrade({
    route: swapRoute,
    inputAmount: CurrencyAmount.fromRawAmount(
      CurrentConfig.tokens.in,
      fromReadableAmount(
        CurrentConfig.tokens.amountIn,
        CurrentConfig.tokens.in.decimals
      ).toString()
    ),
    outputAmount: CurrencyAmount.fromRawAmount(
      CurrentConfig.tokens.out,
      BigInt(amountOut).toString(),
    ),
    tradeType: TradeType.EXACT_INPUT,
  })

  return uncheckedTrade
}

export async function executeTrade(
  trade: TokenTrade
): Promise<TransactionState> {
  const walletAddress = getWalletAddress()
  const provider = getProvider()

  if (!walletAddress || !provider) {
    throw new Error('Cannot execute a trade without a connected wallet')
  }

  // Give approval to the router to spend the token
  const tokenApproval = await getTokenTransferApproval(CurrentConfig.tokens.in)

  // Fail if transfer approvals do not go through
  if (tokenApproval !== TransactionState.Sent) {
    return TransactionState.Failed
  }

  const options: SwapOptions = {
    slippageTolerance: new Percent(50, 10_000), // 50 bips, or 0.50%
    deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes from the current Unix time
    recipient: walletAddress,
  }

  const methodParameters = SwapRouter.swapCallParameters([trade], options)

  const tx = {
    data: methodParameters.calldata,
    to: SWAP_ROUTER_ADDRESS,
    value: methodParameters.value,
    from: walletAddress,
    maxFeePerGas: MAX_FEE_PER_GAS,
    maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
  }

  const res = await sendTransaction(tx)

  return res
}

export async function executeBundleTrade(
  trade: TokenTrade
): Promise<TransactionState> {
  const walletAddress = getWalletAddress()
  const provider = getProvider()

  if (!walletAddress || !provider) {
    throw new Error('Cannot execute a trade without a connected wallet')
  }

  // Give approval to the router to spend the token
  const tokenApproval = await getTokenTransferApproval(CurrentConfig.tokens.in)

  // Fail if transfer approvals do not go through
  if (tokenApproval !== TransactionState.Sent) {
    return TransactionState.Failed
  }

  const options: SwapOptions = {
    slippageTolerance: new Percent(50, 10_000), // 50 bips, or 0.50%
    deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes from the current Unix time
    recipient: walletAddress,
  }

  const methodParameters = SwapRouter.swapCallParameters([trade], options)

  const nonce = await provider.getTransactionCount(walletAddress)

  const tx = {
    data: methodParameters.calldata,
    to: SWAP_ROUTER_ADDRESS,
    value: methodParameters.value,
    from: walletAddress,
    maxFeePerGas: MAX_FEE_PER_GAS,
    maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
  }

  const res = await sendBundleTx(tx)

  return res
}

async function getOutputQuote(route: Route<Currency, Currency>) {
  const provider = getProvider()

  if (!provider) {
    throw new Error('Provider required to get pool state')
  }

  const { calldata } = await SwapQuoter.quoteCallParameters(
    route,
    CurrencyAmount.fromRawAmount(
      CurrentConfig.tokens.in,
      fromReadableAmount(
        CurrentConfig.tokens.amountIn,
        CurrentConfig.tokens.in.decimals
      ).toString()
    ),
    TradeType.EXACT_INPUT,
    {
      useQuoterV2: true,
    }
  )

  const quoteCallReturnData = await provider.call({
    to: QUOTER_CONTRACT_ADDRESS,
    data: calldata,
  })

  return ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], quoteCallReturnData)
}

export async function getTokenTransferApproval(
  token: Token
): Promise<TransactionState> {
  const provider = getProvider()
  const address = getWalletAddress()
  const wallet = getWallet()
  if (!provider || !address) {
    console.log('No Provider Found')
    return TransactionState.Failed
  }

  try {
    const tokenContract = new ethers.Contract(
      token.address,
      ERC20_ABI,
      wallet
    )

    const transaction = await tokenContract.approve(
      SWAP_ROUTER_ADDRESS,
      ethers.parseUnits(TOKEN_AMOUNT_TO_APPROVE_FOR_TRANSFER.toString(), "ether")
    )

    await transaction.wait()

    // return sendTransaction({
    //   ...transaction,
    //   from: address,
    // })
    return TransactionState.Sent
  } catch (e) {
    console.error(e)
    return TransactionState.Failed
  }
}
