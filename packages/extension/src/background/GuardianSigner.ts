import {
  Abi,
  Call,
  DeployAccountSignerDetails,
  InvocationsSignerDetails,
  KeyPair,
  Signature,
  Signer,
  number,
  transaction,
} from "starknet"

import { cosignerSign } from "../shared/shield/backend/account"
import { getVerifiedEmailIsExpired } from "../shared/shield/jwt"

export interface CosignerMessage {
  message: any
  type: "starknet" | "starknetDeploy"
}

export class GuardianSigner extends Signer {
  constructor(keyPair: KeyPair) {
    super(keyPair)
  }

  public async cosignMessage(
    cosignerMessage: CosignerMessage,
  ): Promise<Signature> {
    const verifiedEmailIsExpired = await getVerifiedEmailIsExpired()

    if (verifiedEmailIsExpired) {
      throw new Error("Email verification expired")
    }

    const response = await cosignerSign(cosignerMessage)

    const signature = [
      number.toBN(response.signature.r).toString(),
      number.toBN(response.signature.s).toString(),
    ]

    return signature
  }

  // public async signMessage(
  //   typedData: typedData.TypedData,
  //   accountAddress: string,
  // ): Promise<Signature> {
  //   console.warn("TODO: implement GuardianSigner signMessage")
  //   return super.signMessage(typedData, accountAddress)
  // }

  public async signTransaction(
    transactions: Call[],
    transactionsDetail: InvocationsSignerDetails,
    abis?: Abi[],
  ): Promise<Signature> {
    const signatures = await super.signTransaction(
      transactions,
      transactionsDetail,
      abis,
    )

    const calldata = transaction.fromCallsToExecuteCalldata(transactions)

    const cosignerMessage = {
      contractAddress: transactionsDetail.walletAddress,
      version: transactionsDetail.version.toString(10),
      calldata: calldata.map((data) => number.toHex(number.toBN(data))),
      maxFee: number.toBN(transactionsDetail.maxFee).toString(10),
      chainId: number.toBN(transactionsDetail.chainId).toString(10),
      nonce: transactionsDetail.nonce.toString(10),
    }

    const cosignerSignature = await this.cosignMessage({
      message: cosignerMessage,
      type: "starknet",
    })

    return [...signatures, ...cosignerSignature]
  }

  public async signDeployAccountTransaction({
    classHash,
    contractAddress,
    constructorCalldata,
    addressSalt,
    maxFee,
    version,
    chainId,
    nonce,
  }: DeployAccountSignerDetails) {
    console.warn("TODO: implement GuardianSigner signDeployAccountTransaction")
    return super.signDeployAccountTransaction({
      classHash,
      contractAddress,
      constructorCalldata,
      addressSalt,
      maxFee,
      version,
      chainId,
      nonce,
    })
  }

  // public async signDeclareTransaction({
  //   classHash,
  //   senderAddress,
  //   chainId,
  //   maxFee,
  //   version,
  //   nonce,
  // }: DeclareSignerDetails) {
  //   console.warn("TODO: implement GuardianSigner signDeclareTransaction")
  //   return super.signDeclareTransaction({
  //     classHash,
  //     senderAddress,
  //     chainId,
  //     maxFee,
  //     version,
  //     nonce,
  //   })
  // }
}
