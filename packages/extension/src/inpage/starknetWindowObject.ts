import { assertNever } from "./../ui/services/assertNever"
import { getProvider } from "../shared/network/provider"
import { ArgentXAccount } from "./ArgentXAccount"
import { ArgentXAccount3, getProvider3 } from "./ArgentXAccount3"
import type {
  AccountChangeEventHandler,
  NetworkChangeEventHandler,
  StarknetWindowObject,
  WalletEvents,
} from "./inpage.model"
import { sendMessage, waitForMessage } from "./messageActions"
import { getIsPreauthorized } from "./preAuthorization"
import {
  handleAddNetworkRequest,
  handleAddTokenRequest,
  handleSwitchNetworkRequest,
} from "./requestMessageHandlers"

const VERSION = '1.0.6';// `${process.env.VERSION}`

export const userEventHandlers: WalletEvents[] = []

// window.ethereum like
export const starknetWindowObject: StarknetWindowObject = {
  id: "civia", // if ever changed you need to change it in get-starknet aswell
  name: "Civia",
  icon: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADkAAAAzCAYAAAAtg6DjAAAAAXNSR0IArs4c6QAAAARzQklUCAgICHwIZIgAAAO/SURBVGiB7VpBdqMwDP2QOU9LTzBkz50Id8o+9AQNvU/DLCAgjGRLtkk383d5AUufLwtZooARzVdVo0SNAn8BACNq9sICPUZ8Pn9e3+8Xq61cKKw3zCRvCTY74LWky1cZImgBtM1Qjc1QXV5h0KwkADRDNWb241B145Qs0Od1Y1H3knldAL8Trj4cEsZxJH+m8DoQWVX9k3Bvh8cattePe89dtLxyVrTK9dtmqLLs06jEkwqikoZwl0r0V0hSzIRDZJOIZiG5q4IonlXPA703pE9oxeppuv8s3R9CNEljyFGLPX7QcQ6HVL2+36P8tZd1uvDSWO4x4tMNQ+/6Bfrr2/1sN6VENnJ7D3bKem1FhK2KZPNd3bz7ZV1tOnk8hIrouW/5tTbJRSQaoaaXpCohRNadwtpbotLDNaopkgweqYQ9tdw7I+QMo9hCVPTBqCZLUnFm3L23hGyrer/t7BGlWDWNJPna9eRNMBLBFivBjrtOwkxorYepfa5O1uQHgp2SgSwqJwdP+Grh2F7DllPTsC83Ss57yU4Q6K5v93NqjTnfPylHqydOzVKv5jZcpTAt0HsJHnGiD4UkV0IKWEg2X1UtLkyepKN2doLMwwxm6BBWJX0qUiOndQ8e2HHbh2dCy6UEDCoO1WW57sjugFQxRWJSUqsiyaSpIWQGaVRb4e/x7PdiskETaHJxE43Bh9IbqhRU7czh5CJ3lHiV3BgzVhkpWKLGt+8ND7r07ced0RmH70fOJ+chW3yw913zd89FO0uR7vZgHR+aobq4QlDYSb4qbH2Jhfy3VF8lbs13dePIRnXQ6ULSwimgdTBXTztFyPrfiBolbs1QjdSvMkoZtzj2H83SsC/E19fadyWfeUfUT7/SBz4/6DCizq0moOgahASas7NMkizAZLJ2919mNblz7SZMQ/ZI4irV2ZLJaOTnpGamSRR7cH/gvPlfqSIQCNeN0/ts1z5DlBx2W+8+CaD5qur5/pVggX7T89HOTkj0ldoakD1WkaSwEJ0UNQ1SF3Iltm2OuWFlIsgcAQvL/EG41t8Udj51ATCVZL5Gs7WrLvi7LBdqP7o3sR9FMC3CqLGCMAxSryU0t4p5Ed/XHOr2PesgnTRLo7252I4mx/i5dU2xGKOm7/rkvo85CgLtSRVJcA3l0BDIM4fkED3vVPRfaVJRh6zjWNip5zuWy+TylCsEdcSYMieHw+aWfpi2hC9zqhdSjvhyIGq/cwkl+tuZA1X9/a8/XGRRNsMAaV3qYKg+AqaJyfMpzH948A8YsYPgb3zXIQAAAABJRU5ErkJggg==",
  account: undefined,
  provider: undefined,
  selectedAddress: undefined,
  chainId: undefined,
  isConnected: false,
  version: VERSION,
  request: async (call) => {
    if (call.type === "wallet_watchAsset" && call.params.type === "ERC20") {
      return await handleAddTokenRequest(call.params)
    } else if (call.type === "wallet_addStarknetChain") {
      return await handleAddNetworkRequest(call.params)
    } else if (call.type === "wallet_switchStarknetChain") {
      return await handleSwitchNetworkRequest(call.params)
    }
    throw Error("Not implemented")
  },
  enable: async ({ starknetVersion = "v3" } = {}) => {
    const walletAccountP = Promise.race([
      waitForMessage("CONNECT_DAPP_RES", 10 * 60 * 1000),
      waitForMessage("REJECT_PREAUTHORIZATION", 10 * 60 * 1000).then(
        () => "USER_ABORTED" as const,
      ),
    ])
    sendMessage({
      type: "CONNECT_DAPP",
      data: { host: window.location.host },
    })
    const walletAccount = await walletAccountP

    if (!walletAccount) {
      throw Error("No wallet account (should not be possible)")
    }
    if (walletAccount === "USER_ABORTED") {
      throw Error("User aborted")
    }
    const { starknet } = window
    if (!starknet) {
      throw Error("No starknet object detected")
    }

    const { address, network } = walletAccount

    if (starknetVersion === "v4") {
      const provider = getProvider(network)
      starknet.starknetJsVersion = "v4"
      starknet.provider = provider
      starknet.account = new ArgentXAccount(address, provider)
    } else {
      const provider = getProvider3(network)
      starknet.starknetJsVersion = "v3"
      starknet.provider = provider
      starknet.account = new ArgentXAccount3(address, provider)
    }

    starknet.selectedAddress = address
    starknet.chainId = network.chainId
    starknet.isConnected = true

    return [address]
  },
  isPreauthorized: async () => {
    return getIsPreauthorized()
  },
  on: (event, handleEvent) => {
    if (event === "accountsChanged") {
      userEventHandlers.push({
        type: event,
        handler: handleEvent as AccountChangeEventHandler,
      })
    } else if (event === "networkChanged") {
      userEventHandlers.push({
        type: event,
        handler: handleEvent as NetworkChangeEventHandler,
      })
    } else {
      assertNever(event)
      throw new Error(`Unknwown event: ${event}`)
    }
  },
  off: (event, handleEvent) => {
    if (event !== "accountsChanged" && event !== "networkChanged") {
      assertNever(event)
      throw new Error(`Unknwown event: ${event}`)
    }

    const eventIndex = userEventHandlers.findIndex(
      (userEvent) =>
        userEvent.type === event && userEvent.handler === handleEvent,
    )

    if (eventIndex >= 0) {
      userEventHandlers.splice(eventIndex, 1)
    }
  },
}
