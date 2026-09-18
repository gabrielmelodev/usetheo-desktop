// ============================================================
// API LOCAL — o app funciona 100% aqui, sem internet e sem login.
// ============================================================
//
// Este arquivo reimplementa, no dispositivo, a mesma lógica que
// hoje mora no backend Rust (theo-rust/src/routes/*), para que
// Decks, Study, Editais, Stats e Conta funcionem offline.
//
// Login só é necessário para SINCRONIZAR (puxar/mandar dados da
// nuvem) — ver `sync.ts`. Comunidade e Admin continuam exigindo
// conta, porque dependem de outros usuários / do servidor.

import {
  dbGetAll,
  dbGet,
  dbPut,
  dbPutMany,
  dbDelete,
  metaGet,
  metaSet,
  newId,
  nowIso,
  queueDeletion,
} from "./localdb";
import { applyReview, buildFirstLadderStep, buildNextLadderStep } from "./srsEngine";
import { scheduleFsrs, type FsrsCardState } from "./fsrs";
import type {
  ActiveTimer,
  CardResponse,
  ContinuousCycleItem,
  ContinuousWeeklyDay,
  DashboardSummary,
  Deck,
  DueReview,
  Exam,
  ExamStats,
  ExamSubject,
  ExamTopic,
  Folder,
  Goal,
  GoalMetric,
  GoalPeriod,
  ManualScheduleEntry,
  NoteType,
  PlanMode,
  QueueResponse,
  Rating,
  StatsOverview,
  StudyLog,
  SubmitReviewResponse,
  TopicMarker,
  UserPublic,
} from "./types";

// ---------------- tipos internos (não expostos em types.ts) ----------------

