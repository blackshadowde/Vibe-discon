import React, { useState } from 'react';
import { Eye, EyeOff, Radio, Lock, User, ArrowRight } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister?: (username: string, password: string) => Promise<void>;
  isLoading?: boolean;
  errorMessage?: string | null;
  onOpenAbout?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLogin,
  onRegister,
  isLoading = false,
  errorMessage,
  onOpenAbout,
}) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    if (isRegistering && onRegister) {
      onRegister(username.trim(), password);
    } else {
      onLogin(username.trim(), password);
    }
  };

  return (
    <div className="w-full h-full bg-[#313338] flex items-center justify-center p-4 selection:bg-[#5865f2]/40 select-none overflow-y-auto">
      <div className="w-full max-w-md bg-[#2b2d31] border border-[#1e1f22] rounded-2xl shadow-2xl p-6 sm:p-8 text-[#dbdee1] my-auto">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#5865f2]/20 border border-[#5865f2]/30 flex items-center justify-center mx-auto mb-3 text-[#5865f2]">
            <Radio className="w-6 h-6 text-[#5865f2]" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            {isRegistering ? 'Create Matrix Account' : 'Welcome back!'}
          </h2>
          <p className="text-xs sm:text-sm text-[#949ba4] mt-1">
            {isRegistering ? 'Register instantly on matrix.org' : "We're so excited to see you again!"}
          </p>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-medium">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#b5bac1] mb-2">
              Account / Username <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-[#949ba4] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username or @user:matrix.org"
                className="w-full bg-[#1e1f22] text-sm text-white pl-10 pr-3 py-2.5 rounded-xl border border-[#3f4147] focus:outline-hidden focus:border-[#5865f2] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#b5bac1] mb-2">
              Password <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#949ba4] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full bg-[#1e1f22] text-sm text-white pl-10 pr-10 py-2.5 rounded-xl border border-[#3f4147] focus:outline-hidden focus:border-[#5865f2] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="min-w-[36px] min-h-[36px] absolute right-2 top-1/2 -translate-y-1/2 text-[#949ba4] hover:text-white flex items-center justify-center p-1 cursor-pointer"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !username.trim() || !password}
            className="w-full mt-2 h-12 rounded-xl bg-[#5865f2] hover:bg-[#4752c4] active:scale-[0.98] text-white font-semibold text-sm transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>{isRegistering ? 'Registering Account...' : 'Authenticating with Matrix...'}</span>
              </>
            ) : (
              <>
                <span>{isRegistering ? 'Register & Sign In' : 'Sign In'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsRegistering(!isRegistering)}
            className="w-full mt-2 py-2 text-center text-sm font-semibold text-[#5865f2] hover:text-[#4752c4] hover:underline transition-colors block cursor-pointer bg-transparent border-none"
          >
            {isRegistering ? 'Already have an account? Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <span className="text-xs text-[#5865f2] font-medium flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#5865f2]" />
            Homeserver: https://matrix.org
          </span>
          {onOpenAbout && (
            <div className="mt-1 flex justify-center">
              <button
                type="button"
                onClick={onOpenAbout}
                className="text-xs text-[#5865f2] hover:text-[#4752c4] hover:underline transition-colors font-medium min-h-[44px] inline-flex items-center justify-center px-3 py-1 cursor-pointer bg-transparent border-none"
              >
                About Vibe
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
