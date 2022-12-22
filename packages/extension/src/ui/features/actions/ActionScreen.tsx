import { Button } from "@argent/ui"
import { FC, useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

import { waitForMessage } from "../../../shared/messages"
import { removePreAuthorization } from "../../../shared/preAuthorizations"
import {
  getVerifiedEmail,
  getVerifiedEmailIsExpired,
} from "../../../shared/shield/jwt"
import { useAppState } from "../../app.state"
import { routes } from "../../routes"
import { analytics } from "../../services/analytics"
import { assertNever } from "../../services/assertNever"
import { connectAccount } from "../../services/backgroundAccounts"
import { approveAction, rejectAction } from "../../services/backgroundActions"
import { Account } from "../accounts/Account"
import {
  useSelectedAccount,
  useSelectedAccountStore,
} from "../accounts/accounts.state"
import { EXTENSION_IS_POPUP } from "../browser/constants"
import { focusExtensionTab, useExtensionIsInTab } from "../browser/tabs"
import { useActions } from "./actions.state"
import { AddNetworkScreen } from "./AddNetworkScreen"
import { AddTokenScreen } from "./AddTokenScreen"
import { ApproveDeclareContractScreen } from "./ApproveDeclareContractScreen"
import { ApproveDeployAccountScreen } from "./ApproveDeployAccount"
import { ApproveDeployContractScreen } from "./ApproveDeployContractScreen"
import { ApproveSignatureScreen } from "./ApproveSignatureScreen"
import { ApproveTransactionScreen } from "./ApproveTransactionScreen"
import { ConnectDappScreen } from "./connectDapp/ConnectDappScreen"

export const MaybeShieldActionScreen: FC = () => {
  const account = useSelectedAccount()
  const [state, setState] = useState("/")
  const [isLoading, setIsLoading] = useState(true)
  useEffect(() => {
    const init = async () => {
      if (account?.guardian) {
        const verifiedEmail = await getVerifiedEmail()
        console.log({ verifiedEmail })
        if (!verifiedEmail) {
          // need to ask for and verify email
          setState("/shield/email")
        } else {
          const verifiedEmailIsExpired = await getVerifiedEmailIsExpired()
          console.log({ verifiedEmailIsExpired })
          if (verifiedEmailIsExpired) {
            // need to re-verify existing email
            setState("/shield/otp")
          }
        }
      }
      setIsLoading(false)
    }
    init()
  }, [account?.guardian])
  if (state === "/shield/email") {
    return (
      <>
        <h1>Placeholder</h1>
        <ul>
          <li>TODO - before user can co-sign</li>
          <li>User needs to enter email</li>
          <li>User needs to verify email via OTP</li>
          <li>App needs to ensure account is added to backend</li>
        </ul>
        <Button onClick={() => setState("/")}>Dismiss</Button>
      </>
    )
  } else if (state === "/shield/otp") {
    return (
      <>
        <h1>Placeholder</h1>
        <ul>
          <li>TODO - before user can co-sign</li>
          <li>User needs to re-verify email via OTP</li>
          <li>App needs to ensure account is added to backend</li>
        </ul>
        <Button onClick={() => setState("/")}>Dismiss</Button>
      </>
    )
  }
  if (isLoading) {
    return <h1>Loading...</h1>
  }
  return <ActionScreen />
}

export const ActionScreen: FC = () => {
  const navigate = useNavigate()
  const account = useSelectedAccount()
  const extensionIsInTab = useExtensionIsInTab()
  const actions = useActions()

  const [action] = actions
  const isLastAction = actions.length === 1

  const closePopup = useCallback(() => {
    if (EXTENSION_IS_POPUP) {
      window.close()
    }
  }, [])
  const closePopupIfLastAction = useCallback(() => {
    if (isLastAction) {
      closePopup()
    }
  }, [closePopup, isLastAction])

  const onSubmit = useCallback(async () => {
    await approveAction(action)
    closePopupIfLastAction()
  }, [action, closePopupIfLastAction])

  const onReject = useCallback(async () => {
    await rejectAction(action.meta.hash)
    closePopupIfLastAction()
  }, [action, closePopupIfLastAction])

  const rejectAllActions = useCallback(async () => {
    await rejectAction(actions.map((act) => act.meta.hash))
    closePopup()
  }, [actions, closePopup])

  /** Focus the extension if it is running in a tab  */
  useEffect(() => {
    const init = async () => {
      if (extensionIsInTab) {
        await focusExtensionTab()
      }
    }
    init()
  }, [extensionIsInTab, action?.type])
  switch (action?.type) {
    case "CONNECT_DAPP":
      return (
        <ConnectDappScreen
          host={action.payload.host}
          onConnect={async (selectedAccount: Account) => {
            useAppState.setState({ isLoading: true })
            // switch UI to the account that was selected
            useSelectedAccountStore.setState({
              selectedAccount,
            })
            // switch background wallet to the account that was selected
            connectAccount(selectedAccount)
            await waitForMessage("CONNECT_ACCOUNT_RES")
            // continue with approval with selected account
            await approveAction(action)
            await waitForMessage("CONNECT_DAPP_RES")
            useAppState.setState({ isLoading: false })
            closePopupIfLastAction()
          }}
          onDisconnect={async (selectedAccount: Account) => {
            await removePreAuthorization(action.payload.host, selectedAccount)
            await rejectAction(action.meta.hash)
            closePopupIfLastAction()
          }}
          onReject={onReject}
        />
      )

    case "REQUEST_TOKEN":
      return (
        <AddTokenScreen
          defaultToken={action.payload}
          hideBackButton
          onSubmit={onSubmit}
          onReject={onReject}
        />
      )

    case "REQUEST_ADD_CUSTOM_NETWORK":
      return (
        <AddNetworkScreen
          requestedNetwork={action.payload}
          hideBackButton
          onSubmit={onSubmit}
          onReject={onReject}
        />
      )

    case "REQUEST_SWITCH_CUSTOM_NETWORK":
      return (
        <AddNetworkScreen
          requestedNetwork={action.payload}
          mode="switch"
          hideBackButton
          onSubmit={onSubmit}
          onReject={onReject}
        />
      )

    case "TRANSACTION":
      return (
        <ApproveTransactionScreen
          transactions={action.payload.transactions}
          actionHash={action.meta.hash}
          onSubmit={async () => {
            analytics.track("signedTransaction", {
              networkId: account?.networkId || "unknown",
            })
            await approveAction(action)
            useAppState.setState({ isLoading: true })
            const result = await Promise.race([
              waitForMessage(
                "TRANSACTION_SUBMITTED",
                ({ data }) => data.actionHash === action.meta.hash,
              ),
              waitForMessage(
                "TRANSACTION_FAILED",
                ({ data }) => data.actionHash === action.meta.hash,
              ),
            ])
            // (await) blocking as the window may closes afterwards
            await analytics.track("sentTransaction", {
              success: !("error" in result),
              networkId: account?.networkId || "unknown",
            })
            if ("error" in result) {
              useAppState.setState({
                error: `Sending transaction failed: ${result.error}`,
                isLoading: false,
              })
              navigate(routes.error())
            } else {
              closePopupIfLastAction()
              useAppState.setState({ isLoading: false })
            }
          }}
          onReject={onReject}
          selectedAccount={account}
        />
      )

    case "DEPLOY_ACCOUNT_ACTION":
      return (
        <ApproveDeployAccountScreen
          actionHash={action.meta.hash}
          onSubmit={async () => {
            analytics.track("signedTransaction", {
              networkId: account?.networkId || "unknown",
            })
            await approveAction(action)
            useAppState.setState({ isLoading: true })
            const result = await Promise.race([
              waitForMessage(
                "DEPLOY_ACCOUNT_ACTION_SUBMITTED",
                ({ data }) => data.actionHash === action.meta.hash,
              ),
              waitForMessage(
                "DEPLOY_ACCOUNT_ACTION_FAILED",
                ({ data }) => data.actionHash === action.meta.hash,
              ),
            ])
            // (await) blocking as the window may closes afterwards
            await analytics.track("sentTransaction", {
              success: !("error" in result),
              networkId: account?.networkId || "unknown",
            })
            if ("error" in result) {
              useAppState.setState({
                error: `Sending transaction failed: ${result.error}`,
                isLoading: false,
              })
              navigate(routes.error())
            } else {
              if ("txHash" in result) {
                account?.updateDeployTx(result.txHash)
              }
              closePopupIfLastAction()
              useAppState.setState({ isLoading: false })
            }
          }}
          onReject={rejectAllActions}
          selectedAccount={account}
        />
      )

    case "SIGN":
      return (
        <ApproveSignatureScreen
          dataToSign={action.payload}
          onSubmit={async () => {
            await approveAction(action)
            useAppState.setState({ isLoading: true })
            await waitForMessage(
              "SIGNATURE_SUCCESS",
              ({ data }) => data.actionHash === action.meta.hash,
            )
            await analytics.track("signedMessage", {
              networkId: account?.networkId || "unknown",
            })
            closePopupIfLastAction()
            useAppState.setState({ isLoading: false })
          }}
          onReject={onReject}
          selectedAccount={account}
        />
      )
    case "DECLARE_CONTRACT_ACTION":
      return (
        <ApproveDeclareContractScreen
          actionHash={action.meta.hash}
          payload={action.payload}
          onSubmit={async () => {
            analytics.track("signedDeclareTransaction", {
              networkId: account?.networkId || "unknown",
            })
            await approveAction(action)
            useAppState.setState({ isLoading: true })
            const result = await Promise.race([
              waitForMessage(
                "DECLARE_CONTRACT_ACTION_SUBMITTED",
                ({ data }) => data.actionHash === action.meta.hash,
              ),
              waitForMessage(
                "DECLARE_CONTRACT_ACTION_FAILED",
                ({ data }) => data.actionHash === action.meta.hash,
              ),
            ])
            // (await) blocking as the window may closes afterwards
            await analytics.track("sentTransaction", {
              success: !("error" in result),
              networkId: account?.networkId || "unknown",
            })
            if ("error" in result) {
              useAppState.setState({
                error: `Sending transaction failed: ${result.error}`,
                isLoading: false,
              })
              navigate(routes.error())
            } else {
              closePopupIfLastAction()
              useAppState.setState({ isLoading: false })
              navigate(
                routes.settingsSmartContractDeclareOrDeploySuccess(
                  "declare",
                  action.payload.classHash,
                ),
              )
            }
          }}
          onReject={rejectAllActions}
          selectedAccount={account}
        />
      )
    case "DEPLOY_CONTRACT_ACTION":
      return (
        <>
          <ApproveDeployContractScreen
            actionHash={action.meta.hash}
            deployPayload={action.payload}
            onSubmit={async () => {
              analytics.track("signedDeployTransaction", {
                networkId: account?.networkId || "unknown",
              })
              await approveAction(action)
              useAppState.setState({ isLoading: true })
              const result = await Promise.race([
                waitForMessage(
                  "DEPLOY_CONTRACT_ACTION_SUBMITTED",
                  ({ data }) => data.actionHash === action.meta.hash,
                ),
                waitForMessage(
                  "DEPLOY_CONTRACT_ACTION_FAILED",
                  ({ data }) => data.actionHash === action.meta.hash,
                ),
              ])
              // (await) blocking as the window may closes afterwards
              await analytics.track("sentTransaction", {
                success: !("error" in result),
                networkId: account?.networkId || "unknown",
              })
              if ("error" in result) {
                useAppState.setState({
                  error: `Sending transaction failed: ${result.error}`,
                  isLoading: false,
                })
                navigate(routes.error())
              } else {
                closePopupIfLastAction()
                useAppState.setState({ isLoading: false })
                navigate(
                  routes.settingsSmartContractDeclareOrDeploySuccess(
                    "deploy",
                    result.deployedContractAddress,
                  ),
                )
              }
            }}
            onReject={rejectAllActions}
            selectedAccount={account}
          />
        </>
      )

    default:
      assertNever(action)
      return <></>
  }
}
