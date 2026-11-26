import React, { useState, useEffect } from 'react';
import { X, Lock, AlertCircle } from 'lucide-react';
import { loginAccount, registerAccount } from '../api';
import { useI18n } from '../context/I18nContext';

export default function AuthModal({ isOpen, onClose, onAuthenticated }) {
  const { t } = useI18n();
  const [mode, setMode] = useState('login'); // login | register
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = mode === 'login'
        ? await loginAccount(email, password)
        : await registerAccount(name, email, password);
      onAuthenticated(res.user);
      onClose();
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111625] shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h2 id="auth-modal-title" className="text-sm font-semibold text-slate-900 dark:text-white">
              {mode === 'login' ? t('auth_signin_title') : t('auth_register_title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication modal"
            className="text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {mode === 'register' && (
            <div className="space-y-1">
              <label htmlFor="auth-name" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t('auth_fullname')}
              </label>
              <input
                id="auth-name"
                type="text"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="auth-email" className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {t('auth_email')}
            </label>
            <input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="auth-password" className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {t('auth_password')}
            </label>
            <input
              id="auth-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {error && (
            <div role="alert" className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError('');
              }}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              {mode === 'login' ? 'Need an account? Register' : 'Already registered? Sign In'}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium transition disabled:opacity-50"
            >
              {submitting ? '...' : (mode === 'login' ? t('auth_signin_btn') : t('auth_register_btn'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
