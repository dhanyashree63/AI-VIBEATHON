import React, { useState, useRef, useEffect } from 'react';
import { X, PlusCircle, UploadCloud, FileSpreadsheet, Trash2, AlertCircle } from 'lucide-react';
import { createInvestigation, uploadDataset } from '../api';
import { useI18n } from '../context/I18nContext';

const ALLOWED_EXTS = ['.csv', '.xlsx', '.json', '.txt'];

export default function NewInvestigationModal({ isOpen, onClose, onCreated }) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleFilesAdded = (fileList) => {
    setError('');
    const incoming = Array.from(fileList || []);
    const valid = [];
    for (const f of incoming) {
      const lower = f.name.toLowerCase();
      if (!ALLOWED_EXTS.some((ext) => lower.endsWith(ext))) {
        setError(`Unsupported format "${f.name}". Allowed: .csv, .xlsx, .json, .txt.`);
      } else if (f.size === 0) {
        setError(`File "${f.name}" is empty.`);
      } else {
        valid.push(f);
      }
    }
    if (valid.length > 0) {
      setFiles((prev) => [...prev, ...valid]);
      if (!title.trim()) {
        setTitle(valid[0].name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (cleanTitle.length < 2) {
      setError('Investigation name must be at least 2 characters.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const form = new FormData();
      form.append('title', cleanTitle);
      form.append('description', description.trim());
      form.append('budget_limit', '10000');
      form.append('time_limit_days', '14');

      const res = await createInvestigation(form);
      const invId = res?.investigation?.id;
      if (!invId) {
        throw new Error('Server created the session without returning an investigation ID.');
      }

      // Upload any attached datasets
      for (const f of files) {
        await uploadDataset(invId, f, f.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '));
      }

      setTitle('');
      setDescription('');
      setFiles([]);
      onCreated(invId);
      onClose();
    } catch (err) {
      setError(err.message || 'Creation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-inv-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111625] shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h2 id="new-inv-modal-title" className="text-sm font-semibold text-slate-900 dark:text-white">
              {t('cta_start_investigation')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="new-inv-title" className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {t('ob_session_name_label')} <span className="text-rose-500">*</span>
            </label>
            <input
              id="new-inv-title"
              type="text"
              placeholder={t('ob_session_name_placeholder')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="new-inv-desc" className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {t('modal_desc_label')}
            </label>
            <textarea
              id="new-inv-desc"
              rows={2}
              placeholder={t('modal_desc_placeholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 leading-relaxed"
            />
          </div>

          {/* Optional Dataset Upload */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {t('modal_attach_dataset')}
            </label>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".csv,.xlsx,.json,.txt"
              className="hidden"
              onChange={(e) => {
                handleFilesAdded(e.target.files);
                e.target.value = '';
              }}
            />
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileRef.current?.click();
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFilesAdded(e.dataTransfer.files);
              }}
              className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-[#0D1220] hover:border-indigo-400 p-4 text-center cursor-pointer transition"
            >
              <UploadCloud className="w-5 h-5 mx-auto text-indigo-600 dark:text-indigo-400 mb-1" />
              <div className="text-xs text-slate-600 dark:text-slate-300">{t('ob_drop_hint')}</div>
            </div>

            {files.length > 0 && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                {files.map((f, idx) => (
                  <div key={`${f.name}-${idx}`} className="px-3 py-2 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 truncate text-slate-800 dark:text-slate-200">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <span className="truncate">{f.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-rose-500 hover:text-rose-700 p-1"
                      aria-label="Remove file"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
              {t('cancel_btn')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium transition disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Creating...' : t('create_btn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
