import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.PHASE26_SUPABASE_URL;
const anonKey = process.env.PHASE26_ANON_KEY;
const serviceKey = process.env.PHASE26_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error("PHASE26_SUPABASE_URL, PHASE26_ANON_KEY and PHASE26_SERVICE_ROLE_KEY are required");
}

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const password = `P26!${randomUUID()}aA1`;
const createdUsers = [];
const createdProfessionals = [];
const createdClients = [];
const createdBroadcasts = [];
const createdMembers = [];
const passes = [];

function pass(message) {
  passes.push(message);
  console.log(`PASS ${message}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL ${message}`);
  pass(message);
}

async function createUser(label, options = {}) {
  const email = options.email ?? `phase26-${label}-${suffix}@example.test`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: options.user_metadata ?? { name: `Phase 26 ${label}` },
    app_metadata: options.app_metadata ?? {},
  });
  if (error || !data.user) throw error ?? new Error(`create_user_${label}_failed`);
  createdUsers.push(data.user.id);
  return { id: data.user.id, email };
}

async function userClient(email) {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error("sign_in_failed");
  return { client, token: data.session.access_token };
}

async function invoke(functionName, body, token = anonKey, headers = {}) {
  const response = await fetch(`${url}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { status: response.status, data };
}

async function cleanup() {
  for (const id of createdBroadcasts) {
    await service.from("platform_broadcast_recipients").delete().eq("broadcast_id", id);
    await service.from("platform_admin_audit_log").delete().eq("entity_id", id);
    await service.from("platform_broadcasts").delete().eq("id", id);
  }
  for (const id of createdClients) await service.from("clients").delete().eq("id", id);
  for (const id of createdMembers) await service.from("team_members").delete().eq("id", id);
  for (const id of createdProfessionals) {
    await service.from("professional_agents").delete().eq("professional_id", id);
    await service.from("professionals").delete().eq("id", id);
  }
  for (const id of createdUsers) {
    await service.from("user_roles").delete().eq("user_id", id);
    await service.from("master_admins").delete().eq("user_id", id);
    await service.auth.admin.deleteUser(id);
  }
}

async function cleanupStaleFixtures() {
  const { data } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const stale = data.users.filter((user) => user.email?.startsWith("phase26-") && user.email.endsWith("@example.test"));
  const ids = stale.map((user) => user.id);
  if (ids.length === 0) return;
  const { data: professionals } = await service.from("professionals").select("id").in("user_id", ids);
  const professionalIds = (professionals ?? []).map(({ id }) => id);
  if (professionalIds.length > 0) {
    await service.from("clients").delete().in("professional_id", professionalIds);
    await service.from("team_members").delete().in("professional_id", professionalIds);
    await service.from("professional_agents").delete().in("professional_id", professionalIds);
    await service.from("professionals").delete().in("id", professionalIds);
  }
  await service.from("team_members").delete().in("user_id", ids);
  await service.from("user_roles").delete().in("user_id", ids);
  await service.from("master_admins").delete().in("user_id", ids);
  for (const id of ids) await service.auth.admin.deleteUser(id);
}

try {
  await cleanupStaleFixtures();
  const ownerA = await createUser("owner-a");
  const ownerB = await createUser("owner-b");
  createdProfessionals.push(ownerA.id, ownerB.id);
  const { error: activateOwnersError } = await service
    .from("professionals")
    .update({ onboarding_completed: true, onboarding_essentials_completed: true })
    .in("id", [ownerA.id, ownerB.id]);
  if (activateOwnersError) throw activateOwnersError;

  const external = await createUser("external");
  const admin = await createUser("admin");
  await service.from("professional_agents").delete().in("professional_id", [external.id, admin.id]);
  const { error: removeExternalTenantsError } = await service
    .from("professionals")
    .delete()
    .in("id", [external.id, admin.id]);
  if (removeExternalTenantsError) throw removeExternalTenantsError;
  const { error: masterError } = await service.from("master_admins").insert({
    user_id: admin.id,
    email: admin.email,
    name: "Phase 26 Admin",
  });
  if (masterError) throw masterError;
  const { error: roleError } = await service.from("user_roles").insert({ user_id: admin.id, role: "admin_master" });
  if (roleError) throw roleError;

  const memberEmail = `phase26-operational-${suffix}@example.test`;
  const { data: member, error: memberError } = await service
    .from("team_members")
    .insert({
      professional_id: ownerA.id,
      name: "Phase 26 Operational",
      email: memberEmail,
      nivel_acesso: "operacional",
      is_active: true,
    })
    .select("id")
    .single();
  if (memberError) throw memberError;
  createdMembers.push(member.id);
  await createUser("operational", {
    email: memberEmail,
    user_metadata: {
      name: "Phase 26 Operational",
      professional_id: ownerA.id,
      team_member_id: member.id,
      role: "operacional",
    },
  });

  const [{ client: clientA }, { client: clientB }, { client: operational }, { client: externalClient }, adminAuth] =
    await Promise.all([
      userClient(ownerA.email),
      userClient(ownerB.email),
      userClient(memberEmail),
      userClient(external.email),
      userClient(admin.email),
    ]);

  const clientAId = randomUUID();
  const clientBId = randomUUID();
  createdClients.push(clientAId, clientBId);
  const { error: fixtureError } = await service.from("clients").insert([
    {
      id: clientAId,
      professional_id: ownerA.id,
      full_name: `P26 Client A ${suffix}`,
      phone_whatsapp: "551199990001",
      source: "manual",
    },
    {
      id: clientBId,
      professional_id: ownerB.id,
      full_name: `P26 Client B ${suffix}`,
      phone_whatsapp: "551199990002",
      source: "manual",
    },
  ]);
  if (fixtureError) throw fixtureError;

  const [roleA, roleB, roleOperational, roleExternal] = await Promise.all([
    clientA.rpc("auth_professional_role"),
    clientB.rpc("auth_professional_role"),
    operational.rpc("auth_professional_role"),
    externalClient.rpc("auth_professional_role"),
  ]);
  assert(roleA.data === "gestor" && roleB.data === "gestor", "owners resolve as gestor");
  assert(roleOperational.data === "operacional", "team member resolves as operacional");
  assert(
    roleExternal.data == null && (!roleExternal.error || roleExternal.error.code === "PGRST116"),
    `external authenticated user has no professional role (${roleExternal.data ?? roleExternal.error?.code ?? "none"})`,
  );

  const [rowsA, rowsB, rowsOperational, rowsExternal] = await Promise.all([
    clientA.from("clients").select("id"),
    clientB.from("clients").select("id"),
    operational.from("clients").select("id"),
    externalClient.from("clients").select("id"),
  ]);
  assert(rowsA.data?.some(({ id }) => id === clientAId) && !rowsA.data?.some(({ id }) => id === clientBId), "gestor A reads only tenant A clients");
  assert(rowsB.data?.some(({ id }) => id === clientBId) && !rowsB.data?.some(({ id }) => id === clientAId), "gestor B reads only tenant B clients");
  assert(rowsOperational.data?.some(({ id }) => id === clientAId) && !rowsOperational.data?.some(({ id }) => id === clientBId), "operacional reads only owner tenant clients");
  assert((rowsExternal.data?.length ?? 0) === 0, "external authenticated user reads no clients");

  const professionalRows = await operational.from("professionals").select("id,evolution_instance_token,document_cpf_cnpj,stripe_customer_id");
  assert((professionalRows.data?.length ?? 0) === 0, "operacional cannot read professionals owner row or secrets");

  const crossTenantMutation = await clientA.from("clients").update({ full_name: "IDOR failure" }).eq("id", clientBId).select("id");
  assert(
    Boolean(crossTenantMutation.error) || (crossTenantMutation.data?.length ?? 0) === 0,
    "cross-tenant update is denied or affects zero rows",
  );

  const [adminDashboard, nonAdminDashboard] = await Promise.all([
    adminAuth.client.rpc("get_admin_dashboard_rpc"),
    clientA.rpc("get_admin_dashboard_rpc"),
  ]);
  assert(!adminDashboard.error && adminDashboard.data, "admin master executes admin dashboard contract");
  assert(Boolean(nonAdminDashboard.error), "non-admin cannot execute admin dashboard contract");

  const [growthGestor, growthOperational] = await Promise.all([
    clientA.rpc("phase21_get_growth_dashboard"),
    operational.rpc("phase21_get_growth_dashboard"),
  ]);
  assert(!growthGestor.error, "gestor executes gestor-only growth contract");
  assert(Boolean(growthOperational.error), "operacional is denied gestor-only growth contract");

  const { data: professionalA } = await service.from("professionals").select("slug").eq("id", ownerA.id).single();
  const publicValid = await invoke("public-booking-handler", { mode: "get_context", slug: professionalA.slug });
  const publicInvalid = await invoke("public-booking-handler", { mode: "get_context", slug: `missing-${suffix}` });
  assert(
    publicValid.status === 200,
    `public booking valid slug returns 200 (received ${publicValid.status})`,
  );
  assert(
    publicInvalid.status === 404,
    `public booking invalid slug returns curated 404 (received ${publicInvalid.status})`,
  );

  let rateLimited = false;
  for (let attempt = 0; attempt < 65; attempt += 1) {
    const result = await invoke("public-booking-handler", { mode: "get_context", slug: `rate-${suffix}` });
    if (result.status === 429) {
      rateLimited = true;
      break;
    }
  }
  assert(rateLimited, "public booking returns 429 after canonical limit");

  const idempotencyKey = `phase26:${suffix}`;
  const dryRunInput = {
    target: "trial_professionals",
    message: "Phase 26 dry-run only",
    limit: 1,
    dry_run: true,
    reason: "phase26_live_validation",
    idempotency_key: idempotencyKey,
  };
  const firstDryRun = await invoke("admin-broadcast", dryRunInput, adminAuth.token, { "x-dry-run": "true" });
  const replayDryRun = await invoke("admin-broadcast", dryRunInput, adminAuth.token, { "x-dry-run": "true" });
  assert(firstDryRun.status === 200 && firstDryRun.data?.dry_run === true, "admin broadcast executes in dry-run");
  assert(replayDryRun.data?.broadcast_id === firstDryRun.data?.broadcast_id && replayDryRun.data?.reason === "idempotent_replay", "admin broadcast idempotency replay reuses broadcast");
  createdBroadcasts.push(firstDryRun.data.broadcast_id);

  const queueBroadcastId = randomUUID();
  const recipientId = randomUUID();
  createdBroadcasts.push(queueBroadcastId);
  const { error: broadcastError } = await service.from("platform_broadcasts").insert({
    id: queueBroadcastId,
    created_by: admin.id,
    audience_type: "all_professionals",
    channel: "whatsapp",
    message: "Phase 26 queue validation",
    status: "queued",
    dry_run: false,
    reason: "phase26_queue_validation",
    idempotency_key: `phase26-queue:${suffix}`,
  });
  if (broadcastError) throw broadcastError;
  const { error: recipientError } = await service.from("platform_broadcast_recipients").insert({
    id: recipientId,
    broadcast_id: queueBroadcastId,
    professional_id: ownerA.id,
    channel: "whatsapp",
    destination_masked: "***0001",
    status: "queued",
    max_attempts: 2,
  });
  if (recipientError) throw recipientError;

  const lockOne = randomUUID();
  const firstClaim = await service.rpc("phase24_claim_broadcast_batch", {
    p_broadcast_id: queueBroadcastId,
    p_limit: 1,
    p_lock_token: lockOne,
  });
  const duplicateClaim = await service.rpc("phase24_claim_broadcast_batch", {
    p_broadcast_id: queueBroadcastId,
    p_limit: 1,
    p_lock_token: randomUUID(),
  });
  assert(firstClaim.data?.items?.length === 1 && duplicateClaim.data?.items?.length === 0, "queue claim is exclusive and idempotent while locked");

  const wrongLock = await service.rpc("phase24_complete_broadcast_recipient", {
    p_recipient_id: recipientId,
    p_lock_token: randomUUID(),
    p_success: false,
    p_error: "phase26_expected_failure",
  });
  assert(Boolean(wrongLock.error), "queue completion rejects wrong lock token");

  const firstFailure = await service.rpc("phase24_complete_broadcast_recipient", {
    p_recipient_id: recipientId,
    p_lock_token: lockOne,
    p_success: false,
    p_error: "phase26_expected_failure",
  });
  assert(firstFailure.data?.recipient_status === "retrying", "queue failure schedules retry before max attempts");
  await service.from("platform_broadcast_recipients").update({ next_attempt_at: new Date(0).toISOString() }).eq("id", recipientId);
  const lockTwo = randomUUID();
  const secondClaim = await service.rpc("phase24_claim_broadcast_batch", {
    p_broadcast_id: queueBroadcastId,
    p_limit: 1,
    p_lock_token: lockTwo,
  });
  const terminalFailure = await service.rpc("phase24_complete_broadcast_recipient", {
    p_recipient_id: recipientId,
    p_lock_token: lockTwo,
    p_success: false,
    p_error: "phase26_expected_terminal_failure",
  });
  assert(secondClaim.data?.items?.length === 1 && terminalFailure.data?.recipient_status === "dead_letter", "queue reaches dead_letter at max attempts");

  console.log(`Phase 26 live audit: ${passes.length} checks passed.`);
} finally {
  await cleanup();
}
