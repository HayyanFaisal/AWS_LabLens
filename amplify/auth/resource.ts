import { defineAuth } from '@aws-amplify/backend';

/**
 * Amazon Cognito user pool: users sign up and log in with their email.
 * Cognito emails a verification code on sign-up.
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
});
