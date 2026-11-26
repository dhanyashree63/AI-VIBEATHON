import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import Overview from './components/Overview';
import Investigations from './components/Investigations';
import DataSources from './components/DataSources';
import Reports from './components/Reports';
import Settings from './components/Settings';
import Help from './components/Help';
import NewInvestigationModal from './components/NewInvestigationModal';
import OnboardingWizard from './components/OnboardingWizard';
import IntroVideo from './components/IntroVideo';
import AuthModal from './components/AuthModal';
import InspectReportModal from './components/InspectReportModal';
import {
  fetchInvestigations,
  fetchInvestigation,
  loadDemoScenario,
  executeDemoNextStep,
  fetchCurrentUser,
  clearAuthToken
} from './api';
import { CheckCircle2, AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';
import { useI18n } from './context/I18nContext';

const ONBOARDING_STORAGE_KEY = 'reverse_ai_onboarding_completed';

function parseRoute(pathname) {
  const match = pathname.match(/^\/investigations\/([^/]+)\/?$/);
  if (match) {
    return { tab: 'investigations', invId: decodeURIComponent(match[1]), viewingDetail: true };
  }
  if (pathname === '/investigations' || pathname === '/investigations/') {
    return { tab: 'investigations', invId: null, viewingDetail: false };
  }
  return { tab: 'overview', invId: null, viewingDetail: false };
}

export default function App() {
  const { t } = useI18n();
  const initialRoute = parseRoute(window.location.pathname);

  const [showIntro, setShowIntro] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [activeTab, setActiveTab] = useState(initialRoute.tab);
  const [investigations, setInvestigations] = useState([]);
  const [currentId, setCurrentId] = useState(initialRoute.invId);
  const [currentInvestigation, setCurrentInvestigation] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [viewingDetail, setViewingDetail] = useState(initialRoute.viewingDetail);
  const [detailSubTab, setDetailSubTab] = useState('summary');
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [inspectModal, setInspectModal] = useState(null); // { id, title }
  const [currentUser, setCurrentUser] = useState(null);
  const [backendOffline, setBackendOffline] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  useEffect(() => {
    // Use a 5-second timeout so a slow-starting backend doesn't falsely trigger offline mode
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    fetch('/api/health', { signal: controller.signal })
      .then((res) => {
        clearTimeout(timer);
        if (!res.ok) setBackendOffline(true);
        else setBackendOffline(false);
      })
      .catch((err) => {
        clearTimeout(timer);
        // Only mark offline if it's a real network failure, not a user navigation abort
        if (err.name !== 'AbortError' || controller.signal.aborted) {
          setBackendOffline(true);
        }
      });
    fetchCurrentUser().then((u) => {
      if (u) setCurrentUser(u);
    });
  }, []);

  const showToast = (msg, type = 'success') => {
    setToastMessage({ msg, type });
    setTimeout(() => setToastMessage(null), 4500);
  };

  const pushUrl = (path) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
  };

  const loadInvestigationsList = useCallback(async (preferredId = null) => {
    try {
      const res = await fetchInvestigations();
      const list = res.investigations || [];
      setInvestigations(list);

      if (preferredId) {
        setCurrentId(preferredId);
      } else if (list.length > 0 && !currentId && !initialRoute.invId) {
        setCurrentId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load investigations list:', err);
    }
  }, [currentId, initialRoute.invId]);

  const loadInvestigationDetails = useCallback(async (id) => {
    if (!id) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await fetchInvestigation(id);
      setCurrentInvestigation(data);
    } catch (err) {
      setCurrentInvestigation(null);
      setLoadError({
        id,
        status: err.status || 500,
        message: err.message || 'Unable to load investigation.'
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInvestigationsList();
  }, []);

  useEffect(() => {
    if (currentId) {
      loadInvestigationDetails(currentId);
    } else {
      setCurrentInvestigation(null);
      setLoadError(null);
    }
  }, [currentId, loadInvestigationDetails]);

  // Browser back/forward navigation support
  useEffect(() => {
    const handlePopState = () => {
      const route = parseRoute(window.location.pathname);
      setActiveTab(route.tab);
      setViewingDetail(route.viewingDetail);
      if (route.invId) {
        setCurrentId(route.invId);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleOpenInvestigation = (id, subTab = 'summary') => {
    setCurrentId(id);
    setDetailSubTab(subTab);
    setViewingDetail(true);
    setActiveTab('investigations');
    pushUrl(`/investigations/${encodeURIComponent(id)}`);
  };

  const handleInspectInvestigation = (id) => {
    // Find the title from the loaded investigations list
    const inv = investigations.find((i) => i.id === id);
    setInspectModal({ id, title: inv?.title || id });
  };

  const handleClearSelection = () => {
    setViewingDetail(false);
    setLoadError(null);
    pushUrl('/investigations');
  };

  const handleDeletedInvestigation = async (deletedId) => {
    if (currentId === deletedId) {
      setCurrentId(null);
      setCurrentInvestigation(null);
      setViewingDetail(false);
      setLoadError(null);
      pushUrl('/investigations');
    }
    try {
      const res = await fetchInvestigations();
      const list = res.investigations || [];
      setInvestigations(list);
      if (currentId === deletedId && list.length > 0) {
        setCurrentId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to refresh investigations after delete:', err);
    }
    showToast('Investigation deleted permanently.');
  };

  const handleLoadDemo = async () => {
    setIsLoading(true);
    try {
      const res = await loadDemoScenario();
      await loadInvestigationsList(res.demo_investigation_id);
      await loadInvestigationDetails(res.demo_investigation_id);
      handleOpenInvestigation(res.demo_investigation_id, 'summary');
      showToast('Manufacturing Demo loaded with 5 fused datasets and live statistical tests.');
    } catch (err) {
      showToast('Failed to load demo: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteNextStep = async () => {
    setIsLoading(true);
    try {
      await executeDemoNextStep();
      if (currentId) await loadInvestigationDetails(currentId);
      await loadInvestigationsList(currentId);
      setDetailSubTab('explanations');
      showToast('Simulated coolant telemetry ingested. Root Cause Proven & alternatives refuted!');
    } catch (err) {
      showToast('Execution failed: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNavChange = (tab) => {
    setActiveTab(tab);
    setLoadError(null);
    if (tab === 'investigations') {
      setViewingDetail(false);
      pushUrl('/investigations');
    } else if (tab === 'overview') {
      setViewingDetail(false);
      pushUrl('/');
    }
  };

  const markOnboardingComplete = () => {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    } catch {
      // ignore storage errors
    }
    setShowOnboarding(false);
  };

  const handleOnboardingComplete = async (invId) => {
    markOnboardingComplete();
    if (invId) {
      await loadInvestigationsList(invId);
      await loadInvestigationDetails(invId);
      handleOpenInvestigation(invId, 'summary');
      showToast('Investigation ready. Review your findings below.');
    }
  };

  const handleOnboardingDemo = async () => {
    markOnboardingComplete();
    await handleLoadDemo();
  };

  const counts = {
    investigations: investigations.length,
    datasets: currentInvestigation?.datasets?.length || 0
  };

  if (showIntro) {
    return <IntroVideo onComplete={() => setShowIntro(false)} />;
  }

  if (showOnboarding) {
    return (
      <OnboardingWizard
        onComplete={handleOnboardingComplete}
        onSkip={markOnboardingComplete}
        onRunDemo={handleOnboardingDemo}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FC] dark:bg-[#0B0F1A] text-[#111827] dark:text-[#E5E7EB] flex transition-colors duration-150">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-indigo-600 focus:text-white focus:text-xs focus:font-semibold"
      >
        {t('skip_to_main')}
      </a>
      <Sidebar
        activeTab={activeTab}
        setActiveTab={handleNavChange}
        counts={counts}
        mobileOpen={mobileMenuOpen}
        setMobileOpen={setMobileMenuOpen}
      />

      <div className="flex-1 flex flex-col min-w-0 lg:pl-60">
        <Navbar
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onNavigate={handleNavChange}
          onLoadDemo={handleLoadDemo}
          recentEvents={currentInvestigation?.history || []}
          isLoading={isLoading}
          user={currentUser}
          onOpenAuth={() => setIsAuthModalOpen(true)}
          onLogout={() => {
            clearAuthToken();
            setCurrentUser(null);
            loadInvestigationsList();
            showToast('Signed out.');
          }}
        />

        <main id="main-content" className="flex-1 px-4 sm:px-8 py-6 sm:py-8 overflow-x-hidden">
          {backendOffline && (
            <div className="max-w-6xl mx-auto mb-5 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                <strong>{t('backend_offline_title')}</strong> {t('backend_offline_desc')}
              </span>
            </div>
          )}
          {activeTab === 'overview' && (
            <Overview
              investigations={investigations}
              activeInvestigationId={currentId}
              onOpenNewModal={() => setIsModalOpen(true)}
              onLoadDemo={handleLoadDemo}
              onOpenInvestigation={handleOpenInvestigation}
              onInspectInvestigation={handleInspectInvestigation}
              onViewAllInvestigations={() => {
                setViewingDetail(false);
                setActiveTab('investigations');
                pushUrl('/investigations');
              }}
              onUploadComplete={async (id) => {
                await loadInvestigationsList(id);
                if (id) await loadInvestigationDetails(id);
                showToast('Dataset uploaded and profiled successfully.');
              }}
              isLoading={isLoading}
            />
          )}

          {activeTab === 'investigations' && (
            viewingDetail && loadError ? (
              <div className="max-w-lg mx-auto my-12 rounded-xl bg-white dark:bg-[#111625] border border-slate-200 dark:border-slate-800 p-8 text-center space-y-4">
                <div className="w-11 h-11 mx-auto rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {loadError.status === 404 ? t('inv_not_found') : t('unable_to_load_inv')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {loadError.message} ({loadError.id})
                </p>
                <div className="flex items-center justify-center gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white dark:bg-[#161C2E] border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>{t('all_investigations')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => loadInvestigationDetails(loadError.id)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{t('retry_btn')}</span>
                  </button>
                </div>
              </div>
            ) : (
              <Investigations
                investigations={investigations}
                selectedInvestigation={viewingDetail ? currentInvestigation : null}
                onSelectInvestigation={(id) => handleOpenInvestigation(id, 'summary')}
                onInspectInvestigation={handleInspectInvestigation}
                onClearSelection={handleClearSelection}
                onOpenNewModal={() => setIsModalOpen(true)}
                onLoadDemo={handleLoadDemo}
                onExecuteNextStep={handleExecuteNextStep}
                onRefresh={() => currentId && loadInvestigationDetails(currentId)}
                onListChanged={() => loadInvestigationsList()}
                onDeletedInvestigation={handleDeletedInvestigation}
                onShowToast={showToast}
                isLoading={isLoading}
                initialSubTab={detailSubTab}
              />
            )
          )}

          {activeTab === 'sources' && (
            <DataSources
              investigation={currentInvestigation}
              investigations={investigations}
              onSelectInvestigation={(id) => setCurrentId(id)}
              onRefresh={async () => {
                await loadInvestigationsList(currentId);
                if (currentId) await loadInvestigationDetails(currentId);
              }}
              isLoading={isLoading}
            />
          )}

          {activeTab === 'reports' && (
            <Reports
              investigation={currentInvestigation}
              investigations={investigations}
              onSelectInvestigation={(id) => setCurrentId(id)}
              onStartInvestigation={() => setIsModalOpen(true)}
            />
          )}

          {activeTab === 'settings' && (
            <Settings onReopenOnboarding={() => setShowOnboarding(true)} />
          )}

          {activeTab === 'help' && (
            <Help
              onLoadDemo={handleLoadDemo}
              onReopenOnboarding={() => setShowOnboarding(true)}
              isLoading={isLoading}
            />
          )}
        </main>
      </div>

      {/* Toast Notification */}
      <div aria-live="polite" aria-atomic="true">
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-lg bg-white dark:bg-[#161C2E] border border-slate-200 dark:border-slate-700 shadow-lg text-xs font-medium text-slate-900 dark:text-white">
            {toastMessage.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            )}
            <span>{toastMessage.msg}</span>
          </div>
        )}
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthenticated={async (user) => {
          setCurrentUser(user);
          await loadInvestigationsList();
          showToast(`Signed in as ${user.name}.`);
        }}
      />

      {/* New Investigation Modal */}
      <NewInvestigationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={async (id) => {
          await loadInvestigationsList(id);
          await loadInvestigationDetails(id);
          handleOpenInvestigation(id, 'summary');
          showToast('New investigation session created.');
        }}
      />

      {/* Inspect Report Modal */}
      {inspectModal && (
        <InspectReportModal
          investigationId={inspectModal.id}
          investigationTitle={inspectModal.title}
          onClose={() => setInspectModal(null)}
        />
      )}
    </div>
  );
}
