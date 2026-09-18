// ============================================================
// API — camada de acesso a dados do app
// ============================================================
//
// A partir desta versão, quase tudo aqui é LOCAL (IndexedDB no
// próprio dispositivo — ver `localApi.ts`): decks, cards,
// estudo/SRS, editais, registros de estudo, metas, cronômetro,
// stats e busca funcionam sem internet e sem login.
//
// O que continua exigindo o servidor (e, portanto, login):
//   - autenticação e conta (login/registro/2FA/sessões)
//   - Comunidade (depende de outros usuários)
//   - Admin (depende do banco central)
//   - chat com o Theo (IA roda no servidor)
//   - checkout/assinatura
//   - importar/baixar planilha de edital (processada no servidor)
//
// Ver `sync.ts` para como os dados da nuvem entram no app local
// quando o usuário faz login.

import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

import type {
  AuthResponse,
  Requires2FAResponse,
  RegisterResponse,
  UserPublic,
  CommunityListing,
} from "./types";

import * as local from "./localApi";
import { getDeviceId } from "./localdb";
import { getLocalProfile, updateLocalProfile } from "./localApi";

// ============================================================
// CONFIGURAÇÃO DA API
// ============================================================

const API_URL = import.meta.env.VITE_API_URL ?? "https://theo-api.congabrielmelox.workers.dev/api";

const TOKENS_KEY = "theo.tokens";

// ============================================================
// TOKENS
// ============================================================

interface StoredTokens {
  access_token: string;
  refresh_token: string;
}

export function getStoredTokens(): StoredTokens | null {
  const raw = localStorage.getItem(TOKENS_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return null;
  }
}

function setStoredTokens(tokens: StoredTokens | null): void {
  if (tokens) {
    localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  } else {
    localStorage.removeItem(TOKENS_KEY);
  }
}

export function isLoggedIn(): boolean {
  return getStoredTokens() !== null;
}

// ============================================================
// AXIOS
// ============================================================

export const http = axios.create({
  baseURL: API_URL,
  headers: {
    Accept: "application/json",
  },
});

// ============================================================
// REQUEST INTERCEPTOR
// ============================================================

// Anexa o access token em toda requisição, se existir.
http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const tokens = getStoredTokens();

  if (tokens?.access_token) {
    config.headers.Authorization = `Bearer ${tokens.access_token}`;
  }

  return config;
});

// ============================================================
// REFRESH TOKEN
// ============================================================

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const tokens = getStoredTokens();

  if (!tokens?.refresh_token) {
    return null;
  }

  try {
    const { data } = await axios.post<AuthResponse>(`${API_URL}/auth/refresh`, {
      refresh_token: tokens.refresh_token,
    });

    setStoredTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });

    return data.access_token;
  } catch {
    setStoredTokens(null);
    return null;
  }
}

// ============================================================
// RESPONSE INTERCEPTOR
// ============================================================

// Em caso de 401, tenta renovar o token uma única vez
// e refaz a requisição original.
http.interceptors.response.use(
  (response) => response,

  async (error: AxiosError) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;

    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;

      refreshPromise ??= refreshAccessToken().finally(() => {
        refreshPromise = null;
      });

      const newToken = await refreshPromise;

      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return http(original);
      }
    }

    return Promise.reject(error);
  },
);

// ============================================================
// TRATAMENTO DE ERROS
// ============================================================

