/** User tier and quota types */

export type UserTier = "free" | "pro" | "premium";

export type QuotaType = "ai_messages" | "vectorize" | "translation";

export interface Quota {
  type: QuotaType;
  used: number;
  limit: number;
  resetAt: number; // timestamp
  period: "daily" | "monthly";
}

export interface UserProfile {
  id: string;
  tier: UserTier;
  quotas: Quota[];
  createdAt: number;
}


