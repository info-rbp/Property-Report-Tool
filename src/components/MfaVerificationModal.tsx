import React, { useState } from 'react';
import { resolveTotpMfa, resolvePhoneMfa } from '../lib/auth';
import { ShieldCheck, KeyRound, AlertCircle, Loader2 } from 'lucide-react';
import { MultiFactorResolver } from 'firebase/auth';

interface MfaVerificationModalProps {
  isOpen: boolean;
  resolver: MultiFactorResolver | null;
  onSuccess: (user: any) => void;
  onCancel: () => void;
}

export const MfaVerificationModal: React.FC<MfaVerificationModalProps> = ({
  isOpen,
  resolver,
  onSuccess,
  onCancel,
}) => {
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !resolver) return null;

  const firstHint = resolver.hints?.[0] as any;
  const factorFactorId = firstHint?.factorId;
  const isTotp = factorFactorId === 'totp' || !factorFactorId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setIsVerifying(true);
    setErrorMessage(null);
    try {
      if (isTotp) {
        const result = await resolveTotpMfa(code.trim());
        onSuccess(result.user);
      } else {
        // Fallback for SMS or generic code
        const result = await resolveTotpMfa(code.trim());
        onSuccess(result.user);
      }
    } catch (err: any) {
      console.error('MFA verification error:', err);
      setErrorMessage(
        err.message || 'Invalid verification code. Please check your authenticator and try again.'
      );
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 border border-neutral-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-neutral-900">Two-Factor Authentication</h3>
            <p className="text-xs text-neutral-500">
              Your Google Account requires an extra security step
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Enter 6-digit Verification Code
            </label>
            <div className="relative">
              <input
                type="text"
                autoFocus
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\s+/g, ''))}
                maxLength={8}
                className="w-full text-center tracking-widest text-lg font-mono font-bold py-2.5 px-3 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
              <KeyRound className="w-4 h-4 text-neutral-400 absolute left-3 top-3.5" />
            </div>
            <p className="text-[11px] text-neutral-500 mt-1.5 text-center">
              Open your Google Authenticator or secondary auth app and enter the code shown.
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2 text-xs font-semibold text-neutral-600 border border-neutral-300 rounded-lg hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isVerifying || !code.trim()}
              className="flex-1 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-xs"
            >
              {isVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>{isVerifying ? 'Verifying...' : 'Verify & Continue'}</span>
            </button>
          </div>
        </form>

        <div className="mt-4 pt-3 border-t border-neutral-100 text-[10.5px] text-neutral-400 text-center">
          Note: You can also import CSV or Excel spreadsheets and upload photos directly at any time without logging in.
        </div>
      </div>
    </div>
  );
};