export function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as
      | {
          message?: string;
          error?: string | { code?: string; message?: string };
          detail?: string;
        }
      | undefined;

    if (body?.error && typeof body.error === "object" && body.error.message) {
      return body.error.message;
    }

    if (body?.message) {
      return body.message;
    }

    if (typeof body?.error === "string") {
      return body.error;
    }

    if (body?.detail) {
      return body.detail;
    }

    if (err.code === "ERR_NETWORK" || !err.response) {
      return "Sem conexão com o servidor. Isso só afeta recursos online (Comunidade, Admin, IA, sincronização).";
    }

    if (err.response?.status === 404) {
      return "O deck ou a pasta selecionada não foi encontrado.";
    }

    if (err.response?.status === 422) {
      return "Não foi possível concluir a operação: verifique os nomes e a hierarquia dos decks.";
    }

    if (err.response?.status === 500) {
      return "O servidor retornou um erro interno. Verifique se o backend está respondendo corretamente.";
    }

    if (err.message) {
      return err.message;
    }
  }

  if (err instanceof Error) {
    return err.message;
  }

  return "Algo deu errado. Tente novamente.";
}

// ============================================================
// DADOS LOCAIS (OFFLINE)
// ============================================================

// Decks
export const listDeckChildren = local.listDeckChildren;
export const listFolders = local.listFolders;
export const createFolder = local.createFolder;
export const updateFolder = local.updateFolder;
export const deleteFolder = local.deleteFolder;
export const reorderFolders = local.reorderFolders;

export const listDecks = local.listDecks;
export const getDeck = local.getDeck;
export const createDeck = local.createDeck;
export const updateDeck = local.updateDeck;
export const moveDeck = local.moveDeck;
export const deleteDeck = local.deleteDeck;
export const listDeckTemplates = local.listDeckTemplates;
export const copyDeck = local.copyDeck;
export const bulkMoveDecks = local.bulkMoveDecks;
export const reorderDecks = local.reorderDecks;
export const bulkDeleteDecks = local.bulkDeleteDecks;

// Notes / Cards
export const listNoteTypes = local.listNoteTypes;
export const createNoteType = local.createNoteType;
export const ensureNoteType = local.ensureNoteType;

export type CardType = local.CardType;

export const createNote = local.createNote;
export const listCards = local.listCards;
export const deleteCard = local.deleteCard;
export const reorderCards = local.reorderCards;
export const moveCard = local.moveCard;

// SRS / estudo
export const getQueue = local.getQueue;
export const submitReview = local.submitReview;
export const getStatsOverview = local.getStatsOverview;
export const getHeatmap = local.getHeatmap;
export const getStudyHours = local.getStudyHours;
export const getWeekday = local.getWeekday;
export const getReviewTime = local.getReviewTime;
export const getAnswers = local.getAnswers;
export const getActivity = local.getActivity;
export const getSummary = local.getSummary;

// Busca
export const searchPlatform = local.searchPlatform;

export type GlobalSearchResultType = local.GlobalSearchResultType;

export type GlobalSearchResult = local.GlobalSearchResult;

export type GlobalSearchResponse = local.GlobalSearchResponse;

// ============================================================
// EDITAIS / PROVAS
// ============================================================

export const listExams = local.listExams;
export const getExam = local.getExam;
export const createExam = local.createExam;
export const updateExam = local.updateExam;
export const deleteExam = local.deleteExam;

export const listExamSubjects = local.listExamSubjects;
export const createExamSubject = local.createExamSubject;
export const updateExamSubject = local.updateExamSubject;
export const deleteExamSubject = local.deleteExamSubject;

export const listExamTopics = local.listExamTopics;
export const createExamTopic = local.createExamTopic;
export const updateExamTopic = local.updateExamTopic;
export const deleteExamTopic = local.deleteExamTopic;

export const getTopicsWithMarkers = local.getTopicsWithMarkers;
export const getExamStats = local.getExamStats;

// ============================================================
// REGISTROS DE ESTUDO
// ============================================================

export const createStudyLog = local.createStudyLog;
export const listStudyLogs = local.listStudyLogs;
export const getDueReviews = local.getDueReviews;
export const skipReview = local.skipReview;

// ============================================================
// CRONOGRAMA
// ============================================================

export const generateDeadlineSchedule = local.generateDeadlineSchedule;

export const getContinuousSchedule = local.getContinuousSchedule;

export const listManualSchedule = local.listManualSchedule;

