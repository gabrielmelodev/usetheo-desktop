import { http } from "./api";
import {
  ackSyncQueue,
  dbDeleteRemote,
  dbPutRemote,
  getDeviceId,
  getSyncQueue,
  metaGet,
  metaSet,
  recordSyncConflict,
  retrySyncQueue,
  type StoreName,
} from "./localdb";

const CURSOR_KEY = "cloud_sync_cursor";
const DEVICE_LABEL_KEY = "cloud_device_label";
const BATCH_SIZE = 100;

type RemoteEvent = {
  seq: number;
  event_id: string;
  device_id: string;
  entity_type: string;
  entity_id: string;
  operation: "CREATE" | "UPDATE" | "DELETE";
  version: number;
  payload: any;
  created_at: string;
};

const STORE_NAMES = new Set<StoreName>([
  "decks", "folders", "note_types", "notes", "cards",
  "review_log", "exams", "exam_subjects", "exam_topics",
  "study_logs", "topic_reviews", "manual_schedule", "goals",
  "questions", "question_attempts",
]);

function isCloudflareApi(): boolean {
  const base = String(import.meta.env.VITE_API_URL ?? "");
  return base.includes("workers.dev") || import.meta.env.VITE_SYNC_PROTOCOL === "cloudflare";
}

function compareVersion(
  localVersion: number,
  remoteVersion: number,
  localDevice: string,
  remoteDevice: string,
) {
  if (remoteVersion !== localVersion) return remoteVersion > localVersion;
  return remoteDevice > localDevice;
}

async function applyEvent(event: RemoteEvent, localDeviceId: string) {
  if (!STORE_NAMES.has(event.entity_type as StoreName)) return false;

  const store = event.entity_type as StoreName;
  const versionKey = `sync.version.${store}.${event.entity_id}`;
  const deviceKey = `sync.device.${store}.${event.entity_id}`;

  const localVersion = Number((await metaGet(versionKey)) ?? 0);
  const localDevice = String((await metaGet(deviceKey)) ?? "");

  if (!compareVersion(localVersion, event.version, localDevice, event.device_id)) {
    if (event.version === localVersion && event.device_id !== localDeviceId) {
      await recordSyncConflict({
        event_id: event.event_id,
        entity_type: store,
        entity_id: event.entity_id,
        local_version: localVersion,
        remote_version: event.version,
        resolution: "local_tie_break",
      });
    }
    return false;
  }

  if (event.operation === "DELETE") {
    await dbDeleteRemote(store, event.entity_id);
  } else {
    await dbPutRemote(store, event.payload);
  }

  await metaSet(versionKey, event.version);
  await metaSet(deviceKey, event.device_id);
  return true;
}

async function pullPage(localDeviceId: string, limit = 200) {
  const cursor = Number((await metaGet<number>(CURSOR_KEY)) ?? 0);
  const { data } = await http.get<{
    events: RemoteEvent[];
    next_cursor: number;
    has_more: boolean;
    server_time: string;
  }>("/sync/pull", { params: { since: cursor, limit } });

  let applied = 0;
  for (const event of data.events) {
    if (await applyEvent(event, localDeviceId)) applied++;
  }

  if (data.events.length > 0) {
    await metaSet(CURSOR_KEY, data.next_cursor);
  }

  return {
    pulled: data.events.length,
    applied,
    hasMore: data.has_more,
    serverTime: data.server_time,
  };
}

async function bootstrap(localDeviceId: string) {
  let cursor = 0;
  let total = 0;

  for (;;) {
    const { data } = await http.get<{
      events: RemoteEvent[];
      next_cursor: number;
      has_more: boolean;
      server_cursor: number;
    }>("/sync/bootstrap", { params: { since: cursor, limit: 1000 } });

    for (const event of data.events) {
      if (await applyEvent(event, localDeviceId)) total++;
    }

    cursor = data.next_cursor;
    if (!data.has_more) {
      await metaSet(CURSOR_KEY, data.server_cursor ?? cursor);
      break;
    }
  }

  return total;
}

async function push(localDeviceId: string) {
  let pushed = 0;

  for (;;) {
    const queue = await getSyncQueue(BATCH_SIZE);
    if (!queue.length) break;

    try {
      const { data } = await http.post("/sync/push", {
        device_id: localDeviceId,
        device_label: (await metaGet<string>(DEVICE_LABEL_KEY)) ?? "Theo",
        events: queue.map((event) => ({
          event_id: event.event_id,
          entity_type: event.entity_type,
          entity_id: event.entity_id,
          operation: event.operation,
          version: event.version,
          payload: event.payload,
          created_at: event.created_at,
        })),
      });

      const ids = queue.map((event) => event.event_id);
      await ackSyncQueue(ids);
      pushed += Number(data.accepted ?? 0) + Number(data.ignored ?? 0);

      if (queue.length < BATCH_SIZE) break;
    } catch (error) {
      await retrySyncQueue(queue.map((event) => event.event_id));
      throw error;
    }
  }

  return pushed;
}

export async function cloudflareFullSync() {
  if (!isCloudflareApi()) {
    throw new Error("O protocolo Cloudflare não está habilitado.");
  }

  const deviceId = await getDeviceId();

  const cursor = Number((await metaGet<number>(CURSOR_KEY)) ?? 0);
  const hasLocalCursor = cursor > 0;

  let bootstrapPulled = 0;
  if (!hasLocalCursor) {
    bootstrapPulled = await bootstrap(deviceId);
  }

  const pushed = await push(deviceId);

  let pulled = bootstrapPulled;
  for (;;) {
    const page = await pullPage(deviceId, 500);
    pulled += page.pulled;
    if (!page.hasMore) break;
  }

  return { pushed, pulled, deleted: 0 };
}
