import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  TrendingUp,
  Scale,
  Compass,
  FileSpreadsheet,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Play,
  Sun,
  Moon,
  Monitor,
  Globe,
  Info
} from 'lucide-react';
import {
  createInvestigation,
  uploadDataset,
  fuseDatasets,
  triggerAnomalyDiscovery,
  evaluateHypotheses,
  generateRecommendations
} from '../api';
import { useTheme } from '../context/ThemeContext';
import { useI18n, LANGUAGES } from '../context/I18nContext';

const ALLOWED_EXTS = ['.csv', '.xlsx', '.json', '.txt'];
const MAX_BYTES = 50 * 1024 * 1024;

export default function OnboardingWizard({
  onComplete,
  onSkip,
  onRunDemo
}) {
  const { theme, setTheme } = useTheme();
  const { lang, setLang, t } = useI18n();

  const [step, setStep] = useState('welcome'); // welcome | how_it_works | upload | journey
  const [sessionName, setSessionName] = useState('');
  const [stagedFiles, setStagedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [createdInvId, setCreatedInvId] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

  // Real backend pipeline stage statuses
  const [stages, setStages] = useState({
    quality: { status: 'waiting', detail: '' },
    patterns: { status: 'waiting', detail: '' },
    explanations: { status: 'waiting', detail: '' },
    next_step: { status: 'waiting', detail: '' }
  });

  const fileInputRef = useRef(null);
  const replaceInputRef = useRef(null);
  const [replaceIndex, setReplaceIndex] = useState(null);

  const validateFile = (file) => {
    const lower = file.name.toLowerCase();
    if (!ALLOWED_EXTS.some((ext) => lower.endsWith(ext))) {
      return `Unsupported format "${file.name}". Supported formats: .csv, .xlsx, .json, .txt.`;
    }
    if (file.size === 0) {
      return `File "${file.name}" is empty.`;
    }
    if (file.size > MAX_BYTES) {
      return `File "${file.name}" exceeds the 50 MB upload limit.`;
    }
    return null;
  };

  const handleAddFiles = (fileList) => {
    setValidationError('');
    const incoming = Array.from(fileList || []);
    const valid = [];
    for (const f of incoming) {
      const err = validateFile(f);
      if (err) {
        setValidationError(err);
      } else {
        valid.push(f);
      }
    }
    if (valid.length > 0) {
      setStagedFiles((prev) => [...prev, ...valid]);
      if (!sessionName.trim()) {
        setSessionName(valid[0].name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '));
      }
    }
  };

  const handleReplaceFile = (fileList) => {
    if (replaceIndex === null || !fileList || fileList.length === 0) return;
    setValidationError('');
    const file = fileList[0];
    const err = validateFile(file);
    if (err) {
      setValidationError(err);
      return;
    }
    setStagedFiles((prev) => prev.map((item, idx) => (idx === replaceIndex ? file : item)));
    setReplaceIndex(null);
  };

  const handleRemoveFile = (idx) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateStage = (key, status, detail = '') => {
    setStages((prev) => ({ ...prev, [key]: { status, detail } }));
  };

  const handleRunGuidedInvestigation = async () => {
    if (stagedFiles.length === 0) {
      setValidationError('Please select at least one CSV, Excel, or JSON file.');
      return;
    }
    setValidationError('');
    setStep('journey');
    setIsRunning(true);
    setUploadProgress(10);

    setStages({
      quality: { status: 'running', detail: '' },
      patterns: { status: 'waiting', detail: '' },
      explanations: { status: 'waiting', detail: '' },
      next_step: { status: 'waiting', detail: '' }
    });

    try {
      // 1. Create investigation session
      const form = new FormData();
      form.append('title', sessionName.trim() || `Investigation: ${stagedFiles[0].name}`);
      form.append('description', `Guided onboarding investigation with ${stagedFiles.length} uploaded file(s).`);
      form.append('budget_limit', '10000');
      form.append('time_limit_days', '14');
      const created = await createInvestigation(form);
      const invId = created.investigation.id;
      setCreatedInvId(invId);

      // 2. Upload & profile each file
      let qualityScores = [];
      for (let i = 0; i < stagedFiles.length; i++) {
        const f = stagedFiles[i];
        const upRes = await uploadDataset(invId, f, f.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '));
        if (upRes.profile?.quality_score !== undefined) {
          qualityScores.push(upRes.profile.quality_score);
        }
        setUploadProgress(Math.round(((i + 1) / stagedFiles.length) * 100));
      }

      // Fuse if multiple files
      let fuseNote = '';
      if (stagedFiles.length > 1) {
        const fuseRes = await fuseDatasets(invId);
        fuseNote = ` · ${fuseRes.fused_rows} fused rows`;
      }
      const avgQ = qualityScores.length > 0
        ? (qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length).toFixed(1)
        : '—';
      updateStage('quality', 'done', `${stagedFiles.length} file(s) profiled · ${avgQ}% avg quality${fuseNote}`);

      // 3. Discover anomalies
      updateStage('patterns', 'running');
      const discRes = await triggerAnomalyDiscovery(invId);
      const anomCount = discRes.anomalies?.length || 0;
      updateStage('patterns', 'done', `${anomCount} pattern shift(s) detected`);

      // 4. Evaluate competing explanations
      updateStage('explanations', 'running');
      const hypRes = await evaluateHypotheses(invId);
      const hypCount = hypRes.hypotheses?.length || 0;
      updateStage('explanations', 'done', `${hypCount} explanation(s) statistically tested`);

      // 5. Generate next-best evidence recommendations
      updateStage('next_step', 'running');
      const recRes = await generateRecommendations(invId);
      const recCount = recRes.recommendations?.length || 0;
      updateStage('next_step', 'done', `${recCount} next-step recommendation(s) ranked`);
    } catch (err) {
      setValidationError(err.message || 'An error occurred during investigation.');
      setStages((prev) => {
        const updated = { ...prev };
        for (const k of Object.keys(updated)) {
          if (updated[k].status === 'running') {
            updated[k] = { status: 'error', detail: err.message };
          }
        }
        return updated;
      });
    } finally {
      setIsRunning(false);
    }
  };

  const howStages = [
    { icon: UploadCloud, title: t('ob_stage1_title'), desc: t('ob_stage1_desc'), accent: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60' },
    { icon: TrendingUp, title: t('ob_stage2_title'), desc: t('ob_stage2_desc'), accent: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60' },
    { icon: Scale, title: t('ob_stage3_title'), desc: t('ob_stage3_desc'), accent: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60' },
    { icon: Compass, title: t('ob_stage4_title'), desc: t('ob_stage4_desc'), accent: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60' }
  ];

  const allStagesDone =
    !isRunning &&
    createdInvId &&
    stages.next_step.status === 'done';

  return (
    <div className="min-h-screen bg-[#F8F9FC] dark:bg-[#0B0F1A] text-[#111827] dark:text-[#E5E7EB] flex flex-col transition-colors">
      {/* Top Bar: Brand + Theme + Language + Skip */}
      <header className="h-16 bg-white dark:bg-[#111625] border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#4F46E5] flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L3 7L12 12L21 7L12 2Z" fill="white" />
              <path d="M3 12L12 17L21 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.85" />
              <path d="M3 17L12 22L21 17" stroke="#A5B4FC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="font-display font-bold text-sm tracking-wide text-slate-900 dark:text-white">
            REVERSE AI
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Theme Switcher */}
          <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F1A] p-0.5">
            {[
              { id: 'light', icon: Sun, label: t('theme_light') },
              { id: 'dark', icon: Moon, label: t('theme_dark') },
              { id: 'system', icon: Monitor, label: t('theme_system') }
            ].map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTheme(opt.id)}
                  title={opt.label}
                  className={`p-1.5 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    theme === opt.id
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              );
            })}
          </div>

          {/* Language Select */}
          <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111625] px-2 py-1">
            <Globe className="w-3.5 h-3.5 text-slate-400" />
            <select
              aria-label={t('language_label')}
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="bg-transparent text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} className="bg-white dark:bg-[#111625]">
                  {l.native}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={onSkip}
            className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {t('ob_skip')}
          </button>
        </div>
      </header>

      {/* Centered Content Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-3xl">
          {/* STEP 1: WELCOME */}
          {step === 'welcome' && (
            <div className="rounded-xl bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 p-8 sm:p-12 text-center space-y-6">
              <div className="text-[11px] font-mono font-semibold tracking-[0.16em] text-indigo-600 dark:text-indigo-400 uppercase">
                {t('brand_tagline')}
              </div>

              <h1 className="text-2xl sm:text-4xl font-bold text-slate-900 dark:text-white leading-tight tracking-tight max-w-2xl mx-auto">
                {t('ob_welcome_heading')}
              </h1>

              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto leading-relaxed">
                {t('ob_welcome_subtitle')}
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('upload')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-[#111625] cursor-pointer"
                >
                  <span>{t('ob_cta_start')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setStep('how_it_works')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white dark:bg-[#161C2E] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <span>{t('ob_cta_explore')}</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: HOW IT WORKS (4 PLAIN-LANGUAGE STAGES) */}
          {step === 'how_it_works' && (
            <div className="rounded-xl bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('ob_how_title')}</h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">{t('ob_how_subtitle')}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {howStages.map((s) => {
                  const Icon = s.icon;
                  return (
                    <div key={s.title} className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0D1220] space-y-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.accent}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{s.title}</h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{s.desc}</p>
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep('welcome')}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-3 py-2 rounded-lg"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{t('ob_back')}</span>
                </button>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={onRunDemo}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white dark:bg-[#161C2E] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-medium transition cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>{t('cta_see_how_it_works')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep('upload')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium transition cursor-pointer"
                  >
                    <span>{t('ob_continue_upload')}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: GUIDED UPLOAD */}
          {step === 'upload' && (
            <div className="rounded-xl bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('ob_upload_title')}</h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">{t('ob_upload_subtitle')}</p>
              </div>

              {/* Dataset Tips */}
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#0D1220] border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
                  <Info className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>{t('ob_upload_tips_title')}</span>
                </div>
                <ul className="list-disc pl-5 text-slate-600 dark:text-slate-400 space-y-1">
                  <li>{t('ob_upload_tip1')}</li>
                  <li>{t('ob_upload_tip2')}</li>
                  <li>{t('ob_upload_tip3')}</li>
                </ul>
              </div>

              {/* Investigation Name */}
              <div className="space-y-1.5">
                <label htmlFor="ob-session-name" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t('ob_session_name_label')}
                </label>
                <input
                  id="ob-session-name"
                  type="text"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder={t('ob_session_name_placeholder')}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Keyboard-Accessible Dropzone */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".csv,.xlsx,.json,.txt"
                className="hidden"
                onChange={(e) => {
                  handleAddFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={replaceInputRef}
                type="file"
                accept=".csv,.xlsx,.json,.txt"
                className="hidden"
                onChange={(e) => {
                  handleReplaceFile(e.target.files);
                  e.target.value = '';
                }}
              />

              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  handleAddFiles(e.dataTransfer.files);
                }}
                className={`rounded-lg border border-dashed p-7 text-center cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  isDragging
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500'
                    : 'bg-slate-50/70 dark:bg-[#0D1220] border-slate-300 dark:border-slate-700 hover:border-indigo-400'
                }`}
              >
                <UploadCloud className="w-6 h-6 mx-auto text-indigo-600 dark:text-indigo-400 mb-2" />
                <div className="text-xs font-medium text-slate-700 dark:text-slate-200">{t('ob_drop_hint')}</div>
                <div className="text-[11px] font-mono text-slate-400 mt-1">.csv &bull; .xlsx &bull; .json &bull; .txt</div>
              </div>

              {validationError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}

              {/* Staged Files with Remove & Replace */}
              {stagedFiles.length > 0 && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                  {stagedFiles.map((file, idx) => (
                    <div key={`${file.name}-${idx}`} className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileSpreadsheet className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        <span className="font-medium text-slate-900 dark:text-slate-100 truncate">{file.name}</span>
                        <span className="font-mono text-[10.5px] text-slate-400 shrink-0">
                          {(file.size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setReplaceIndex(idx);
                            replaceInputRef.current?.click();
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>{t('ob_replace_file')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(idx)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>{t('ob_remove_file')}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep('welcome')}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-3 py-2 rounded-lg"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{t('ob_back')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleRunGuidedInvestigation}
                  disabled={stagedFiles.length === 0}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs sm:text-sm font-medium transition disabled:opacity-50 cursor-pointer"
                >
                  <span>{t('ob_start_analysis')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: GUIDED INVESTIGATION JOURNEY (LIVE BACKEND EXECUTION) */}
          {step === 'journey' && (
            <div className="rounded-xl bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('ob_journey_title')}</h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">{t('ob_journey_subtitle')}</p>
              </div>

              {isRunning && uploadProgress < 100 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-mono text-slate-500">
                    <span>{t('ob_uploading_files')}</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {[
                  { key: 'quality', label: t('ob_step_quality') },
                  { key: 'patterns', label: t('ob_step_patterns') },
                  { key: 'explanations', label: t('ob_step_explanations') },
                  { key: 'next_step', label: t('ob_step_next') }
                ].map((item) => {
                  const st = stages[item.key];
                  return (
                    <div
                      key={item.key}
                      className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0D1220] flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {st.status === 'running' && <Loader2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-spin shrink-0" />}
                        {st.status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                        {st.status === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />}
                        {st.status === 'waiting' && <span className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-700 shrink-0" />}
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm font-medium text-slate-900 dark:text-white">{item.label}</div>
                          {st.detail && (
                            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                              {st.detail}
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-slate-500 shrink-0">
                        {st.status === 'done'
                          ? t('ob_status_done')
                          : st.status === 'running'
                          ? t('ob_status_running')
                          : st.status === 'error'
                          ? t('ob_status_error')
                          : t('ob_status_waiting')}
                      </span>
                    </div>
                  );
                })}
              </div>

              {validationError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                {!isRunning && !allStagesDone && (
                  <button
                    type="button"
                    onClick={() => setStep('upload')}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-3 py-2 rounded-lg"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>{t('ob_back')}</span>
                  </button>
                )}

                {allStagesDone && (
                  <button
                    type="button"
                    onClick={() => onComplete(createdInvId)}
                    className="ml-auto inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs sm:text-sm font-medium transition cursor-pointer"
                  >
                    <span>{t('ob_open_workspace')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
