import { ethers, Provider } from "ethers"

import { CurrentConfig } from "../config"

import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle"

export enum TransactionState {
  Failed = 'Failed',
  New = 'New',
  Rejected = 'Rejected',
  Sending = 'Sending',
  Sent = 'Sent',
}

const provider = new ethers.JsonRpcProvider(CurrentConfig.rpc.local)
const wallet = new ethers.Wallet(CurrentConfig.wallet.privateKey, provider)

const flashbotsProvider = await FlashbotsBundleProvider.create(
  provider,
  wallet,
  CurrentConfig.rpc.local,
)

export const getProvider = (): Provider | null => {
  return wallet.provider
}

export const getWallet = (): ethers.Wallet => {
  return wallet
}

export const getWalletAddress = (): string | null => {
  return wallet.address
}

export async function sendTransaction(
  transaction: ethers.TransactionRequest
): Promise<TransactionState> {

  if (transaction.value) {
    transaction.value = BigInt(transaction.value)
  }

  const txRes = await wallet.sendTransaction(transaction)

  let receipt = null

  if (!provider) {
    return TransactionState.Failed
  }

  while (receipt === null) {
    try {
      receipt = await provider.getTransactionReceipt(txRes.hash)

      if (receipt === null) {
        continue
      }
    } catch (e) {
      console.log(`Receipt error:`, e)
      break
    }
  }

  // Transaction was successful if status === 1
  if (receipt) {
    return TransactionState.Sent
  } else {
    return TransactionState.Failed
  }
}

export async function sendBundleTx(
  transaction: ethers.TransactionRequest
): Promise<TransactionState> {
  const blockNumber = await provider.getBlockNumber()

  const block = await provider.getBlock(blockNumber)

  if (!block || !block.baseFeePerGas) {
    console.log('cannot get block and base fee per gas')
    return TransactionState.Failed
  }

  let signedTransaction

  try {
    signedTransaction = await flashbotsProvider.signBundle([
      {
        signer: wallet,
        transaction: transaction,
      },
      // {
      //   signer: wallet,
      //   transaction: transaction,
      // },
    ])
  } catch (error) {
    console.log('error creating signed tx: ', error)
    return TransactionState.Failed
  }

  let simulation
  try {
    simulation = await flashbotsProvider.simulate(
      signedTransaction,
      blockNumber + 1
    )
  } catch (error) {
    console.log('error simulating bundle: ', error)
    return TransactionState.Failed
  }

  if ('error' in simulation) {
    console.log('error in simulation')
    return TransactionState.Failed
  } else {
    console.log('simulation succeeded')
  }

  for (let i = 1; i <= 10; i++) {
    const targetBlockNumber = blockNumber + i
    const bundleSubmission = await flashbotsProvider.sendRawBundle(
      signedTransaction,
      targetBlockNumber
    )

    if ('error' in bundleSubmission) {
      console.error(
        `Error submitting bundle: ${bundleSubmission.error.message}`
      )
      return TransactionState.Failed
    } else {
      console.log(`Bundle submitted for block #${targetBlockNumber}`)
    }
  }
  
  console.log('Bundle submitted')
  return TransactionState.Sent
}