export const createManualScheduleEntry = local.createManualScheduleEntry;

export const getScheduleCheck = local.getScheduleCheck;

// ============================================================
// METAS
// ============================================================

export const listGoals = local.listGoals;
export const createGoal = local.createGoal;
export const deleteGoal = local.deleteGoal;

// ============================================================
// CRONÔMETRO
// ============================================================

export const getCurrentTimer = local.getCurrentTimer;
export const startTimer = local.startTimer;
export const pauseTimer = local.pauseTimer;
export const resumeTimer = local.resumeTimer;
export const finishTimer = local.finishTimer;
export const cancelTimer = local.cancelTimer;

// ============================================================
// DASHBOARD
// ============================================================

export const getDashboardSummary = local.getDashboardSummary;

// ============================================================
// CONFIGURAÇÕES SRS
// ============================================================

export const getSrsSettings = local.getSrsSettings;

export const updateSrsSettings = local.updateSrsSettings;

export type SrsAlgorithm = local.SrsAlgorithm;

export type SrsSettings = local.SrsSettings;

// ============================================================
// IMPORTAÇÃO / EXPORTAÇÃO DE PLANILHA
// ============================================================

export async function importExamXlsx(file: File) {
  const form = new FormData();

  form.append("file", file);

  const { data } = await http.post("/exams/import-xlsx", form, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return data;
}

export function examTemplateXlsxUrl(): string {
  return `${API_URL}/exams/template.xlsx`;
}

// ============================================================
// AUTENTICAÇÃO / CONTA
// ============================================================

export async function register(payload: {
  first_name: string;
  last_name: string;
  email: string;
  cpf: string;
  country: string;
  city: string;
  password: string;
}): Promise<RegisterResponse> {
  const { data } = await http.post<RegisterResponse>("/auth/register", payload);

  return data;
}

export async function login(payload: {
  email: string;
  password: string;
}): Promise<AuthResponse | Requires2FAResponse> {
  const deviceId = await getDeviceId();

  const { data } = await http.post<AuthResponse | Requires2FAResponse>("/auth/login", {
    ...payload,
    device_id: deviceId,
    device_label: "Theo Desktop",
  });

  if (!("requires_2fa" in data)) {
    setStoredTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
  }

  return data;
}

export async function verifyTwoFactor(challengeToken: string, code: string): Promise<AuthResponse> {
  const deviceId = await getDeviceId();

  const { data } = await http.post<AuthResponse>("/auth/2fa/verify", {
    challenge_token: challengeToken,
    code,
    device_id: deviceId,
    device_label: "Theo Desktop",
  });

  setStoredTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });

  return data;
}

