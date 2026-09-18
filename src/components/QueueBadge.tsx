import { Badge } from "../components/ui";

interface QueueBadgeProps {
  queue?: number | string | null;
}

type QueueType = "new" | "learning" | "review" | "suspended" | "buried";

const queueConfig: Record<
  QueueType,
  {
    label: string;
    description: string;
    tone: "neutral" | "accent" | "streak";
  }
> = {
  new: {
    label: "Nova",
    description: "Carta ainda não estudada",
    tone: "streak",
  },

  learning: {
    label: "Aprendendo",
    description: "Carta em fase de aprendizagem",
    tone: "neutral",
  },

  review: {
    label: "Revisão",
    description: "Carta pronta para revisão",
    tone: "accent",
  },

  suspended: {
    label: "Suspensa",
    description: "Carta temporariamente desativada",
    tone: "neutral",
  },

  buried: {
    label: "Enterrada",
    description: "Carta pausada até outro momento",
    tone: "neutral",
  },
};

function normalizeQueue(queue?: number | string | null): QueueType {
  if (typeof queue === "string") {
    const value = queue.toLowerCase();

    if (value in queueConfig) {
      return value as QueueType;
    }
  }

  switch (queue) {
    case 0:
      return "new";

    case 1:
      return "learning";

    case 2:
      return "review";

    case 3:
      return "suspended";

    case 4:
      return "buried";

    default:
      return "new";
  }
}

export default function QueueBadge({ queue }: QueueBadgeProps) {
  const type = normalizeQueue(queue);

  const item = queueConfig[type];

  return (
    <span title={item.description}>
      <Badge tone={item.tone}>{item.label}</Badge>
    </span>
  );
}
