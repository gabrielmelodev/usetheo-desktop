export type SubscriptionStatus = "trial" | "active" | "expired" | "cancelled" | "past_due";

export type SubscriptionSnapshot = {
  status: SubscriptionStatus;
  allowed: boolean;
  expires_at: string;
};

export interface SubscriptionService {
  getAccess(user: {
    subscription_status: string;
    trial_expires_at: string;
    subscription_expires_at: string | null;
  }): SubscriptionSnapshot;

  applyWebhook(input: {
    userId: string;
    status: Exclude<SubscriptionStatus, "trial">;
    expiresAt: string | null;
  }): Promise<void>;
}

export class D1SubscriptionService implements SubscriptionService {
  constructor(private readonly db: D1Database) {}

  getAccess(user: {
    subscription_status: string;
    trial_expires_at: string;
    subscription_expires_at: string | null;
  }): SubscriptionSnapshot {
    const current = Date.now();
    const trialExpires = new Date(user.trial_expires_at).getTime();
    const subscriptionExpires = user.subscription_expires_at
      ? new Date(user.subscription_expires_at).getTime()
      : 0;

    if (user.subscription_status === "active" && subscriptionExpires > current) {
      return { status: "active", allowed: true, expires_at: new Date(subscriptionExpires).toISOString() };
    }

    if (
      (user.subscription_status === "cancelled" || user.subscription_status === "past_due") &&
      subscriptionExpires > current
    ) {
      return {
        status: user.subscription_status,
        allowed: true,
        expires_at: new Date(subscriptionExpires).toISOString(),
      };
    }

    if (trialExpires > current) {
      return { status: "trial", allowed: true, expires_at: new Date(trialExpires).toISOString() };
    }

    return { status: "expired", allowed: false, expires_at: new Date(trialExpires).toISOString() };
  }

  async applyWebhook(input: {
    userId: string;
    status: Exclude<SubscriptionStatus, "trial">;
    expiresAt: string | null;
  }) {
    await this.db.prepare(`
      UPDATE users
      SET subscription_status = ?, subscription_expires_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(input.status, input.expiresAt, new Date().toISOString(), input.userId).run();
  }
}
