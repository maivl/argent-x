import {
  BarBackButton,
  Button,
  CellStack,
  FieldError,
  Input,
  NavigationContainer,
  useToast,
} from "@argent/ui"
import { Flex } from "@chakra-ui/react"
import { FC, useCallback } from "react"
import { useForm } from "react-hook-form"
import { useNavigate } from "react-router-dom"
import * as yup from "yup"

import { resetDevice } from "../../../shared/shield/jwt"
import { requestEmail } from "../../../shared/shield/register"
import { IS_DEV } from "../../../shared/utils/dev"
import { coerceErrorToString } from "../../../shared/utils/error"
import { routes, useRouteAccountAddress } from "../../routes"
import { useYupValidationResolver } from "../settings/useYupValidationResolver"
import { ShieldHeader } from "./ShieldHeader"
import { useShieldVerifiedEmail } from "./useShieldVerifiedEmail"

const schema = yup.object().required().shape({
  email: yup.string().email().required(),
})

export const ShieldAccountEmailScreen: FC = () => {
  const accountAddress = useRouteAccountAddress()
  const navigate = useNavigate()
  const resolver = useYupValidationResolver(schema)
  const toast = useToast()

  const verifiedEmail = useShieldVerifiedEmail()

  /** resets device locally, which allows a new email address to be used */
  const onResetDevice = useCallback(async () => {
    await resetDevice()
    toast({
      title: "Device reset",
      status: "success",
      duration: 3000,
    })
  }, [toast])

  const { handleSubmit, register, formState } = useForm({
    defaultValues: {
      email: "",
    },
    resolver,
  })
  return (
    <NavigationContainer
      leftButton={
        <BarBackButton
          onClick={() => {
            navigate(routes.accountTokens())
          }}
        />
      }
      title={"Argent Shield"}
    >
      <CellStack
        as={"form"}
        display={"flex"}
        flex={1}
        onSubmit={handleSubmit(async ({ email }) => {
          try {
            console.log("Registering email", email)
            await requestEmail(email)
            return navigate(routes.shieldAccountOTP(accountAddress, email))
          } catch (error) {
            IS_DEV && console.warn(coerceErrorToString(error))
            toast({
              title: "Unable to verify email",
              status: "error",
              duration: 3000,
            })
          }
        })}
      >
        <pre>{JSON.stringify({ verifiedEmail }, null, 2)}</pre>
        <ShieldHeader
          title={"1 - Enter email"}
          subtitle={"Enter email that should be used for 2FA"}
        />
        <Input
          isInvalid={Boolean(formState.errors.email)}
          placeholder="Enter email"
          autoFocus
          disabled={formState.isSubmitting}
          {...register("email")}
        />
        <FieldError>{formState.errors.email?.message}</FieldError>
        <Flex flex={1} />
        <Button onClick={onResetDevice}>Debug: reset device</Button>
        <Button
          colorScheme={"primary"}
          type="submit"
          disabled={!formState.isDirty}
          isLoading={formState.isSubmitting}
          loadingText={"Verifying email"}
        >
          Next
        </Button>
      </CellStack>
    </NavigationContainer>
  )
}
