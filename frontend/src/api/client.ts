import axios from 'axios';

const API_URL = 'http://localhost:8000/api/v1';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
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
