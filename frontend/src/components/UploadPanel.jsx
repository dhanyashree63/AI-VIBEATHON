import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { createInvestigation, uploadDataset, fetchSettingsStatus } from '../api';
import { useI18n } from '../context/I18nContext';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function UploadPanel({
  activeInvestigationId,
  investigations = [],
  onUploadComplete,
  onOpenInvestigation
}) {
  const { t } = useI18n();

  const [maxUploadMb, setMaxUploadMb] = useState(50);
  const [allowedExts, setAllowedExts] = useState(['.csv', '.xlsx', '.json', '.txt']);
  const [selectedTargetInv, setSelectedTargetInv] = useState(activeInvestigationId || '');
  const [stagedItems, setStagedItems] = useState([]); // { id, file, status: 'ready'|'uploading'|'done'|'error', error?, profile? }
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [completedInvId, setCompletedInvId] = useState(null);

  const fileInputRef = useRef(null);
  const replaceInputRef = useRef(null);
  const [replaceId, setReplaceId] = useState(null);

  useEffect(() => {
    setSelectedTargetInv(activeInvestigationId || '');
  }, [activeInvestigationId]);

  useEffect(() => {
    fetchSettingsStatus()
      .then((res) => {
        if (res?.security?.max_upload_mb) setMaxUploadMb(res.security.max_upload_mb);
        if (res?.security?.allowed_extensions?.length) setAllowedExts(res.security.allowed_extensions);
      })
      .catch(() => {});
  }, []);

  const validateSingleFile = (f) => {
    const lower = f.name.toLowerCase();
    if (!allowedExts.some((ext) => lower.endsWith(ext))) {
      return `Unsupported format "${f.name}". Allowed: ${allowedExts.join(', ')}.`;
    }
    if (f.size === 0) {
      return `File "${f.name}" is empty (0 bytes).`;
    }
    if (f.size > maxUploadMb * 1024 * 1024) {
      return `File "${f.name}" exceeds the ${maxUploadMb} MB limit.`;
    }
    return null;
  };

  const stageFiles = (fileList) => {
    setError('');
    const incoming = Array.from(fileList || []);
    const next = [];
    for (const f of incoming) {
      const err = validateSingleFile(f);
      if (err) {
        setError(err);
      } else {
        next.push({
          id: `${f.name}-${f.size}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          file: f,
          status: 'ready',
          error: null,
          profile: null
        });
      }
    }
    if (next.length > 0) {
      setStagedItems((prev) => [...prev, ...next]);
    }
  };

  const handleReplaceFile = (fileList) => {
    if (!replaceId || !fileList || fileList.length === 0) return;
    setError('');
    const f = fileList[0];
    const err = validateSingleFile(f);
    if (err) {
      setError(err);
      return;
    }
    setStagedItems((prev) =>
      prev.map((item) =>
        item.id === replaceId ? { ...item, file: f, status: 'ready', error: null, profile: null } : item
      )
    );
    setReplaceId(null);
  };

  const handleRemoveItem = (id) => {
    setStagedItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleConfirmUpload = async () => {
    const pending = stagedItems.filter((item) => item.status === 'ready' || item.status === 'error');
    if (pending.length === 0) return;

    setIsUploading(true);
    setError('');
    setProgress(10);

    try {
      let invId = selectedTargetInv || activeInvestigationId;
      if (!invId) {
        const form = new FormData();
        form.append('title', `Investigation: ${pending[0].file.name.replace(/\.[^/.]+$/, '')}`);
        form.append('description', `Uploaded ${pending.length} dataset(s) for investigation.`);
        form.append('budget_limit', '10000');
        form.append('time_limit_days', '14');
        const created = await createInvestigation(form);
        invId = created?.investigation?.id;
        if (!invId) throw new Error('Failed to obtain new investigation ID.');
        setSelectedTargetInv(invId);
      }

      let anySucceeded = false;
      for (let i = 0; i < pending.length; i++) {
        const item = pending[i];
        setStagedItems((prev) =>
          prev.map((x) => (x.id === item.id ? { ...x, status: 'uploading', error: null } : x))
        );
        try {
          const cleanName = item.file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
          const res = await uploadDataset(invId, item.file, cleanName);
          anySucceeded = true;
          setStagedItems((prev) =>
            prev.map((x) => (x.id === item.id ? { ...x, status: 'done', profile: res.profile } : x))
          );
        } catch (fileErr) {
          setStagedItems((prev) =>
            prev.map((x) => (x.id === item.id ? { ...x, status: 'error', error: fileErr.message } : x))
          );
        }
        setProgress(Math.round(((i + 1) / pending.length) * 100));
      }

      if (anySucceeded) {
        setCompletedInvId(invId);
        if (onUploadComplete) await onUploadComplete(invId);
      }
    } catch (err) {
      setError(err.message || 'Upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  const pendingCount = stagedItems.filter((i) => i.status === 'ready' || i.status === 'error').length;
  const doneCount = stagedItems.filter((i) => i.status === 'done').length;

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111625] p-6 space-y-5 transition-colors">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={allowedExts.join(',')}
        className="hidden"
        onChange={(e) => {
          stageFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept={allowedExts.join(',')}
        className="hidden"
        onChange={(e) => {
          handleReplaceFile(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          stageFiles(e.dataTransfer.files);
        }}
        className={`rounded-xl border border-dashed transition-colors p-7 text-center ${
          isDragging
            ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500'
            : 'bg-slate-50/70 dark:bg-[#0D1220] border-slate-300 dark:border-slate-700 hover:border-indigo-400'
        }`}
      >
        <div className="max-w-lg mx-auto flex flex-col items-center">
          <div className="w-11 h-11 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/60 flex items-center justify-center mb-3">
            <UploadCloud className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>

          <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
            {t('upload_title')}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t('upload_subtitle')}
          </p>

          {/* Supported Formats + Backend Size Limit */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-3.5">
            {allowedExts.map((ext) => (
              <span
                key={ext}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-700 text-[11px] font-mono font-medium text-slate-700 dark:text-slate-300 uppercase"
              >
                <FileSpreadsheet className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                <span>{ext}</span>
              </span>
            ))}
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 px-2">
              {t('max_file_size').replace('{mb}', maxUploadMb)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-[#161C2E] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 text-xs font-medium transition cursor-pointer disabled:opacity-60"
          >
            <span>{t('upload_choose_files')}</span>
          </button>
        </div>
      </div>

      {/* Validation Error */}
      {error && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Staged Files Queue (Requires Explicit Confirmation) */}
      {stagedItems.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-white">
              {t('selected_files')} ({stagedItems.length})
            </div>

            {investigations.length > 0 && !activeInvestigationId && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 dark:text-slate-400">{t('attach_to')}</span>
                <select
                  value={selectedTargetInv}
                  onChange={(e) => setSelectedTargetInv(e.target.value)}
                  disabled={isUploading}
                  className="bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200 max-w-[220px]"
                >
                  <option value="">{t('create_new_inv')}</option>
                  {investigations.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            {stagedItems.map((item) => (
              <div key={item.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  {item.status === 'uploading' && <Loader2 className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />}
                  {item.status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                  {item.status === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />}
                  {item.status === 'ready' && <FileSpreadsheet className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />}

                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{item.file.name}</div>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      {formatBytes(item.file.size)}
                      {item.status === 'done' && item.profile && (
                        <span className="text-emerald-600 dark:text-emerald-400 ml-2">
                          &bull; {item.profile.row_count} rows, {item.profile.column_count} cols &bull; Quality {item.profile.quality_score}%
                        </span>
                      )}
                      {item.status === 'error' && item.error && (
                        <span className="text-rose-600 dark:text-rose-400 ml-2">&bull; {item.error}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {item.status !== 'uploading' && item.status !== 'done' && (
                    <button
                      type="button"
                      onClick={() => {
                        setReplaceId(item.id);
                        replaceInputRef.current?.click();
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>{t('ob_replace_file')}</span>
                    </button>
                  )}
                  {item.status !== 'uploading' && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>{t('ob_remove_file')}</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {isUploading && (
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {doneCount > 0 && `${doneCount} uploaded`}
              {doneCount > 0 && pendingCount > 0 && ' · '}
              {pendingCount > 0 && `${pendingCount} awaiting confirmation`}
            </div>

            <div className="flex items-center gap-2.5">
              {completedInvId && onOpenInvestigation && (
                <button
                  type="button"
                  onClick={() => onOpenInvestigation(completedInvId)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white dark:bg-[#161C2E] border border-slate-200 dark:border-slate-700 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:border-indigo-400 transition cursor-pointer"
                >
                  <span>{t('open_investigation')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}

              {pendingCount > 0 && (
                <button
                  type="button"
                  onClick={handleConfirmUpload}
                  disabled={isUploading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium transition disabled:opacity-50 cursor-pointer"
                >
                  {isUploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isUploading ? `${t('uploading_pct')} (${progress}%)...` : `${t('confirm_upload')} (${pendingCount})`}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