interface LocalNote {
  id: string;
  deck_id: string;
  note_type_id: string;
  fields: Record<string, string>;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface LocalCard {
  id: string;
  note_id: string;
  deck_id: string;
  parent_card_id: string | null;
  position: number;
  template_index: number;
  cloze_index: number | null;
  queue: "new" | "learning" | "review" | "suspended" | "buried";
  due: string;
  interval_days: number;
  ease_factor: number;
  repetitions: number;
  lapses: number;
  // Campos usados apenas quando o algoritmo é FSRS (ver `fsrs.ts`).
  // Em cartões antigos / criados antes do FSRS, ficam undefined — nesse
  // caso o cartão é tratado como "novo" na primeira revisão em FSRS.
  stability?: number;
  difficulty?: number;
  last_review?: string | null;
  updated_at: string;
}

interface ReviewLogEntry {
  id: string;
  card_id: string;
  rating: Rating;
  reviewed_at: string;
}

interface LocalTopicReview {
  id: string;
  topic_id: string;
  study_log_id: string;
  step: number;
  scheduled_date: string;
  completed_at: string | null;
  completed_study_log_id: string | null;
  skipped: boolean;
}

// ---------------- perfil local (modo convidado) ----------------

const GUEST_PROFILE_KEY = "guest_profile";

export async function getLocalProfile(): Promise<UserPublic> {
  const existing = await metaGet<UserPublic>(GUEST_PROFILE_KEY);
  if (existing) return existing;

  const guest: UserPublic = {
    id: "local",
    first_name: "Você",
    last_name: "",
    email: "",
    city: "",
    country: "",
    email_verified: false,
    totp_enabled: false,
    role: "user",
  };
  await metaSet(GUEST_PROFILE_KEY, guest);
  return guest;
}

export async function updateLocalProfile(patch: Partial<UserPublic>): Promise<UserPublic> {
  const current = await getLocalProfile();
  const next = { ...current, ...patch };
  await metaSet(GUEST_PROFILE_KEY, next);
  return next;
}

// ---------------- configurações de repetição espaçada ----------------

export type SrsAlgorithm = "sm2" | "fsrs";

export interface SrsSettings {
  algorithm: SrsAlgorithm;
  /** Só usado no FSRS. 0.9 = 90% de chance de lembrar no dia do próximo intervalo. */
  desired_retention: number;
}

const SRS_SETTINGS_KEY = "srs_settings";
const DEFAULT_SRS_SETTINGS: SrsSettings = { algorithm: "fsrs", desired_retention: 0.9 };

export async function getSrsSettings(): Promise<SrsSettings> {
  const existing = await metaGet<SrsSettings>(SRS_SETTINGS_KEY);
  return existing ?? DEFAULT_SRS_SETTINGS;
}

export async function updateSrsSettings(patch: Partial<SrsSettings>): Promise<SrsSettings> {
  const current = await getSrsSettings();
  const next = { ...current, ...patch };
  await metaSet(SRS_SETTINGS_KEY, next);
  return next;
}

// ============================================================
// FOLDERS
// ============================================================

export async function listFolders(): Promise<Folder[]> {
  const rows = await dbGetAll<Folder>("folders");
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createFolder(payload: { name: string }): Promise<Folder> {
  const now = nowIso();
  const folder: Folder = {
    id: newId(),
    user_id: "local",
    parent_folder_id: null,
    name: payload.name,
    created_at: now,
    updated_at: now,
  };
  return dbPut("folders", folder);
}

export async function updateFolder(id: string, payload: { name: string }): Promise<Folder> {
  const existing = await dbGet<Folder>("folders", id);
  if (!existing) throw new Error("Pasta não encontrada.");
  const updated = { ...existing, name: payload.name, updated_at: nowIso() };
  return dbPut("folders", updated);
}

export async function deleteFolder(id: string): Promise<void> {
  const decks = await dbGetAll<Deck>("decks");
  for (const deck of decks) {
    if (deck.folder_id === id) {
      await dbPut("decks", { ...deck, folder_id: null, updated_at: nowIso() });
    }
  }
  await dbDelete("folders", id);
  await queueDeletion("folder", id);
}

export async function reorderFolders(_orderedIds: string[]): Promise<void> {
  // Pastas são ordenadas por nome localmente; não há posição persistida.
}

// ============================================================
// DECKS
// ============================================================

async function computeDeckCounts(deckId: string): Promise<{ total: number; due: number }> {
  const cards = await dbGetAll<LocalCard>("cards");
  const nowMs = Date.now();
  let total = 0;
  let due = 0;
  for (const c of cards) {
    if (c.deck_id !== deckId) continue;
    total++;
    if (new Date(c.due).getTime() <= nowMs) due++;
  }
  return { total, due };
}

async function hydrateDeck(deck: Deck): Promise<Deck> {
  const { total, due } = await computeDeckCounts(deck.id);
  return { ...deck, total_cards: total, due_cards: due };
}

export async function listDecks(): Promise<Deck[]> {
  const rows = await dbGetAll<Deck>("decks");
  const hydrated = await Promise.all(rows.map(hydrateDeck));
  return hydrated.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

export async function getDeck(id: string): Promise<Deck> {
  const deck = await dbGet<Deck>("decks", id);
  if (!deck) throw new Error("Deck não encontrado.");
  return hydrateDeck(deck);
}

export async function listDeckChildren(parentDeckId: string): Promise<Deck[]> {
  const all = await listDecks();
  return all.filter((d) => d.parent_deck_id === parentDeckId);
}

export async function createDeck(payload: {
  name: string;
  description?: string;
  is_public?: boolean;
  folder_id?: string | null;
  parent_deck_id?: string | null;
  target_cards?: number;
  color?: string;
}): Promise<Deck> {
  const now = nowIso();

  const all = await dbGetAll<Deck>("decks");

  const deck: Deck = {
    id: newId(),
    user_id: "local",

    name: payload.name,
    description: payload.description ?? null,

    folder_id: payload.folder_id ?? null,
    parent_deck_id: payload.parent_deck_id ?? null,

    support_text: null,
    about: null,

    // Agora utiliza o valor informado na criação
    target_cards: payload.target_cards ?? 0,

    card_type: "basic",
    difficulty: "medio",

    // Agora utiliza a cor escolhida na criação
    color: payload.color ?? "#556B2F",

    icon: null,

    due_cards: 0,
    show_review_queue: true,
    allow_subdecks: true,

    is_public: payload.is_public ?? false,
    is_template: false,

    position: all.length,

    copied_from_deck_id: null,

    total_cards: 0,

    created_at: now,
    updated_at: now,

    anki_name: null,
    imported_from_anki: false,

    review_cards_per_day: undefined,
  };

  await dbPut("decks", deck);

  return deck;
}

export async function updateDeck(
  id: string,
  payload: Partial<{ name: string; description: string; is_public: boolean }>,
): Promise<Deck> {
  const existing = await dbGet<Deck>("decks", id);
  if (!existing) throw new Error("Deck não encontrado.");
  const updated = { ...existing, ...payload, updated_at: nowIso() };
  await dbPut("decks", updated);
  return hydrateDeck(updated);
}

export async function moveDeck(
  id: string,
  payload: { folder_id?: string | null; parent_deck_id?: string | null },
): Promise<Deck> {
  const existing = await dbGet<Deck>("decks", id);
  if (!existing) throw new Error("Deck não encontrado.");
  const updated: Deck = {
    ...existing,
    folder_id: payload.folder_id !== undefined ? payload.folder_id : existing.folder_id,
    parent_deck_id:
      payload.parent_deck_id !== undefined ? payload.parent_deck_id : existing.parent_deck_id,
    updated_at: nowIso(),
  };
  await dbPut("decks", updated);
  return hydrateDeck(updated);
}

export async function deleteDeck(id: string): Promise<void> {
  const [notes, cards, decks] = await Promise.all([
    dbGetAll<LocalNote>("notes"),
    dbGetAll<LocalCard>("cards"),
    dbGetAll<Deck>("decks"),
  ]);
  for (const c of cards) {
    if (c.deck_id === id) {
      await dbDelete("cards", c.id);
      await queueDeletion("card", c.id);
    }
  }
  for (const n of notes) {
    if (n.deck_id === id) {
      await dbDelete("notes", n.id);
      await queueDeletion("note", n.id);
    }
  }
  for (const d of decks) if (d.parent_deck_id === id) await deleteDeck(d.id);
  await dbDelete("decks", id);
  await queueDeletion("deck", id);
}

export async function listDeckTemplates(): Promise<Deck[]> {
  // Modelos "oficiais" vêm do servidor (curados pela equipe/admin); offline não há nenhum.
  return [];
}

export async function copyDeck(deckId: string): Promise<Deck> {
  const source = await getDeck(deckId);
  const copy = await createDeck({
    name: `${source.name} (cópia)`,
    description: source.description ?? undefined,
    folder_id: source.folder_id,
  });

  const [notes, cards] = await Promise.all([
    dbGetAll<LocalNote>("notes"),
    dbGetAll<LocalCard>("cards"),
  ]);
  const idMap = new Map<string, string>();

  for (const note of notes.filter((n) => n.deck_id === deckId)) {
    const newNoteId = newId();
    idMap.set(note.id, newNoteId);
    const now = nowIso();
    await dbPut("notes", {
      ...note,
      id: newNoteId,
      deck_id: copy.id,
      created_at: now,
      updated_at: now,
    });
  }

  for (const card of cards.filter((c) => c.deck_id === deckId)) {
    const mappedNoteId = idMap.get(card.note_id);
    if (!mappedNoteId) continue;
    await dbPut("cards", {
      ...card,
      id: newId(),
      note_id: mappedNoteId,
      deck_id: copy.id,
      parent_card_id: null,
      queue: "new",
      due: nowIso(),
      interval_days: 0,
      ease_factor: 2.5,
      repetitions: 0,
      lapses: 0,
      updated_at: nowIso(),
    });
  }

  return getDeck(copy.id);
}

export async function bulkMoveDecks(deckIds: string[], folderId: string | null): Promise<void> {
  for (const id of deckIds) await moveDeck(id, { folder_id: folderId });
}

export async function reorderDecks(orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    const deck = await dbGet<Deck>("decks", orderedIds[i]);
    if (deck) await dbPut("decks", { ...deck, position: i, updated_at: nowIso() });
  }
}

export async function bulkDeleteDecks(deckIds: string[]): Promise<void> {
  for (const id of deckIds) await deleteDeck(id);
}

// ============================================================
// NOTE TYPES
// ============================================================

export type CardType = "basic" | "cloze" | "multiple_choice" | "true_false";

export async function listNoteTypes(): Promise<NoteType[]> {
  return dbGetAll<NoteType>("note_types");
}

interface StoredTemplate {
  name: string;
  front_template: string;
  back_template: string;
}

interface StoredNoteType extends NoteType {
  templates: StoredTemplate[];
}

export async function createNoteType(payload: {
  name: string;
  fields: string[];
  templates: StoredTemplate[];
  is_cloze?: boolean;
}): Promise<{ id: string }> {
  const now = nowIso();
  const noteType: StoredNoteType = {
    id: newId(),
    owner_id: "local",
    name: payload.name,
    fields_json: JSON.stringify(payload.fields),
    created_at: now,
    updated_at: now,
    is_cloze: payload.is_cloze ?? false,
    templates: payload.templates,
  };
  await dbPut("note_types", noteType);
  return { id: noteType.id };
}

const NOTE_TYPE_CONFIGS: Record<
  CardType,
  { name: string; fields: string[]; template: StoredTemplate }
> = {
  basic: {
    name: "Básico",
    fields: ["Front", "Back"],
    template: { name: "Card 1", front_template: "{{Front}}", back_template: "{{Back}}" },
  },
  cloze: {
    name: "Omissão",
    fields: ["Text"],
    template: { name: "Card 1", front_template: "{{Text}}", back_template: "{{Text}}" },
  },
  multiple_choice: {
    name: "Múltipla Escolha",
    fields: ["Question", "Options", "Answer"],
    template: { name: "Card 1", front_template: "{{Question}}", back_template: "{{Answer}}" },
  },
  true_false: {
    name: "Verdadeiro/Falso",
    fields: ["Question", "Answer"],
    template: { name: "Card 1", front_template: "{{Question}}", back_template: "{{Answer}}" },
  },
};

export async function ensureNoteType(cardType: CardType): Promise<string> {
  const types = await listNoteTypes();
  const config = NOTE_TYPE_CONFIGS[cardType];
  const existing = types.find((t) => t.name === config.name);
  if (existing) return existing.id;

  const created = await createNoteType({
    name: config.name,
    fields: config.fields,
    templates: [config.template],
    is_cloze: cardType === "cloze",
  });
  return created.id;
}

// ============================================================
// NOTES / CARDS
// ============================================================

function renderTemplate(template: string, fields: Record<string, string>): string {
  return template.replace(/\{\{(.*?)\}\}/g, (_match, key: string) => fields[key.trim()] ?? "");
}

export async function createNote(payload: {
  deck_id: string;
  note_type_id: string;
  fields: Record<string, string>;
  tags?: string[];
}): Promise<{ note_id: string; card_ids: string[] }> {
  const now = nowIso();
  const note: LocalNote = {
    id: newId(),
    deck_id: payload.deck_id,
    note_type_id: payload.note_type_id,
    fields: payload.fields,
    tags: payload.tags ?? [],
    created_at: now,
    updated_at: now,
  };
  await dbPut("notes", note);

  const noteType = await dbGet<StoredNoteType>("note_types", payload.note_type_id);
  const templates = noteType?.templates ?? [];
  const cardIds: string[] = [];

  const templateCount = templates.length || 1;
  for (let idx = 0; idx < templateCount; idx++) {
    const card: LocalCard = {
      id: newId(),
      note_id: note.id,
      deck_id: payload.deck_id,
      parent_card_id: null,
      position: idx,
      template_index: idx,
      cloze_index: null,
      queue: "new",
      due: now,
      interval_days: 0,
      ease_factor: 2.5,
      repetitions: 0,
      lapses: 0,
      updated_at: now,
    };
    await dbPut("cards", card);
    cardIds.push(card.id);
  }

  return { note_id: note.id, card_ids: cardIds };
}

async function renderCard(card: LocalCard): Promise<CardResponse> {
  const note = await dbGet<LocalNote>("notes", card.note_id);
  const noteType = note ? await dbGet<StoredNoteType>("note_types", note.note_type_id) : undefined;
  const template = noteType?.templates?.[card.template_index];

  const front = template && note ? renderTemplate(template.front_template, note.fields) : "";
  const back = template && note ? renderTemplate(template.back_template, note.fields) : "";

  return {
    id: card.id,
    note_id: card.note_id,
    deck_id: card.deck_id,
    parent_card_id: card.parent_card_id,
    position: card.position,
    cloze_index: card.cloze_index,
    queue: card.queue,
    due: card.due,
    interval_days: card.interval_days,
    ease_factor: card.ease_factor,
    repetitions: card.repetitions,
    lapses: card.lapses,
    front,
    back,
  };
}

export async function listCards(deckId?: string): Promise<CardResponse[]> {
  const all = await dbGetAll<LocalCard>("cards");
  const filtered = deckId ? all.filter((c) => c.deck_id === deckId) : all;
  return Promise.all(filtered.map(renderCard));
}

export async function deleteCard(cardId: string): Promise<void> {
  await dbDelete("cards", cardId);
  await queueDeletion("card", cardId);
}

export async function reorderCards(orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    const card = await dbGet<LocalCard>("cards", orderedIds[i]);
    if (card) await dbPut("cards", { ...card, position: i, updated_at: nowIso() });
  }
}

export async function moveCard(cardId: string, parentCardId: string | null): Promise<void> {
  const card = await dbGet<LocalCard>("cards", cardId);
  if (!card) return;
  await dbPut("cards", { ...card, parent_card_id: parentCardId, updated_at: nowIso() });
}

// ============================================================
// REVIEWS (SRS)
// ============================================================

export async function getQueue(deckId?: string, limit = 50): Promise<QueueResponse> {
  const all = await dbGetAll<LocalCard>("cards");
  const nowMs = Date.now();
  const clampedLimit = Math.min(Math.max(limit, 1), 200);

  const due = all
    .filter((c) => (!deckId || c.deck_id === deckId) && new Date(c.due).getTime() <= nowMs)
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())
    .slice(0, clampedLimit);