export async function logout(): Promise<void> {
  const tokens = getStoredTokens();

  if (tokens?.refresh_token) {
    try {
      await http.post("/auth/logout", {
        refresh_token: tokens.refresh_token,
      });
    } catch {
      // Mesmo se a chamada falhar, limpamos localmente.
    }
  }

  setStoredTokens(null);
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await http.post("/auth/change-password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

// ============================================================
// PERFIL
// ============================================================

export async function updateMe(payload: {
  first_name?: string;
  last_name?: string;
  display_name?: string;
  username?: string;
  gender?: string;
  instagram?: string;
  bio?: string;
}): Promise<UserPublic> {
  if (!isLoggedIn()) {
    return updateLocalProfile(payload);
  }

  const { data } = await http.put<UserPublic>("/users/me", payload);

  return data;
}

export async function fetchMe(): Promise<UserPublic> {
  if (!isLoggedIn()) {
    return getLocalProfile();
  }

  const { data } = await http.get<UserPublic>("/users/me");

  return data;
}

// ============================================================
// SESSÕES
// ============================================================

export interface SessionInfo {
  id: string;
  device_label: string | null;
  user_agent: string | null;
  ip_address: string | null;
  last_used_at: string;
  expires_at: string;
}

export async function listSessions(): Promise<SessionInfo[]> {
  const { data } = await http.get<SessionInfo[]>("/auth/sessions");

  return data;
}

export async function revokeSession(id: string): Promise<void> {
  await http.delete(`/auth/sessions/${id}`);
}

// ============================================================
// 2FA
// ============================================================

export async function setup2FA(): Promise<{
  secret: string;
  otpauth_uri: string;
}> {
  const { data } = await http.post("/auth/2fa/setup");

  return data;
}

export async function enable2FA(code: string): Promise<void> {
  await http.post("/auth/2fa/enable", {
    code,
  });
}

export async function disable2FA(code: string): Promise<void> {
  await http.post("/auth/2fa/disable", {
    code,
  });
}

// ============================================================
// COMUNIDADE
// ============================================================

export async function searchCommunityListings(query?: string): Promise<CommunityListing[]> {
  const { data } = await http.get<{
    listings: CommunityListing[];
  }>("/community/listings", {
    params: {
      q: query,
    },
  });

  return data.listings;
}

export async function publishDeckToCommunity(payload: {
  deck_id: string;
  title: string;
  description?: string;
  category?: string;
}): Promise<{ listing_id: string }> {
  const { data } = await http.post("/community/listings", payload);

  return data;
}

export async function downloadCommunityListing(listingId: string): Promise<{ deck_id: string }> {
  const { data } = await http.post(`/community/listings/${listingId}/download`);

  return data;
}

export async function rateCommunityListing(
  listingId: string,
  stars: number,
  comment?: string,
): Promise<{
  rating_avg: number;
  rating_count: number;
}> {
  const { data } = await http.post(`/community/listings/${listingId}/rate`, {
    stars,
    comment,
  });

  return data;
}

// ============================================================
// ADMIN
// ============================================================

export async function adminListUsers(): Promise<import("./types").AdminUserRow[]> {
  const { data } = await http.get("/admin/users");

  return data;
}

export async function adminSetUserRole(userId: string, role: string): Promise<void> {
  await http.patch(`/admin/users/${userId}/role`, {
    role,
  });
}

export async function adminSetDeckTemplate(deckId: string, isTemplate: boolean) {
  const { data } = await http.patch(`/admin/decks/${deckId}/template`, {
    is_template: isTemplate,
  });

  return data;
}

export async function adminPlatformStats(): Promise<{
  total_users: number;
  total_decks: number;
  total_template_decks: number;
  total_cards: number;
  total_exams: number;
}> {
  const { data } = await http.get("/admin/stats");

  return data;
}

export async function adminListAllDecks() {
  const { data } = await http.get("/admin/decks");

  return data;
}

export async function adminCreateNativeDeck(payload: {
  name: string;
  description?: string;
  card_type?: string;
  difficulty?: string;
  color?: string;
}) {
  const { data } = await http.post("/admin/decks", payload);

  return data;
}

export async function adminDeleteDeck(deckId: string): Promise<void> {
  await http.delete(`/admin/decks/${deckId}`);
}

// ============================================================
// IA — THEO
// ============================================================

export interface TheoChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TheoChatRequest {
  message: string;
  conversation?: TheoChatMessage[];
  source_ids?: string[];
  stats?: unknown;
  summary?: unknown;
}

export interface TheoChatResponse {
  message: string;
  conversation_id?: string | null;
}

export async function chatWithTheo(payload: TheoChatRequest): Promise<TheoChatResponse> {
  const { data } = await http.post<TheoChatResponse>("/ai/chat", payload);

  return data;
}

// ============================================================
// ASSINATURA / CHECKOUT
// ============================================================

export interface CheckoutResponse {
  checkout_url: string;
}

export async function createCheckout(planId: string): Promise<CheckoutResponse> {
  const { data } = await http.post<CheckoutResponse>("/billing/checkout", {
    plan_id: planId,
  });

  return data;
}
