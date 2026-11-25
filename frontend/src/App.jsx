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
import {
  fetchInvestigations,
  fetchInvestigation,
  loadDemoScenario,
  executeDemoNextStep
} from './api';
import { CheckCircle2, AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';

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
  const initialRoute = parseRoute(window.location.pathname);

  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (initialRoute.viewingDetail) return false; // Direct /investigations/:id link skips onboarding
    try {
      return localStorage.getItem(ONBOARDING_STORAGE_KEY) !== 'true';
    } catch {
      return false;
    }
  });

  const [activeTab, setActiveTab] = useState(initialRoute.tab);
  const [investigations, setInvestigations] = useState([]);
  const [currentId, setCurrentId] = useState(initialRoute.invId);
  const [currentInvestigation, setCurrentInvestigation] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [viewingDetail, setViewingDetail] = useState(initialRoute.viewingDetail);
  const [detailSubTab, setDetailSubTab] = useState('summary');
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

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
    const url = `/investigations/${encodeURIComponent(id)}`;
    const newWin = window.open(url, '_blank', 'noopener,noreferrer');
    if (!newWin) {
      // Graceful fallback if browser blocks popups
      handleOpenInvestigation(id, 'summary');
      showToast('Pop-up blocked — opened investigation in this tab.', 'success');
    }
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
        />

        <main className="flex-1 px-4 sm:px-8 py-6 sm:py-8 overflow-x-hidden">
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
                  {loadError.status === 404 ? 'Investigation Not Found' : 'Unable to Load Investigation'}
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
                    <span>All Investigations</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => loadInvestigationDetails(loadError.id)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry</span>
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
    </div>
  );
}