  const cards = await Promise.all(due.map(renderCard));
  return { cards, count: cards.length };
}

export async function submitReview(
  cardId: string,
  rating: Rating,
  _timeTakenMs: number,
): Promise<SubmitReviewResponse> {
  const card = await dbGet<LocalCard>("cards", cardId);
  if (!card) throw new Error("Card não encontrado.");

  const settings = await getSrsSettings();
  const now = new Date();

  let updatedCard: LocalCard;
  let response: SubmitReviewResponse;

  if (settings.algorithm === "fsrs") {
    const state: FsrsCardState = {
      stability: card.stability ?? 0,
      difficulty: card.difficulty ?? 0,
      last_review: card.last_review ?? null,
    };
    const result = scheduleFsrs(state, rating, now, settings.desired_retention);
    const due = new Date(now.getTime() + result.interval_days * 86400 * 1000).toISOString();
    const queue = rating === "again" ? "learning" : "review";

    updatedCard = {
      ...card,
      queue,
      due,
      interval_days: result.interval_days,
      stability: result.stability,
      difficulty: result.difficulty,
      last_review: result.last_review,
      repetitions: rating === "again" ? card.repetitions : card.repetitions + 1,
      lapses: rating === "again" ? card.lapses + 1 : card.lapses,
      updated_at: now.toISOString(),
    };
    response = {
      card_id: cardId,
      queue,
      due,
      interval_days: result.interval_days,
      ease_factor: card.ease_factor, // mantido só por compatibilidade com quem lê esse campo
    };
  } else {
    const result = applyReview(
      rating,
      card.interval_days,
      card.ease_factor,
      card.repetitions,
      card.lapses,
    );
    const due = new Date(now.getTime() + result.interval_days * 86400 * 1000).toISOString();

    updatedCard = {
      ...card,
      queue: result.queue,
      due,
      interval_days: result.interval_days,
      ease_factor: result.ease_factor,
      repetitions: result.repetitions,
      lapses: result.lapses,
      updated_at: now.toISOString(),
    };
    response = {
      card_id: cardId,
      queue: result.queue,
      due,
      interval_days: result.interval_days,
      ease_factor: result.ease_factor,
    };
  }

  await dbPut("cards", updatedCard);
  await dbPut("review_log", {
    id: newId(),
    card_id: cardId,
    rating,
    reviewed_at: nowIso(),
  } satisfies ReviewLogEntry);

  return response;
}

