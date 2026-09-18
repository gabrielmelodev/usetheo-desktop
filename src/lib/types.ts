export type SubscriptionStatus = "trial" | "active" | "expired" | "cancelled" | "past_due";

export interface UserPublic {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  city: string;
  country: string;
  email_verified: boolean;
  totp_enabled: boolean;
  role: string;
  subscription_status?: SubscriptionStatus;
  trial_started_at?: string;
  trial_expires_at?: string;
  subscription_expires_at?: string | null;
  access_allowed?: boolean;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  must_change_password: boolean;
  user: UserPublic;
}

/** Retorno de POST /auth/login quando a conta tem 2FA habilitado. */
export interface Requires2FAResponse {
  requires_2fa: true;
  challenge_token: string;
}

export interface RegisterResponse {
  message: string;
  user: UserPublic;
}

export interface Deck {
  id: string;

  owner_id?: string;

  user_id?: string;

  name: string;

  description?: string | null;

  folder_id?: string | null;

  parent_deck_id?: string | null;

  support_text?: string | null;

  about?: string | null;

  target_cards: number;

  card_type: "basic" | "cloze" | "multiple_choice" | "true_false";

  difficulty: string;

  color: string;

  icon?: string | null;
  due_cards: number;
  show_review_queue: boolean;

  allow_subdecks: boolean;

  is_public: boolean;

  is_template: boolean;

  position: number;

  copied_from_deck_id?: string | null;

  total_cards: number;

  created_at: string;

  updated_at: string;

  // importação Anki
  anki_name?: string | null;

  imported_from_anki?: boolean;

  review_cards_per_day?: number;
}

export interface Folder {
  id: string;
  user_id: string;
  parent_folder_id?: string | null;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface NoteType {
  id: string;
  owner_id: string;
  name: string;
  fields_json: string;
  created_at: string;
  updated_at: string;
  is_cloze: boolean;
}

export interface CardResponse {
  id: string;
  note_id: string;
  deck_id: string;
  parent_card_id: string | null;
  position: number;
  cloze_index: number | null;
  queue: "new" | "learning" | "review" | "suspended" | "buried";
  due: string;
  interval_days: number;
  ease_factor: number;
  repetitions: number;
  lapses: number;
  front: string;
  back: string;
}

export interface QueueResponse {
  cards: CardResponse[];
  count: number;
}

export type Rating = "again" | "hard" | "good" | "easy";

export interface SubmitReviewResponse {
  card_id: string;
  queue: string;
  due: string;
  interval_days: number;
  ease_factor: number;
}

export interface StatsOverview {
  total_cards: number;
  new_cards: number;
  learning_cards: number;
  review_cards: number;
  reviews_today: number;
  reviews_last_7_days: number;
  current_streak_days: number;
  retention_rate_pct: number;
}

export interface HeatmapEntry {
  date: string;
  count: number;
}

export interface CommunityListing {
  id: string;
  deck_id: string;
  title: string;
  description: string | null;
  category: string | null;
  downloads_count: number;
  rating_avg: number;
  rating_count: number;
}

export interface ApiErrorBody {
  error: string;
  message: string;
}

export interface StudyHour {
  hour: number;
  reviews: number;
}

export interface WeekDay {
  day: string;
  reviews: number;
}

export interface Answers {
  again: number;
  hard: number;
  good: number;
  easy: number;
}

export interface Summary {
  cards_reviewed: number;
  total_minutes: number;
  average_daily_minutes: number;
  study_days: number;
}

export interface Activity {
  date: string;
  cards: number;
  minutes: number;
}

export interface ReviewTime {
  seconds: number;
}

// ---------------- Admin / organização em massa ----------------

export interface AdminUserRow extends UserPublic {}

// ---------------- Planejamento de estudos ----------------

export type PlanMode = "deadline" | "continuous" | "free";
export type ContinuousMode = "semanal" | "ciclo";

export interface Exam {
  id: string;
  user_id: string;
  name: string;
  banca: string | null;
  plan_mode: PlanMode;
  exam_date: string | null;
  sprint_days: number | null;
  weekly_hours: number | null;
  continuous_mode: ContinuousMode | null;
  max_session_minutes: number | null;
  review_intervals_days: number[] | null;
  excluded_weekdays: number[];
  created_at: string;
  updated_at: string;
}

export interface ExamSubject {
  id: string;
  exam_id: string;
  name: string;
  weight: number;
  knowledge_factor: number;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ExamTopic {
  id: string;
  exam_id: string;
  subject_id: string;
  parent_topic_id: string | null;
  number: string;
  title: string;
  position: number;
  relevance: number;
  in_sprint: boolean;
  scheduled_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface TopicMarker {
  id: string;
  subject_id: string;
  parent_topic_id: string | null;
  number: string;
  title: string;
  relevance: number;
  in_sprint: boolean;
  scheduled_date: string | null;
  status: "not_started" | "studied";
  first_studied_on: string | null;
  last_log_on: string | null;
  log_count: number;
  next_review_date: string | null;
  next_review_step: number | null;
  review_overdue_days: number | null;
}

export type StudyCategory = "teoria" | "revisao" | "questoes" | "videoaula" | "leitura";

export interface StudyLog {
  id: string;
  user_id: string;
  exam_id: string;
  topic_id: string;
  category: StudyCategory;
  studied_on: string;
  minutes: number;
  pages: number | null;
  video_minutes: number | null;
  questions_total: number | null;
  questions_correct: number | null;
  notes: string | null;
  logged_same_day: boolean;
  created_at: string;
}

export interface DueReview {
  id: string;
  topic_id: string;
  exam_id: string;
  topic_number: string;
  topic_title: string;
  step: number;
  scheduled_date: string;
  days_overdue: number;
}

export interface ExamStats {
  progress: { total_topics: number; studied_topics: number };
  streak_days: number;
  performance: {
    subject_id: string;
    subject_name: string;
    questions_total: number;
    questions_correct: number;
    accuracy: number;
  }[];
}

export interface ManualScheduleEntry {
  id: string;
  exam_id: string;
  weekday: number;
  subject_id: string | null;
  topic_id: string | null;
  planned_minutes: number | null;
  question_goal: number | null;
  created_at: string;
}

export interface ContinuousWeeklyDay {
  weekday: string;
  subjects: { subject_id: string; subject_name: string; minutes: number }[];
}

export interface ContinuousCycleItem {
  subject_id: string;
  subject_name: string;
  minutes: number;
}

// ---------------- Home / resumo diário / metas / cronômetro ----------------

export interface DashboardSummary {
  today: {
    minutes_studied: number;
    questions_total: number;
    questions_correct: number;
    topics_studied: number;
  };
  reviews_pending: number;
  streak_days: number;
  diagnosis: {
    weakest_subject: { name: string; accuracy: number } | null;
    strongest_subject: { name: string; accuracy: number } | null;
  };
  next_review: { topic_number: string; topic_title: string; scheduled_date: string } | null;
}

export type GoalPeriod = "daily" | "weekly" | "monthly";
export type GoalMetric = "minutes" | "questions" | "reviews" | "topics";

export interface Goal {
  id: string;
  user_id: string;
  period: GoalPeriod;
  metric: GoalMetric;
  target: number;
  exam_id: string | null;
  active: boolean;
  progress: number;
  created_at: string;
  updated_at: string;
}

export interface ActiveTimer {
  id: string;
  exam_id: string;
  topic_id: string;
  category: string;
  started_at: string;
  accumulated_seconds: number;
  running_since: string | null;
  elapsed_seconds: number;
  created_at: string;
}
