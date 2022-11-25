import {
  BarBackButton,
  CellStack,
  FieldError,
  L2,
  NavigationContainer,
  useToast,
} from "@argent/ui"
import { Center, HStack, PinInputField, chakra } from "@chakra-ui/react"
import { FC, useCallback, useMemo, useRef } from "react"
import { useForm } from "react-hook-form"
import { Navigate, useNavigate } from "react-router-dom"
import * as yup from "yup"

import {
  EmailVerificationStatus,
  getVerificationErrorMessage,
} from "../../../shared/shield/backend/account"
import { updateVerifiedEmail } from "../../../shared/shield/jwt"
import { confirmEmail, requestEmail } from "../../../shared/shield/register"
import { IS_DEV } from "../../../shared/utils/dev"
import { coerceErrorToString } from "../../../shared/utils/error"
import { ControlledPinInput } from "../../components/ControlledPinInput"
import {
  routes,
  useRouteAccountAddress,
  useRouteEmailAddress,
} from "../../routes"
import { useYupValidationResolver } from "../settings/useYupValidationResolver"
import { ShieldHeader } from "./ShieldHeader"
import { useShieldVerifiedEmail } from "./useShieldVerifiedEmail"

/** TODO: replace with common wallet component when merged */
const PinInputWrapper = chakra(HStack, {
  baseStyle: {
    gap: 2,
    display: "flex",
  },
})

const StyledPinInputField = chakra(PinInputField, {
  baseStyle: {
    _placeholder: {
      color: "transparent",
    },
  },
})

const schema = yup
  .object()
  .required()
  .shape({
    otp: yup
      .string()
      .matches(/^[0-9]{6}$/, "Must be 6 digits")
      .required(),
  })

export const ShieldAccountOTPScreen: FC = () => {
  const accountAddress = useRouteAccountAddress()
  const verifiedEmail = useShieldVerifiedEmail()
  const email = useRouteEmailAddress()
  const navigate = useNavigate()
  const resolver = useYupValidationResolver(schema)
  const formRef = useRef<HTMLFormElement>(null)
  const toast = useToast()

  const onResendEmail = useCallback(async () => {
    if (!email) {
      return
    }
    try {
      await requestEmail(email)
      toast({
        title: "Verification email sent",
        status: "success",
        duration: 3000,
      })
    } catch (error) {
      IS_DEV && console.warn(coerceErrorToString(error))
      toast({
        title: "Unable to verify email",
        status: "error",
        duration: 3000,
      })
    }
  }, [email, toast])

  const obfuscatedEmail = useMemo(() => {
    if (!email) {
      return ""
    }
    const elements = email.split("@")
    const firstLetter = elements[0].substring(0, 1)
    elements[0] = `${firstLetter}*****`
    return elements.join("@")
  }, [email])

  const { handleSubmit, formState, setError, control } = useForm({
    defaultValues: {
      otp: "",
    },
    resolver,
  })

  if (!email) {
    return <Navigate to={routes.shieldAccountEmail(accountAddress)} />
  }
  return (
    <NavigationContainer
      leftButton={
        <BarBackButton
          onClick={() => navigate(routes.shieldAccountEmail(accountAddress))}
        />
      }
      title={"Argent Shield"}
    >
      <CellStack>
        <ShieldHeader
          title={"2 - Enter code"}
          subtitle={`Enter the code we sent to your email: ${obfuscatedEmail}`}
        />
        {verifiedEmail === null ? (
          <></>
        ) : (
          <>
            <Center>
              <PinInputWrapper
                as={"form"}
                ref={formRef}
                onSubmit={handleSubmit(async ({ otp }) => {
                  try {
                    await confirmEmail(otp)

                    /** successfully verifified with backend - persist this email in the local db */
                    await updateVerifiedEmail(email)

                    navigate(routes.shieldAccountAction(accountAddress))
                  } catch (e) {
                    console.error("error", coerceErrorToString(e))
                    if (e instanceof Error) {
                      return setError("otp", {
                        type: "manual",
                        message: getVerificationErrorMessage(
                          e.cause as EmailVerificationStatus,
                        ),
                      })
                    }
                  }
                })}
              >
                <ControlledPinInput
                  control={control}
                  name="otp"
                  autoFocus
                  type="number"
                  otp
                  isDisabled={formState.isSubmitting}
                  onComplete={() => {
                    formRef.current?.requestSubmit()
                  }}
                >
                  <StyledPinInputField />
                  <StyledPinInputField />
                  <StyledPinInputField />
                  <StyledPinInputField />
                  <StyledPinInputField />
                  <StyledPinInputField />
                </ControlledPinInput>
              </PinInputWrapper>
            </Center>
            <FieldError>{formState.errors.otp?.message}</FieldError>
            <L2 as="a" href="#" color={"accent.500"} onClick={onResendEmail}>
              Not received an email?
            </L2>
          </>
        )}
      </CellStack>
    </NavigationContainer>
  )
}