// ============================================================
// STATS
// ============================================================

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

export async function getStatsOverview(): Promise<StatsOverview> {
  const [cards, reviewLog] = await Promise.all([
    dbGetAll<LocalCard>("cards"),
    dbGetAll<ReviewLogEntry>("review_log"),
  ]);

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400 * 1000);

  const reviewsToday = reviewLog.filter((r) => isSameDay(new Date(r.reviewed_at), now)).length;
  const reviewsLast7Days = reviewLog.filter((r) => new Date(r.reviewed_at) >= sevenDaysAgo).length;

  // sequência: dias consecutivos (até hoje) com pelo menos uma revisão
  const reviewDays = new Set(reviewLog.map((r) => new Date(r.reviewed_at).toDateString()));
  let streak = 0;
  const cursor = new Date(now);
  while (reviewDays.has(cursor.toDateString())) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const lastReviews = [...reviewLog]
    .sort((a, b) => new Date(b.reviewed_at).getTime() - new Date(a.reviewed_at).getTime())
    .slice(0, 200);
  const retention =
    lastReviews.length > 0
      ? (lastReviews.filter((r) => r.rating !== "again").length / lastReviews.length) * 100
      : 0;

  return {
    total_cards: cards.length,
    new_cards: cards.filter((c) => c.queue === "new").length,
    learning_cards: cards.filter((c) => c.queue === "learning").length,
    review_cards: cards.filter((c) => c.queue === "review").length,
    reviews_today: reviewsToday,
    reviews_last_7_days: reviewsLast7Days,
    current_streak_days: streak,
    retention_rate_pct: Math.round(retention * 10) / 10,
  };
}

