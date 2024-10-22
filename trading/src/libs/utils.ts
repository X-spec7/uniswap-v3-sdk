import { ethers } from "ethers"
import { BigintIsh, Token, TradeType } from "@uniswap/sdk-core"
import { Trade } from "@uniswap/v3-sdk"

const MAX_DECIMALS = 8

export function displayTrade(trade: Trade<Token, Token, TradeType>): string {
  return `${trade.inputAmount.toExact()} ${trade.inputAmount.currency.symbol
    } for ${trade.outputAmount.toExact()} ${trade.outputAmount.currency.symbol}`
}

export function toReadableAmount(rawAmount: number, decimals: number): string {
  return ethers.formatUnits(rawAmount, decimals).slice(0, MAX_DECIMALS)
}

export function fromReadableAmount(
  amount: number,
  decimals: number
): BigInt {
  return ethers.parseUnits(amount.toString(), decimals)
}

