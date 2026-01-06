import axios from 'axios';

// API URL - in production this comes from build-time env var
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Important: send cookies with requests
});

// === Leonardo AI API Key ===
export const getApiKey = (): string => {
  const envApiKey = import.meta.env.VITE_LEONARDOAI_API_KEY;
  if (envApiKey) return envApiKey;
  return localStorage.getItem('leonardo_api_key') || '';
};

export const isEnvApiKey = (): boolean => {
  return !!import.meta.env.VITE_LEONARDOAI_API_KEY;
};

// === OpenAI API Key ===
export const getOpenAIKey = (): string => {
  const envKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (envKey) return envKey;
  return localStorage.getItem('openai_api_key') || '';
};

export const isEnvOpenAIKey = (): boolean => {
  return !!import.meta.env.VITE_OPENAI_API_KEY;
};

export const getOpenAIModel = (): string => {
  const envModel = import.meta.env.VITE_OPENAI_MODEL;
  if (envModel) return envModel;
  return localStorage.getItem('openai_model') || 'gpt-4o-mini';
};

export const isEnvOpenAIModel = (): boolean => {
  return !!import.meta.env.VITE_OPENAI_MODEL;
};

// === Authentication ===
export interface AuthStatus {
  authenticated: boolean;
  auth_enabled: boolean;
}

export const checkAuthStatus = async (): Promise<{ authenticated: boolean; authEnabled: boolean }> => {
  try {
    // First check if auth is enabled
    const statusRes = await apiClient.get<AuthStatus>('/auth/status');

    if (!statusRes.data.auth_enabled) {
      return { authenticated: true, authEnabled: false };
    }

    // Auth is enabled, check if we have a valid session
    try {
      await apiClient.get('/auth/check');
      return { authenticated: true, authEnabled: true };
    } catch {
      return { authenticated: false, authEnabled: true };
    }
  } catch (error) {
    // If we can't reach the server, assume not authenticated
    console.error('Auth check failed:', error);
    return { authenticated: false, authEnabled: true };
  }
};

export const login = async (password: string): Promise<boolean> => {
  try {
    await apiClient.post('/auth/login', { password });
    return true;
  } catch {
    return false;
  }
};

export const logout = async (): Promise<void> => {
  try {
    await apiClient.post('/auth/logout');
  } catch {
    // Ignore errors on logout
  }
};