export async function getHeatmap() {
  const reviewLog = await dbGetAll<ReviewLogEntry>("review_log");
  const counts = new Map<string, number>();
  for (const r of reviewLog) {
    const day = r.reviewed_at.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getStudyHours() {
  const reviewLog = await dbGetAll<ReviewLogEntry>("review_log");
  const byHour = new Map<number, number>();
  for (const r of reviewLog) {
    const h = new Date(r.reviewed_at).getHours();
    byHour.set(h, (byHour.get(h) ?? 0) + 1);
  }
  return Array.from(byHour.entries()).map(([hour, reviews]) => ({ hour, reviews }));
}

const WEEKDAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export async function getWeekday() {
  const reviewLog = await dbGetAll<ReviewLogEntry>("review_log");
  const byDay = new Map<number, number>();
  for (const r of reviewLog) {
    const d = new Date(r.reviewed_at).getDay();
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  return WEEKDAY_NAMES.map((day, idx) => ({ day, reviews: byDay.get(idx) ?? 0 }));
}

export async function getReviewTime() {
  return { seconds: 0 };
}

export async function getAnswers() {
  const reviewLog = await dbGetAll<ReviewLogEntry>("review_log");
  return {
    again: reviewLog.filter((r) => r.rating === "again").length,
    hard: reviewLog.filter((r) => r.rating === "hard").length,
    good: reviewLog.filter((r) => r.rating === "good").length,
    easy: reviewLog.filter((r) => r.rating === "easy").length,
  };
}

export async function getActivity() {
  const [reviewLog, logs] = await Promise.all([
    dbGetAll<ReviewLogEntry>("review_log"),
    dbGetAll<StudyLog>("study_logs"),
  ]);
  const byDay = new Map<string, { cards: number; minutes: number }>();
  for (const r of reviewLog) {
    const day = r.reviewed_at.slice(0, 10);
    const entry = byDay.get(day) ?? { cards: 0, minutes: 0 };
    entry.cards++;
    byDay.set(day, entry);
  }
  for (const l of logs) {
    const entry = byDay.get(l.studied_on) ?? { cards: 0, minutes: 0 };
    entry.minutes += l.minutes;
    byDay.set(l.studied_on, entry);
  }
  return Array.from(byDay.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getSummary() {
  const logs = await dbGetAll<StudyLog>("study_logs");
  const reviewLog = await dbGetAll<ReviewLogEntry>("review_log");
  const totalMinutes = logs.reduce((sum, l) => sum + l.minutes, 0);
  const studyDays = new Set(logs.map((l) => l.studied_on)).size;
  return {
    cards_reviewed: reviewLog.length,
    total_minutes: totalMinutes,
    average_daily_minutes: studyDays > 0 ? Math.round(totalMinutes / studyDays) : 0,
    study_days: studyDays,
  };
}

// ============================================================
// BUSCA GLOBAL (local)
// ============================================================

export type GlobalSearchResultType =
  | "exam"
  | "subject"
  | "topic"
  | "deck"
  | "card"
  | "folder"
  | "community";

export interface GlobalSearchResult {
  id: string;
  type: GlobalSearchResultType;
  title: string;
  description?: string | null;
  route: string;
}

export interface GlobalSearchResponse {
  results: GlobalSearchResult[];
  total: number;
}

export async function searchPlatform(query: string): Promise<GlobalSearchResponse> {
  const q = query.trim().toLowerCase();
  if (!q) return { results: [], total: 0 };

  const [decks, folders, exams, topics] = await Promise.all([
    dbGetAll<Deck>("decks"),
    dbGetAll<Folder>("folders"),
    dbGetAll<Exam>("exams"),
    dbGetAll<ExamTopic>("exam_topics"),
  ]);

  const results: GlobalSearchResult[] = [];

  for (const d of decks) {
    if (d.name.toLowerCase().includes(q)) {
      results.push({
        id: d.id,
        type: "deck",
        title: d.name,
        description: d.description,
        route: `/decks/${d.id}`,
      });
    }
  }
  for (const f of folders) {
    if (f.name.toLowerCase().includes(q)) {
      results.push({ id: f.id, type: "folder", title: f.name, route: "/decks" });
    }
  }
  for (const e of exams) {
    if (e.name.toLowerCase().includes(q)) {
      results.push({
        id: e.id,
        type: "exam",
        title: e.name,
        description: e.banca,
        route: `/editais/${e.id}`,
      });
    }
  }
  for (const t of topics) {
    if (t.title.toLowerCase().includes(q) || t.number.toLowerCase().includes(q)) {
      results.push({
        id: t.id,
        type: "topic",
        title: `${t.number} — ${t.title}`,
        route: `/editais/${t.exam_id}`,
      });
    }
  }

  return { results: results.slice(0, 30), total: results.length };
}

// ============================================================
// EXAMES / EDITAIS
// ============================================================

export async function listExams(): Promise<Exam[]> {
  return dbGetAll<Exam>("exams");
}

export async function getExam(id: string): Promise<Exam> {
  const exam = await dbGet<Exam>("exams", id);
  if (!exam) throw new Error("Edital não encontrado.");
  return exam;
}

export async function createExam(payload: {
  name: string;
  banca?: string;
  plan_mode: PlanMode;
  exam_date?: string;
  sprint_days?: number;
  weekly_hours?: number;
  continuous_mode?: "semanal" | "ciclo";
  max_session_minutes?: number;
  review_intervals_days?: number[];
  excluded_weekdays?: number[];
}): Promise<Exam> {
  const now = nowIso();
  const exam: Exam = {
    id: newId(),
    user_id: "local",
    name: payload.name,
    banca: payload.banca ?? null,
    plan_mode: payload.plan_mode,
    exam_date: payload.exam_date ?? null,
    sprint_days: payload.sprint_days ?? null,
    weekly_hours: payload.weekly_hours ?? null,
    continuous_mode: payload.continuous_mode ?? null,
    max_session_minutes: payload.max_session_minutes ?? null,
    review_intervals_days: payload.review_intervals_days ?? null,
    excluded_weekdays: payload.excluded_weekdays ?? [],
    created_at: now,
    updated_at: now,
  };
  await dbPut("exams", exam);
  return exam;
}

export async function updateExam(id: string, payload: Partial<Exam>): Promise<Exam> {
  const existing = await getExam(id);
  const updated = { ...existing, ...payload, updated_at: nowIso() };
  await dbPut("exams", updated);
  return updated;
}

export async function deleteExam(id: string): Promise<void> {
  const [subjects, topics, logs, reviews, schedule] = await Promise.all([
    dbGetAll<ExamSubject>("exam_subjects"),
    dbGetAll<ExamTopic>("exam_topics"),
    dbGetAll<StudyLog>("study_logs"),
    dbGetAll<LocalTopicReview>("topic_reviews"),
    dbGetAll<ManualScheduleEntry>("manual_schedule"),
  ]);
  const topicIds = new Set(topics.filter((t) => t.exam_id === id).map((t) => t.id));
  for (const s of subjects) if (s.exam_id === id) await dbDelete("exam_subjects", s.id);
  for (const t of topics) if (t.exam_id === id) await dbDelete("exam_topics", t.id);
  for (const l of logs) if (l.exam_id === id) await dbDelete("study_logs", l.id);
  for (const r of reviews) if (topicIds.has(r.topic_id)) await dbDelete("topic_reviews", r.id);
  for (const m of schedule) if (m.exam_id === id) await dbDelete("manual_schedule", m.id);
  await dbDelete("exams", id);
}

export async function listExamSubjects(examId: string): Promise<ExamSubject[]> {
  const all = await dbGetAll<ExamSubject>("exam_subjects");
  return all.filter((s) => s.exam_id === examId).sort((a, b) => a.position - b.position);
}

export async function createExamSubject(
  examId: string,
  payload: { name: string; weight?: number; knowledge_factor?: number },
): Promise<ExamSubject> {
  const now = nowIso();
  const existing = await listExamSubjects(examId);
  const subject: ExamSubject = {
    id: newId(),
    exam_id: examId,
    name: payload.name,
    weight: payload.weight ?? 1,
    knowledge_factor: payload.knowledge_factor ?? 1,
    position: existing.length,
    created_at: now,
    updated_at: now,
  };
  await dbPut("exam_subjects", subject);
  return subject;
}

export async function updateExamSubject(
  id: string,
  payload: { name: string; weight?: number; knowledge_factor?: number },
): Promise<ExamSubject> {
  const existing = await dbGet<ExamSubject>("exam_subjects", id);
  if (!existing) throw new Error("Matéria não encontrada.");
  const updated = { ...existing, ...payload, updated_at: nowIso() };
  await dbPut("exam_subjects", updated);
  return updated;
}

export async function deleteExamSubject(id: string): Promise<void> {
  const topics = await dbGetAll<ExamTopic>("exam_topics");
  for (const t of topics) if (t.subject_id === id) await dbDelete("exam_topics", t.id);
  await dbDelete("exam_subjects", id);
}

export async function listExamTopics(examId: string): Promise<ExamTopic[]> {
  const all = await dbGetAll<ExamTopic>("exam_topics");
  return all.filter((t) => t.exam_id === examId).sort((a, b) => a.position - b.position);
}

export async function createExamTopic(
  examId: string,
  payload: {
    subject_id: string;
    parent_topic_id?: string;
    number: string;
    title: string;
    relevance?: number;
    in_sprint?: boolean;
  },
): Promise<ExamTopic> {
  const now = nowIso();
  const existing = await listExamTopics(examId);
  const topic: ExamTopic = {
    id: newId(),
    exam_id: examId,
    subject_id: payload.subject_id,
    parent_topic_id: payload.parent_topic_id ?? null,
    number: payload.number,
    title: payload.title,
    position: existing.length,
    relevance: payload.relevance ?? 1,
    in_sprint: payload.in_sprint ?? false,
    scheduled_date: null,
    created_at: now,
    updated_at: now,
  };
  await dbPut("exam_topics", topic);
  return topic;
}

export async function updateExamTopic(
  id: string,
  payload: {
    subject_id: string;
    parent_topic_id?: string;
    number: string;
    title: string;
    relevance?: number;
    in_sprint?: boolean;
  },
): Promise<ExamTopic> {
  const existing = await dbGet<ExamTopic>("exam_topics", id);
  if (!existing) throw new Error("Tópico não encontrado.");
  const updated: ExamTopic = {
    ...existing,
    subject_id: payload.subject_id,
    parent_topic_id: payload.parent_topic_id ?? null,
    number: payload.number,
    title: payload.title,
    relevance: payload.relevance ?? existing.relevance,
    in_sprint: payload.in_sprint ?? existing.in_sprint,
    updated_at: nowIso(),
  };
  await dbPut("exam_topics", updated);
  return updated;
}

export async function deleteExamTopic(id: string): Promise<void> {
  const reviews = await dbGetAll<LocalTopicReview>("topic_reviews");
  for (const r of reviews) if (r.topic_id === id) await dbDelete("topic_reviews", r.id);
  await dbDelete("exam_topics", id);
}

export async function getTopicsWithMarkers(examId: string): Promise<TopicMarker[]> {
  const [topics, logs, reviews] = await Promise.all([
    listExamTopics(examId),
    dbGetAll<StudyLog>("study_logs"),
    dbGetAll<LocalTopicReview>("topic_reviews"),
  ]);
  const today = new Date();

  return topics.map((t) => {
    const topicLogs = logs.filter((l) => l.topic_id === t.id);
    const pendingReview = reviews
      .filter((r) => r.topic_id === t.id && !r.completed_at && !r.skipped)
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))[0];

    const overdueDays =
      pendingReview && new Date(pendingReview.scheduled_date) < today
        ? Math.floor(
            (today.getTime() - new Date(pendingReview.scheduled_date).getTime()) / 86400000,
          )
        : null;

    return {
      id: t.id,
      subject_id: t.subject_id,
      parent_topic_id: t.parent_topic_id,
      number: t.number,
      title: t.title,
      relevance: t.relevance,
      in_sprint: t.in_sprint,
      scheduled_date: t.scheduled_date,
      status: topicLogs.length > 0 ? "studied" : "not_started",
      first_studied_on: topicLogs.length > 0 ? topicLogs.map((l) => l.studied_on).sort()[0] : null,
      last_log_on:
        topicLogs.length > 0
          ? topicLogs
              .map((l) => l.studied_on)
              .sort()
              .slice(-1)[0]
          : null,
      log_count: topicLogs.length,
      next_review_date: pendingReview?.scheduled_date ?? null,
      next_review_step: pendingReview?.step ?? null,
      review_overdue_days: overdueDays,
    };
  });
}

export async function getExamStats(examId: string): Promise<ExamStats> {
  const [topics, subjects, logs] = await Promise.all([
    listExamTopics(examId),
    listExamSubjects(examId),
    dbGetAll<StudyLog>("study_logs"),
  ]);
  const examLogs = logs.filter((l) => l.exam_id === examId);

  const studiedTopicIds = new Set(examLogs.map((l) => l.topic_id));

  const sameDayDates = Array.from(
    new Set(examLogs.filter((l) => l.logged_same_day).map((l) => l.studied_on)),
  ).sort((a, b) => b.localeCompare(a));

  let streak = 0;
  const cursor = new Date();
  for (const dateStr of sameDayDates) {
    const cursorStr = cursor.toISOString().slice(0, 10);
    if (dateStr === cursorStr) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else if (dateStr < cursorStr) {
      break;
    }
  }

  const performance = subjects.map((s) => {
    const subjectTopicIds = new Set(topics.filter((t) => t.subject_id === s.id).map((t) => t.id));
    const subjectLogs = examLogs.filter((l) => subjectTopicIds.has(l.topic_id));
    const total = subjectLogs.reduce((sum, l) => sum + (l.questions_total ?? 0), 0);
    const correct = subjectLogs.reduce((sum, l) => sum + (l.questions_correct ?? 0), 0);
    return {
      subject_id: s.id,
      subject_name: s.name,
      questions_total: total,
      questions_correct: correct,
      accuracy: total > 0 ? correct / total : 0,
    };
  });
  performance.sort((a, b) => a.accuracy - b.accuracy);

  return {
    progress: { total_topics: topics.length, studied_topics: studiedTopicIds.size },
    streak_days: streak,
    performance,
  };
}

// ============================================================
// STUDY LOGS + ESCADA DE REVISÃO
// ============================================================

export async function createStudyLog(payload: {
  exam_id: string;
  topic_id: string;
  category: string;
  studied_on: string;
  minutes: number;
  pages?: number;
  video_minutes?: number;
  questions_total?: number;
  questions_correct?: number;
  notes?: string;
  schedule_reviews?: boolean;
}): Promise<{ log: StudyLog; review_action: string }> {
  const exam = await getExam(payload.exam_id);
  const today = new Date().toISOString().slice(0, 10);
  const loggedSameDay = payload.studied_on === today;

  const log: StudyLog = {
    id: newId(),
    user_id: "local",
    exam_id: payload.exam_id,
    topic_id: payload.topic_id,
    category: payload.category as StudyLog["category"],
    studied_on: payload.studied_on,
    minutes: payload.minutes ?? 0,
    pages: payload.pages ?? null,
    video_minutes: payload.video_minutes ?? null,
    questions_total: payload.questions_total ?? null,
    questions_correct: payload.questions_correct ?? null,
    notes: payload.notes ?? null,
    logged_same_day: loggedSameDay,
    created_at: nowIso(),
  };
  await dbPut("study_logs", log);

  let reviewAction = "none";
  const reviews = await dbGetAll<LocalTopicReview>("topic_reviews");
  const pending = reviews
    .filter((r) => r.topic_id === payload.topic_id && !r.completed_at && !r.skipped)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))[0];

  if (payload.category === "revisao") {
    if (pending) {
      await dbPut("topic_reviews", {
        ...pending,
        completed_at: nowIso(),
        completed_study_log_id: log.id,
      });
      const next = buildNextLadderStep(exam, payload.topic_id, log.id, pending.step, newId);
      if (next) await dbPut("topic_reviews", { ...next, skipped: false });
      reviewAction = "completed_pending";
    } else if (payload.schedule_reviews) {
      const first = buildFirstLadderStep(
        exam,
        payload.topic_id,
        log.id,
        new Date(payload.studied_on),
        newId,
      );
      if (first) await dbPut("topic_reviews", { ...first, skipped: false });
      reviewAction = "started_ladder";
    }
  } else if (payload.schedule_reviews && !pending) {
    const first = buildFirstLadderStep(
      exam,
      payload.topic_id,
      log.id,
      new Date(payload.studied_on),
      newId,
    );
    if (first) await dbPut("topic_reviews", { ...first, skipped: false });
    reviewAction = "started_ladder";
  }

  return { log, review_action: reviewAction };
}

export async function listStudyLogs(params: {
  exam_id?: string;
  topic_id?: string;
}): Promise<StudyLog[]> {
  const all = await dbGetAll<StudyLog>("study_logs");
  const filtered = all.filter(
    (l) =>
      (!params.topic_id || l.topic_id === params.topic_id) &&
      (!params.exam_id || l.exam_id === params.exam_id),
  );
  return filtered.sort((a, b) => b.studied_on.localeCompare(a.studied_on)).slice(0, 200);
}

export async function getDueReviews(examId?: string): Promise<DueReview[]> {
  const [reviews, topics] = await Promise.all([
    dbGetAll<LocalTopicReview>("topic_reviews"),
    dbGetAll<ExamTopic>("exam_topics"),
  ]);
  const topicsById = new Map(topics.map((t) => [t.id, t]));
  const today = new Date();

  return reviews
    .filter((r) => !r.completed_at && !r.skipped)
    .map((r) => {
      const topic = topicsById.get(r.topic_id);
      if (!topic || (examId && topic.exam_id !== examId)) return null;
      const daysOverdue = Math.max(
        0,
        Math.floor((today.getTime() - new Date(r.scheduled_date).getTime()) / 86400000),
      );
      return {
        id: r.id,
        topic_id: r.topic_id,
        exam_id: topic.exam_id,
        topic_number: topic.number,
        topic_title: topic.title,
        step: r.step,
        scheduled_date: r.scheduled_date,
        days_overdue: daysOverdue,
      } satisfies DueReview;
    })
    .filter((r): r is DueReview => r !== null)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
}

export async function skipReview(id: string): Promise<void> {
  const review = await dbGet<LocalTopicReview>("topic_reviews", id);
  if (!review) return;
  await dbPut("topic_reviews", { ...review, skipped: true });
}

// ---------------- geração de cronograma (versão offline simplificada) ----------------
//
// O gerador completo no servidor (theo-rust/src/routes/schedule.rs) leva em conta
// mais regras finas de distribuição. Esta versão local cobre o essencial — distribuição
// uniforme por peso/relevância, respeitando dias excluídos e o sprint final — e pode
// ficar diferente em casos de borda. Ao sincronizar a conta, o cronograma do servidor
// (se existir) prevalece.

export async function generateDeadlineSchedule(examId: string): Promise<{
  message: string;
  regular_topics: number;
  sprint_topics: number;
  sprint_start: string;
}> {
  const exam = await getExam(examId);
  const topics = await listExamTopics(examId);
  if (!exam.exam_date || !exam.sprint_days) {
    throw new Error("Defina a data da prova e os dias de sprint antes de gerar o cronograma.");
  }

  const examDate = new Date(exam.exam_date);
  const sprintStart = new Date(examDate);
  sprintStart.setDate(sprintStart.getDate() - exam.sprint_days);

  const regular = topics.filter((t) => !t.in_sprint);
  const sprint = topics.filter((t) => t.in_sprint);

  const availableDays: Date[] = [];
  const cursor = new Date();
  while (cursor < sprintStart) {
    if (!exam.excluded_weekdays.includes(cursor.getDay())) {
      availableDays.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  if (availableDays.length > 0) {
    for (let i = 0; i < regular.length; i++) {
      const day = availableDays[i % availableDays.length];
      await dbPut("exam_topics", {
        ...regular[i],
        scheduled_date: day.toISOString().slice(0, 10),
        updated_at: nowIso(),
      });
    }
  }

  return {
    message: "Cronograma gerado localmente.",
    regular_topics: regular.length,
    sprint_topics: sprint.length,
    sprint_start: sprintStart.toISOString().slice(0, 10),
  };
}

export async function getContinuousSchedule(
  examId: string,
  mode: "semanal" | "ciclo",
): Promise<
  { mode: "semanal"; week: ContinuousWeeklyDay[] } | { mode: "ciclo"; queue: ContinuousCycleItem[] }
> {
  const exam = await getExam(examId);
  const subjects = await listExamSubjects(examId);
  const totalWeight = subjects.reduce((sum, s) => sum + s.weight, 0) || 1;
  const weeklyMinutes = (exam.weekly_hours ?? 0) * 60;

  if (mode === "ciclo") {
    const queue: ContinuousCycleItem[] = subjects
      .map((s) => ({
        subject_id: s.id,
        subject_name: s.name,
        minutes: Math.round((s.weight / totalWeight) * weeklyMinutes),
      }))
      .sort((a, b) => b.minutes - a.minutes);
    return { mode: "ciclo", queue };
  }

  const activeWeekdays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !exam.excluded_weekdays.includes(d));
  const minutesPerDay = activeWeekdays.length > 0 ? weeklyMinutes / activeWeekdays.length : 0;

  const week: ContinuousWeeklyDay[] = WEEKDAY_NAMES.map((weekday, idx) => {
    if (!activeWeekdays.includes(idx)) return { weekday, subjects: [] };
    return {
      weekday,
      subjects: subjects.map((s) => ({
        subject_id: s.id,
        subject_name: s.name,
        minutes: Math.round((s.weight / totalWeight) * minutesPerDay),
      })),
    };
  });

  return { mode: "semanal", week };
}

export async function listManualSchedule(examId: string): Promise<ManualScheduleEntry[]> {
  const all = await dbGetAll<ManualScheduleEntry>("manual_schedule");
  return all.filter((m) => m.exam_id === examId);
}

export async function createManualScheduleEntry(
  examId: string,
  payload: {
    weekday: number;
    subject_id?: string;
    topic_id?: string;
    planned_minutes?: number;
    question_goal?: number;
  },
): Promise<ManualScheduleEntry> {
  const entry: ManualScheduleEntry = {
    id: newId(),
    exam_id: examId,
    weekday: payload.weekday,
    subject_id: payload.subject_id ?? null,
    topic_id: payload.topic_id ?? null,
    planned_minutes: payload.planned_minutes ?? null,
    question_goal: payload.question_goal ?? null,
    created_at: nowIso(),
  };
  await dbPut("manual_schedule", entry);
  return entry;
}

export async function getScheduleCheck(
  examId: string,
): Promise<{ weekday: number; planned: boolean; logged: boolean }[]> {
  const [schedule, logs] = await Promise.all([
    listManualSchedule(examId),
    listStudyLogs({ exam_id: examId }),
  ]);
  const today = new Date();
  const loggedToday = logs.some((l) => l.studied_on === today.toISOString().slice(0, 10));

  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    planned: schedule.some((s) => s.weekday === weekday),
    logged: weekday === today.getDay() ? loggedToday : false,
  }));
}

