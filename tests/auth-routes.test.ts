import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// These provider doubles exercise the real route and access helpers. Supabase
// password hashing, email transport, and JWT signatures require live acceptance tests.
const state = vi.hoisted(() => ({
  user: { id: "00000000-0000-4000-8000-000000000001", email: "employee@example.test" },
  active: true,
  session: true,
  rateAllowed: true,
  verifiedPassword: true,
  mfaRequired: false,
  ticket: "",
  ticketConsumed: false,
  purpose: "recovery",
  updates: 0,
  emails: 0,
  events: [] as string[],
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (state.ticket ? { value: state.ticket } : undefined),
    delete: () => {
      state.ticket = "";
    },
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: async () => ({
        error: state.verifiedPassword ? null : { message: "Invalid password" },
      }),
      signOut: async (options?: { scope?: string }) => {
        if (options?.scope !== "local") state.session = false;
        state.events.push("verification-session-closed");
        return { error: null };
      },
    },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  hasSupabase: () => true,
  isDemo: () => false,
  createSupabaseServer: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.session ? state.user : null }, error: null }),
      signInWithPassword: async () => ({ error: null }),
      signOut: async () => {
        state.session = false;
        state.events.push("signed-out");
        return { error: null };
      },
      updateUser: async () => {
        if (!state.session) return { error: { message: "Session no longer exists" } };
        state.updates++;
        state.events.push("password-updated");
        return { error: null };
      },
      resetPasswordForEmail: async () => {
        state.emails++;
        return { error: { message: "Simulated email outage" } };
      },
    },
    rpc: async (name: string) => {
      if (name === "register_session")
        return { error: state.active ? null : { message: "Account inactive" } };
      if (name === "revoke_session") {
        state.session = false;
        state.events.push("session-revoked");
        return { error: null };
      }
      if (name === "account_context")
        return {
          data: {
            ...state.user,
            status: state.active ? "active" : "deactivated",
            session_valid: state.session,
            mfa_required: state.mfaRequired,
            aal: "aal1",
            roles: [],
            grants: [],
          },
          error: null,
        };
      throw new Error(`Unexpected client RPC: ${name}`);
    },
  }),
  createSupabaseAdmin: () => ({
    rpc: async (name: string) => {
      if (name === "check_auth_rate_limit") return { data: state.rateAllowed, error: null };
      if (name === "consume_recovery_ticket") {
        if (state.ticketConsumed) return { data: null, error: { message: "Ticket consumed" } };
        state.ticketConsumed = true;
        return { data: state.purpose, error: null };
      }
      if (name === "finish_password_reset") {
        state.events.push("all-sessions-revoked");
        return { error: null };
      }
      throw new Error(`Unexpected admin RPC: ${name}`);
    },
  }),
}));

import { POST } from "../src/app/api/auth/route";

async function post(body: Record<string, unknown>, origin = "https://hris.example.test") {
  return POST(
    new NextRequest("https://hris.example.test/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin },
      body: JSON.stringify(body),
    }),
  );
}
const newPassword = "fictional long test passphrase";
beforeEach(() => {
  Object.assign(state, {
    active: true,
    session: true,
    rateAllowed: true,
    verifiedPassword: true,
    mfaRequired: false,
    ticket: "",
    ticketConsumed: false,
    purpose: "recovery",
    updates: 0,
    emails: 0,
    events: [],
  });
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://hris.example.test");
  vi.stubEnv("AUTH_RATE_LIMIT_PEPPER", "test-only-pepper-with-thirty-two-characters");
});
afterEach(() => vi.unstubAllEnvs());

describe("account HTTP workflows with controlled Auth provider", () => {
  it("ignores submitted roles and uses server-side MFA requirements at login", async () => {
    state.mfaRequired = true;
    const response = await post({
      action: "login",
      email: state.user.email,
      password: newPassword,
      role: "Owner",
      mfa_required: false,
    });
    expect(response.status).toBe(200);
    expect((await response.json()).redirect).toBe("/mfa");
  });
  it("rejects a deactivated account even after correct Auth credentials", async () => {
    state.active = false;
    expect(
      (await post({ action: "login", email: state.user.email, password: newPassword })).status,
    ).toBe(403);
    expect(state.session).toBe(false);
  });
  it("rate-limits login before provider authentication", async () => {
    state.rateAllowed = false;
    expect(
      (await post({ action: "login", email: state.user.email, password: newPassword })).status,
    ).toBe(429);
  });
  it("revokes application and Auth sessions on logout", async () => {
    const response = await post({ action: "logout" });
    expect(response.status).toBe(200);
    expect(state.events).toEqual(["session-revoked", "signed-out"]);
    expect(state.session).toBe(false);
  });
  it("returns the same recovery response for email failures and rate limits", async () => {
    const first = await post({ action: "forgot", email: state.user.email });
    state.rateAllowed = false;
    const second = await post({ action: "forgot", email: "unknown@example.test" });
    expect(await second.json()).toEqual(await first.json());
    expect(state.emails).toBe(1);
  });
  it("consumes a recovery ticket once, updates the password, and signs out", async () => {
    state.ticket = "fictional-ticket";
    const payload = { action: "set-password", password: newPassword, confirmPassword: newPassword };
    expect((await post(payload)).status).toBe(200);
    expect(state.updates).toBe(1);
    expect(state.ticketConsumed).toBe(true);
    expect(state.session).toBe(false);
    expect((await post(payload)).status).toBe(400);
    expect(state.updates).toBe(1);
  });
  it("keeps the current session until a verified password change completes", async () => {
    const response = await post({
      action: "change-password",
      currentPassword: "existing fictional password",
      password: newPassword,
      confirmPassword: newPassword,
    });
    expect(response.status).toBe(200);
    expect(state.events).toEqual([
      "verification-session-closed",
      "password-updated",
      "all-sessions-revoked",
      "signed-out",
    ]);
    expect(state.updates).toBe(1);
    expect(state.session).toBe(false);
  });
  it("an incorrect current password leaves the active session and password intact", async () => {
    state.verifiedPassword = false;
    expect(
      (
        await post({
          action: "change-password",
          currentPassword: "incorrect password",
          password: newPassword,
          confirmPassword: newPassword,
        })
      ).status,
    ).toBe(400);
    expect(state.updates).toBe(0);
    expect(state.session).toBe(true);
  });
  it("denies privileged changes until MFA and rejects untrusted origins", async () => {
    state.mfaRequired = true;
    expect(
      (
        await post({
          action: "change-password",
          currentPassword: "existing password",
          password: newPassword,
          confirmPassword: newPassword,
        })
      ).status,
    ).toBe(403);
    expect((await post({ action: "logout" }, "https://untrusted.example.test")).status).toBe(403);
    expect(state.session).toBe(true);
  });
});
