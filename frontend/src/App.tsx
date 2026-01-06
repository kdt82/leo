import { useState, useEffect } from 'react';
import { Settings, Image as ImageIcon, Layers, Zap, Lock, Grid, Wand2, FileSpreadsheet, LogOut, Loader2 } from 'lucide-react';
import { getApiKey, isEnvApiKey, apiClient, checkAuthStatus, logout } from './api/client';
import Dashboard from './components/Dashboard';
import Login from './components/Login';
import clsx from 'clsx';

function App() {
  const [apiKey, setApiKey] = useState(getApiKey());
  const [credits, setCredits] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'generate' | 'results' | 'gallery' | 'prompts' | 'classifier' | 'settings'>('generate');
  const fromEnv = isEnvApiKey();

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      const status = await checkAuthStatus();
      setIsAuthenticated(status.authenticated);
      setAuthEnabled(status.authEnabled);
      setAuthLoading(false);
    };
    checkAuth();
  }, []);

  const fetchCredits = () => {
    if (apiKey) {
      apiClient.get('/me', { params: { apiKey } })
        .then(res => {
          setCredits(res.data.subscriptionTokens);
        })
        .catch(err => console.error("Failed to fetch user", err));
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchCredits();
    }
  }, [apiKey, isAuthenticated]);

  const handleLogout = async () => {
    await logout();
    setIsAuthenticated(false);
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // Show login if auth is enabled and not authenticated
  if (authEnabled && !isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-background text-zinc-100 font-sans flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-zinc-800 bg-surface/50 backdrop-blur px-6 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Layers className="text-white w-5 h-5" />
          </div>
          <h1 className="font-bold text-xl tracking-tight">Leonardo Bulk Studio</h1>
        </div>

        <div className="flex items-center gap-6">
          {credits !== null && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800/50 border border-zinc-700">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-medium">{credits.toLocaleString()} credits</span>
            </div>
          )}

          {/* Show lock icon if API key is from environment */}
          {fromEnv && (
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-green-900/30 border border-green-800/50 text-green-400 text-xs">
              <Lock className="w-3 h-3" />
              <span>ENV</span>
            </div>
          )}

          <button
            onClick={() => setActiveTab('settings')}
            className={clsx("p-2 rounded-lg hover:bg-zinc-800 transition-colors", activeTab === 'settings' && "bg-zinc-800 text-indigo-400")}
          >
            <Settings className="w-5 h-5" />
          </button>

          {/* Logout button (only show if auth is enabled) */}
          {authEnabled && (
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-red-400"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex">
        <div className="w-16 border-r border-zinc-800 flex flex-col items-center py-4 gap-4 bg-surface/30">
          <NavIcon icon={ImageIcon} active={activeTab === 'generate'} onClick={() => setActiveTab('generate')} label="Generate" />
          <NavIcon icon={Wand2} active={activeTab === 'prompts'} onClick={() => setActiveTab('prompts')} label="Prompt Studio" />
          <NavIcon icon={FileSpreadsheet} active={activeTab === 'classifier'} onClick={() => setActiveTab('classifier')} label="Classifier" />
          <NavIcon icon={Layers} active={activeTab === 'results'} onClick={() => setActiveTab('results')} label="Results" />
          <NavIcon icon={Grid} active={activeTab === 'gallery'} onClick={() => setActiveTab('gallery')} label="Gallery" />
        </div>

        <div className="flex-1 overflow-auto p-0 relative">
          {apiKey ? (
            activeTab === 'generate' ? <Dashboard apiKey={apiKey} mode="generate" onBatchComplete={fetchCredits} /> :
              activeTab === 'prompts' ? <Dashboard apiKey={apiKey} mode="prompts" /> :
                activeTab === 'classifier' ? <Dashboard apiKey={apiKey} mode="classifier" /> :
                  activeTab === 'results' ? <Dashboard apiKey={apiKey} mode="results" /> :
                    activeTab === 'gallery' ? <Dashboard apiKey={apiKey} mode="gallery" /> :
                      <SettingsPage apiKey={apiKey} setApiKey={setApiKey} fromEnv={fromEnv} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-md w-full p-8 bg-surface rounded-xl border border-zinc-800 shadow-2xl">
                <h2 className="text-2xl font-bold mb-4">Welcome</h2>
                <p className="text-zinc-400 mb-6">Please enter your Leonardo API Key to verify and continue.</p>
                <SettingsPage apiKey={apiKey} setApiKey={setApiKey} isWelcome fromEnv={false} />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function NavIcon({ icon: Icon, active, onClick, label }: any) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "p-3 rounded-xl transition-all group relative",
        active ? "bg-indigo-600/20 text-indigo-400" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
      )}
      title={label}
    >
      <Icon className="w-6 h-6" />
      {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-indigo-500 rounded-r-full -ml-4" />}
    </button>
  );
}

function SettingsPage({ apiKey, setApiKey, isWelcome, fromEnv }: any) {
  const [input, setInput] = useState(apiKey);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // OpenAI settings
  const [openaiKey, setOpenaiKey] = useState(localStorage.getItem('openai_api_key') || '');
  const [openaiModel, setOpenaiModel] = useState(localStorage.getItem('openai_model') || 'gpt-4o-mini');
  const openaiKeyFromEnv = !!import.meta.env.VITE_OPENAI_API_KEY;
  const openaiModelFromEnv = !!import.meta.env.VITE_OPENAI_MODEL;

  const verify = async () => {
    setLoading(true);
    setError('');
    try {
      await apiClient.get('/me', { params: { apiKey: input } });
      setApiKey(input);
      localStorage.setItem('leonardo_api_key', input);
    } catch (e) {
      setError('Invalid API Key or Network Error');
    } finally {
      setLoading(false);
    }
  };

  const saveOpenAI = () => {
    localStorage.setItem('openai_api_key', openaiKey);
    localStorage.setItem('openai_model', openaiModel);
    alert('OpenAI settings saved!');
  };

  return (
    <div className={clsx("flex flex-col gap-6", !isWelcome && "p-8 max-w-2xl")}>
      {!isWelcome && <h2 className="text-2xl font-bold">Settings</h2>}

      {/* === Leonardo AI Section === */}
      <div className="bg-surface border border-zinc-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
          Leonardo AI
        </h3>

        {/* Show message if API key is from environment */}
        {fromEnv && !isWelcome && (
          <div className="p-4 bg-green-900/20 border border-green-800/50 rounded-lg mb-4">
            <div className="flex items-center gap-2 text-green-400 mb-2">
              <Lock className="w-4 h-4" />
              <span className="font-medium">API Key from Environment</span>
            </div>
            <p className="text-sm text-zinc-400">
              Loaded from <code className="px-1 py-0.5 bg-zinc-800 rounded text-xs">VITE_LEONARDOAI_API_KEY</code> in <code className="px-1 py-0.5 bg-zinc-800 rounded text-xs">.env</code>
            </p>
          </div>
        )}

        {/* Only show input if NOT from environment */}
        {!fromEnv && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-zinc-400">API Key</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={input}
                onChange={e => setInput(e.target.value)}
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                placeholder="Enter your Leonardo AI API key..."
              />
              <button
                onClick={verify}
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50"
              >
                {loading ? 'Verifying...' : 'Save'}
              </button>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
          </div>
        )}
      </div>

      {/* === OpenAI Section (for prompt enhancement) === */}
      {!isWelcome && (
        <div className="bg-surface border border-zinc-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            OpenAI (Prompt Enhancement)
          </h3>

          {/* OpenAI API Key */}
          {openaiKeyFromEnv ? (
            <div className="p-4 bg-green-900/20 border border-green-800/50 rounded-lg mb-4">
              <div className="flex items-center gap-2 text-green-400 mb-2">
                <Lock className="w-4 h-4" />
                <span className="font-medium">API Key from Environment</span>
              </div>
              <p className="text-sm text-zinc-400">
                Loaded from <code className="px-1 py-0.5 bg-zinc-800 rounded text-xs">VITE_OPENAI_API_KEY</code>
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 mb-4">
              <label className="text-sm font-medium text-zinc-400">OpenAI API Key</label>
              <input
                type="password"
                value={openaiKey}
                onChange={e => setOpenaiKey(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder="sk-..."
              />
            </div>
          )}

          {/* OpenAI Model */}
          {openaiModelFromEnv ? (
            <div className="p-4 bg-green-900/20 border border-green-800/50 rounded-lg mb-4">
              <div className="flex items-center gap-2 text-green-400 mb-2">
                <Lock className="w-4 h-4" />
                <span className="font-medium">Model from Environment</span>
              </div>
              <p className="text-sm text-zinc-400">
                Using <code className="px-1 py-0.5 bg-zinc-800 rounded text-xs">{import.meta.env.VITE_OPENAI_MODEL}</code>
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 mb-4">
              <label className="text-sm font-medium text-zinc-400">Model</label>
              <select
                value={openaiModel}
                onChange={e => setOpenaiModel(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="gpt-4o-mini">GPT-4o Mini (Fast, Affordable)</option>
                <option value="gpt-4o">GPT-4o (Best Quality)</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Fastest)</option>
              </select>
            </div>
          )}

          {/* Save button (only if not all from env) */}
          {(!openaiKeyFromEnv || !openaiModelFromEnv) && (
            <button
              onClick={saveOpenAI}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-medium"
            >
              Save OpenAI Settings
            </button>
          )}

          <p className="text-xs text-zinc-600 mt-4">
            OpenAI is used for the Prompt Studio feature to enhance your prompts with better descriptions.
          </p>
        </div>
      )}
    </div>
  );
}

export default App;