// ============================================================
// METAS (GOALS)
// ============================================================

export async function listGoals(): Promise<Goal[]> {
  const goals = await dbGetAll<Goal>("goals");
  const logs = await dbGetAll<StudyLog>("study_logs");
  const reviewLog = await dbGetAll<ReviewLogEntry>("review_log");

  return Promise.all(
    goals.map(async (g) => ({ ...g, progress: await computeGoalProgress(g, logs, reviewLog) })),
  );
}

async function computeGoalProgress(
  goal: Goal,
  logs: StudyLog[],
  reviewLog: ReviewLogEntry[],
): Promise<number> {
  const now = new Date();
  const since = new Date(now);
  if (goal.period === "daily") since.setHours(0, 0, 0, 0);
  else if (goal.period === "weekly") since.setDate(since.getDate() - since.getDay());
  else since.setDate(1);

  const scopedLogs = logs.filter(
    (l) => new Date(l.studied_on) >= since && (!goal.exam_id || l.exam_id === goal.exam_id),
  );

  switch (goal.metric) {
    case "minutes":
      return scopedLogs.reduce((sum, l) => sum + l.minutes, 0);
    case "questions":
      return scopedLogs.reduce((sum, l) => sum + (l.questions_total ?? 0), 0);
    case "topics":
      return new Set(scopedLogs.map((l) => l.topic_id)).size;
    case "reviews":
      return reviewLog.filter((r) => new Date(r.reviewed_at) >= since).length;
    default:
      return 0;
  }
}

