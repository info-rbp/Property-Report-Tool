import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
  getMultiFactorResolver,
  TotpMultiFactorGenerator,
  PhoneMultiFactorGenerator,
  PhoneAuthProvider,
  RecaptchaVerifier,
  MultiFactorResolver,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

export const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
];

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));
provider.setCustomParameters({
  prompt: 'select_account',
});

let isSigningIn = false;
let cachedAccessToken: string | null = null;
let pendingMfaResolver: MultiFactorResolver | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // When restored without in-memory token, keep state clean
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export interface SignInResult {
  user: User;
  accessToken: string;
}

export interface MfaRequiredResult {
  mfaRequired: true;
  resolver: MultiFactorResolver;
  hints: any[];
}

export const getPendingMfaResolver = () => pendingMfaResolver;

export const googleSignIn = async (): Promise<SignInResult | MfaRequiredResult | null> => {
  try {
    isSigningIn = true;
    pendingMfaResolver = null;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve access token from Google Sign In');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    if (error.code === 'auth/multi-factor-auth-required') {
      console.warn('MFA is required for this Google account. Initializing MFA resolver...');
      try {
        const resolver = getMultiFactorResolver(auth, error);
        pendingMfaResolver = resolver;
        return {
          mfaRequired: true,
          resolver,
          hints: resolver.hints || [],
        };
      } catch (resolverErr) {
        console.error('Error resolving multi-factor:', resolverErr);
        throw new Error(
          'Your Google account has Multi-Factor Authentication enabled. Please complete verification or use a direct Google token / local upload.'
        );
      }
    }

    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Resolve MFA using TOTP authenticator code (Google Authenticator, Microsoft Auth, etc.)
 */
export const resolveTotpMfa = async (verificationCode: string): Promise<SignInResult> => {
  if (!pendingMfaResolver) {
    throw new Error('No pending multi-factor sign in session found.');
  }

  const assertion = TotpMultiFactorGenerator.assertionForSignIn(
    pendingMfaResolver.hints[0].uid,
    verificationCode
  );

  const userCredential = await pendingMfaResolver.resolveSignIn(assertion);
  // Retrieve token after MFA resolution
  const credential = GoogleAuthProvider.credentialFromResult(userCredential);
  const token = credential?.accessToken || (await userCredential.user.getIdToken());
  cachedAccessToken = token;
  pendingMfaResolver = null;
  return { user: userCredential.user, accessToken: token };
};

/**
 * Resolve MFA using SMS phone verification code
 */
export const sendPhoneMfaVerification = async (
  verifier: RecaptchaVerifier
): Promise<string> => {
  if (!pendingMfaResolver) {
    throw new Error('No pending multi-factor sign in session found.');
  }
  const phoneInfoOptions = {
    multiFactorHint: pendingMfaResolver.hints[0],
    session: pendingMfaResolver.session,
  };
  const phoneAuthProvider = new PhoneAuthProvider(auth);
  return await phoneAuthProvider.verifyPhoneNumber(phoneInfoOptions, verifier);
};

export const resolvePhoneMfa = async (
  verificationId: string,
  verificationCode: string
): Promise<SignInResult> => {
  const cred = PhoneAuthProvider.credential(verificationId, verificationCode);
  const assertion = PhoneMultiFactorGenerator.assertion(cred);
  if (!pendingMfaResolver) {
    throw new Error('No pending multi-factor sign in session found.');
  }
  const userCredential = await pendingMfaResolver.resolveSignIn(assertion);
  const credential = GoogleAuthProvider.credentialFromResult(userCredential);
  const token = credential?.accessToken || (await userCredential.user.getIdToken());
  cachedAccessToken = token;
  pendingMfaResolver = null;
  return { user: userCredential.user, accessToken: token };
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const setAccessTokenDirectly = (token: string | null) => {
  cachedAccessToken = token;
};

export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  pendingMfaResolver = null;
};
