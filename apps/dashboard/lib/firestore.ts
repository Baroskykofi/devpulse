/**
 * lib/firestore.ts
 * ─────────────────────────────────────────────────────────────────
 * All Firestore read helpers for the DevPulse dashboard.
 * Wire your Firebase project credentials via environment variables.
 *
 * Required env vars (add to .env.local):
 *   NEXT_PUBLIC_FIREBASE_API_KEY
 *   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID
 *   NEXT_PUBLIC_FIREBASE_APP_ID
 *
 * Firestore schema expected by the agent:
 *
 *   incidents/{incidentId}
 *     status:       "active" | "resolved" | "escalated"
 *     severity:     "critical" | "warning"
 *     title:        string
 *     service:      string
 *     dynatraceProblemId: string
 *     startedAt:    Timestamp
 *     resolvedAt?:  Timestamp
 *     metrics: {
 *       errorRate:   number   // e.g. 14.2
 *       p99Latency:  number   // ms
 *       requestsPerMin: number
 *       instanceCount: number
 *     }
 *     hypothesis?: {
 *       suspect:     string
 *       confidence:  "high" | "medium" | "low"
 *       evidence:    string[]
 *       alternative: string
 *     }
 *     recommendation?: {
 *       action:      "ROLLBACK" | "PR" | "ESCALATE"
 *       commitRef?:  string
 *       description: string
 *     }
 *     approvalStatus?: "pending" | "approved" | "rejected"
 *     affectedEntities: Array<{ name: string; type: "service"|"host"|"process"; healthy: boolean }>
 *
 *   incidents/{incidentId}/steps/{stepId}   ← written by write_reasoning_step tool
 *     phase:    "observe" | "correlate" | "hypothesize" | "recommend" | "execute" | "waiting"
 *     label:    string
 *     content:  string
 *     toolCalls?: Array<{ name: string; result: string }>
 *     logLines?:  string[]
 *     createdAt:  Timestamp
 */

import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";

// ─── Firebase init ────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:     process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId:      process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ─── Types ────────────────────────────────────────────────────────
export type IncidentStatus   = "active" | "resolved" | "escalated";
export type IncidentSeverity = "critical" | "warning";
export type Confidence       = "high" | "medium" | "low";
export type RecommendedAction = "ROLLBACK" | "PR" | "ESCALATE";
export type StepPhase =
  | "observe" | "correlate" | "hypothesize"
  | "recommend" | "execute" | "waiting";

export interface IncidentMetrics {
  errorRate:      number;
  p99Latency:     number;
  requestsPerMin: number;
  instanceCount:  number;
}

export interface Hypothesis {
  suspect:     string;
  confidence:  Confidence;
  evidence:    string[];
  alternative: string;
}

export interface Recommendation {
  action:      RecommendedAction;
  commitRef?:  string;
  description: string;
}

export interface AffectedEntity {
  name:    string;
  type:    "service" | "host" | "process";
  healthy: boolean;
}

export interface Incident {
  id:                   string;
  status:               IncidentStatus;
  severity:             IncidentSeverity;
  title:                string;
  service:              string;
  dynatraceProblemId:   string;
  startedAt:            Timestamp;
  resolvedAt?:          Timestamp;
  metrics:              IncidentMetrics;
  hypothesis?:          Hypothesis;
  recommendation?:      Recommendation;
  approvalStatus?:      "pending" | "approved" | "rejected";
  affectedEntities:     AffectedEntity[];
}

export interface ReasoningStep {
  id:        string;
  phase:     StepPhase;
  label:     string;
  content:   string;
  toolCalls?: Array<{ name: string; result: string }>;
  logLines?:  string[];
  createdAt:  Timestamp;
}

// ─── Subscriptions ────────────────────────────────────────────────

/** Subscribe to all incidents, ordered by startedAt desc */
export function subscribeToIncidents(
  cb: (incidents: Incident[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "incidents"),
    orderBy("startedAt", "desc")
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Incident)));
  });
}

/** Subscribe to a single incident doc */
export function subscribeToIncident(
  id: string,
  cb: (incident: Incident | null) => void
): Unsubscribe {
  return onSnapshot(doc(db, "incidents", id), (snap) => {
    cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as Incident) : null);
  });
}

/** Subscribe to the reasoning steps subcollection (live-updates as agent writes) */
export function subscribeToSteps(
  incidentId: string,
  cb: (steps: ReasoningStep[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "incidents", incidentId, "steps"),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ReasoningStep)));
  });
}

// ─── Mutations ────────────────────────────────────────────────────

/**
 * Triggers a scripted demo scenario by writing a sentinel document to
 * Firestore that the webhook-receiver Cloud Function watches and replays.
 * Scenario IDs: "bad-deploy" | "ext-outage" | "traffic-spike" | "missing-env"
 */
export async function replayIncident(scenarioId: string): Promise<void> {
  const { addDoc, collection: col, serverTimestamp } = await import("firebase/firestore");
  await addDoc(col(db, "replay_requests"), {
    scenarioId,
    requestedAt: serverTimestamp(),
    status: "pending",
  });
}

/** Called when the developer taps Approve or Reject */
export async function updateApproval(
  incidentId: string,
  decision: "approved" | "rejected"
): Promise<void> {
  // Update Firestore first
  await updateDoc(doc(db, "incidents", incidentId), {
    approvalStatus: decision,
  });

  // Call orchestrator to execute the action
  const EXECUTE_URL = "https://agent-execute-approval-rdjnrwvsgq-uc.a.run.app";

  try {
    const response = await fetch(EXECUTE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incidentId, decision }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("[approval] Failed to execute action:", error);
      throw new Error(`Failed to execute action: ${error.error || response.statusText}`);
    }

    console.log(`[approval] Successfully triggered ${decision} execution for ${incidentId}`);
  } catch (error) {
    console.error("[approval] Error calling execute endpoint:", error);
    // Don't throw - the approval status is already updated in Firestore
    // The user will see the error in console but the UI won't break
  }
}