export async function createGoal(payload: {
  period: GoalPeriod;
  metric: GoalMetric;
  target: number;
  exam_id?: string;
}): Promise<Goal> {
  const now = nowIso();
  const goal: Goal = {
    id: newId(),
    user_id: "local",
    period: payload.period,
    metric: payload.metric,
    target: payload.target,
    exam_id: payload.exam_id ?? null,
    active: true,
    progress: 0,
    created_at: now,
    updated_at: now,
  };
  await dbPut("goals", goal);
  return goal;
}

export async function deleteGoal(id: string): Promise<void> {
  await dbDelete("goals", id);
}

// ============================================================
// CRONÔMETRO
// ============================================================

interface LocalTimer extends ActiveTimer {
  running: boolean;
}

const TIMER_KEY = "active_timer";

function elapsedSeconds(timer: LocalTimer): number {
  if (!timer.running || !timer.running_since) return timer.accumulated_seconds;
  const runningMs = Date.now() - new Date(timer.running_since).getTime();
  return timer.accumulated_seconds + Math.floor(runningMs / 1000);
}

export async function getCurrentTimer(): Promise<ActiveTimer | null> {
  const timer = await metaGet<LocalTimer>(TIMER_KEY);
  if (!timer) return null;
  return { ...timer, elapsed_seconds: elapsedSeconds(timer) };
}

