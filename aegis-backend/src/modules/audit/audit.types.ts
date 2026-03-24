import { AuditCategory } from '@prisma/client';

export interface AuditEvent {
  eventType: string;
  category: AuditCategory;
  actor: string; // user ID or 'system'
  target: string; // resource being acted upon
  details: Record<string, unknown>;
  kmsKeyArn?: string; // optional — if provided, used for signing; if not, use a system signing key
}

export interface AuditMessage {
  eventId: string;
  timestamp: string;
  eventType: string;
  category: AuditCategory;
  actor: string;
  target: string;
  details: Record<string, unknown>;
  kmsKeyId: string;
  signature?: string;
}