export async function startTimer(payload: {
  exam_id: string;
  topic_id: string;
  category?: string;
}): Promise<ActiveTimer> {
  const now = nowIso();
  const timer: LocalTimer = {
    id: newId(),
    exam_id: payload.exam_id,
    topic_id: payload.topic_id,
    category: payload.category ?? "teoria",
    started_at: now,
    accumulated_seconds: 0,
    running_since: now,
    elapsed_seconds: 0,
    created_at: now,
    running: true,
  };
  await metaSet(TIMER_KEY, timer);
  return { ...timer, elapsed_seconds: 0 };
}

export async function pauseTimer(): Promise<ActiveTimer> {
  const timer = await metaGet<LocalTimer>(TIMER_KEY);
  if (!timer) throw new Error("Nenhum cronômetro ativo.");
  const elapsed = elapsedSeconds(timer);
  const updated: LocalTimer = {
    ...timer,
    accumulated_seconds: elapsed,
    running_since: null,
    running: false,
  };
  await metaSet(TIMER_KEY, updated);
  return { ...updated, elapsed_seconds: elapsed };
}

export async function resumeTimer(): Promise<ActiveTimer> {
  const timer = await metaGet<LocalTimer>(TIMER_KEY);
  if (!timer) throw new Error("Nenhum cronômetro ativo.");
  const updated: LocalTimer = { ...timer, running_since: nowIso(), running: true };
  await metaSet(TIMER_KEY, updated);
  return { ...updated, elapsed_seconds: elapsedSeconds(updated) };
}

export async function finishTimer(payload: {
  pages?: number;
  video_minutes?: number;
  questions_total?: number;
  questions_correct?: number;
  notes?: string;
  schedule_reviews?: boolean;
}): Promise<{ log: StudyLog; review_action: string }> {
  const timer = await metaGet<LocalTimer>(TIMER_KEY);
  if (!timer) throw new Error("Nenhum cronômetro ativo.");
  const totalSeconds = elapsedSeconds(timer);
  const minutes = Math.max(1, Math.round(totalSeconds / 60));

  await metaSet(TIMER_KEY, null);

  return createStudyLog({
    exam_id: timer.exam_id,
    topic_id: timer.topic_id,
    category: timer.category,
    studied_on: new Date().toISOString().slice(0, 10),
    minutes,
    pages: payload.pages,
    video_minutes: payload.video_minutes,
    questions_total: payload.questions_total,
    questions_correct: payload.questions_correct,
    notes: payload.notes,
    schedule_reviews: payload.schedule_reviews ?? true,
  });
}

export async function cancelTimer(): Promise<void> {
  await metaSet(TIMER_KEY, null);
}

// ============================================================
// HOME / RESUMO DIÁRIO
// ============================================================

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const today = new Date().toISOString().slice(0, 10);
  const [logs, reviews, topics, subjects] = await Promise.all([
    dbGetAll<StudyLog>("study_logs"),
    dbGetAll<LocalTopicReview>("topic_reviews"),
    dbGetAll<ExamTopic>("exam_topics"),
    dbGetAll<ExamSubject>("exam_subjects"),
  ]);

  const logsToday = logs.filter((l) => l.studied_on === today);
  const minutesStudied = logsToday.reduce((sum, l) => sum + l.minutes, 0);
  const questionsTotal = logsToday.reduce((sum, l) => sum + (l.questions_total ?? 0), 0);
  const questionsCorrect = logsToday.reduce((sum, l) => sum + (l.questions_correct ?? 0), 0);
  const topicsStudied = new Set(logsToday.map((l) => l.topic_id)).size;

  const reviewsPending = reviews.filter(
    (r) => !r.completed_at && !r.skipped && r.scheduled_date <= today,
  ).length;

  const sameDayDates = Array.from(
    new Set(logs.filter((l) => l.logged_same_day).map((l) => l.studied_on)),
  ).sort((a, b) => b.localeCompare(a));
  let streak = 0;
  const cursor = new Date();
  for (const dateStr of sameDayDates) {
    const cursorStr = cursor.toISOString().slice(0, 10);
    if (dateStr === cursorStr) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else if (dateStr < cursorStr) break;
  }

  const subjectPerf = subjects
    .map((s) => {
      const topicIds = new Set(topics.filter((t) => t.subject_id === s.id).map((t) => t.id));
      const subjectLogs = logs.filter((l) => topicIds.has(l.topic_id));
      const total = subjectLogs.reduce((sum, l) => sum + (l.questions_total ?? 0), 0);
      const correct = subjectLogs.reduce((sum, l) => sum + (l.questions_correct ?? 0), 0);
      return { name: s.name, accuracy: total > 0 ? correct / total : 0, total };
    })
    .filter((s) => s.total > 0);

  subjectPerf.sort((a, b) => a.accuracy - b.accuracy);
  const weakest = subjectPerf[0] ?? null;
  const strongest = subjectPerf[subjectPerf.length - 1] ?? null;

  const nextReview = reviews
    .filter((r) => !r.completed_at && !r.skipped)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))[0];
  const nextTopic = nextReview ? topics.find((t) => t.id === nextReview.topic_id) : undefined;

  return {
    today: {
      minutes_studied: minutesStudied,
      questions_total: questionsTotal,
      questions_correct: questionsCorrect,
      topics_studied: topicsStudied,
    },
    reviews_pending: reviewsPending,
    streak_days: streak,
    diagnosis: {
      weakest_subject: weakest ? { name: weakest.name, accuracy: weakest.accuracy } : null,
      strongest_subject: strongest ? { name: strongest.name, accuracy: strongest.accuracy } : null,
    },
    next_review:
      nextReview && nextTopic
        ? {
            topic_number: nextTopic.number,
            topic_title: nextTopic.title,
            scheduled_date: nextReview.scheduled_date,
          }
        : null,
  };
}

// ============================================================
// IMPORTAÇÃO/EXPORTAÇÃO XLSX
// ============================================================
//
// Continua exigindo o servidor (processa a planilha em Rust).
// Ver `api.ts`: essas chamadas só funcionam com internet.
