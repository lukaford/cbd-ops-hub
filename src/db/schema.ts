import { sql } from "drizzle-orm";
import { boolean, check, customType, date, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({ dataType: () => "bytea" });

export const importBatches = pgTable("import_batches", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  source: text("source").notNull().default("manager-special-orders"),
  rowCount: integer("row_count").notNull(),
  jobCount: integer("job_count").notNull(),
  folderCount: integer("folder_count").notNull(),
  droppedJobCount: integer("dropped_job_count").notNull().default(0),
});

export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  jobNumber: text("job_number").notNull().unique(),
  customer: text("customer").notNull(),
  description: text("description").notNull().default(""),
  address: text("address").notNull().default(""),
  city: text("city").notNull().default(""),
  zip: text("zip").notNull().default(""),
  designer: text("designer").notNull().default(""),
  installer: text("installer").notNull().default(""),
  contractOn: date("contract_on", { mode: "string" }),
  dueOn: date("due_on", { mode: "string" }),
  installOn: date("install_on", { mode: "string" }),
  amountCents: integer("amount_cents"),
  balanceCents: integer("balance_cents"),
  // False once a later Manager paste no longer lists the job (installed or cancelled).
  inLatestImport: boolean("in_latest_import").notNull().default(true),
  lastImportId: integer("last_import_id").references(() => importBatches.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const folders = pgTable(
  "folders",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    letter: text("letter").notNull().default(""),
    room: text("room").notNull().default(""),
    color: text("color").notNull().default(""),
    furthestStep: integer("furthest_step").notNull().default(0),
    nextStep: integer("next_step"),
    lastStep: integer("last_step"),
    lastDoneOn: date("last_done_on", { mode: "string" }),
    lastRef: text("last_ref"),
  },
  (t) => [uniqueIndex("folders_job_position").on(t.jobId, t.position)],
);

export const folderSteps = pgTable(
  "folder_steps",
  {
    id: serial("id").primaryKey(),
    folderId: integer("folder_id").notNull().references(() => folders.id, { onDelete: "cascade" }),
    step: integer("step").notNull(),
    doneOn: date("done_on", { mode: "string" }),
    ref: text("ref").notNull().default(""),
    eta: date("eta", { mode: "string" }),
    detail: text("detail").notNull().default(""),
    material: text("material").notNull().default(""),
  },
  (t) => [uniqueIndex("folder_steps_folder_step").on(t.folderId, t.step)],
);

export const specialOrders = pgTable("special_orders", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  item: text("item").notNull(),
  vendor: text("vendor").notNull().default(""),
  material: text("material").notNull().default(""),
  detail: text("detail").notNull().default(""),
  ref: text("ref").notNull().default(""),
  eta: date("eta", { mode: "string" }),
  receivedOn: date("received_on", { mode: "string" }),
});

// Read-only copy of JobTread, refreshed by replacing every row on each sync.
export const jobtreadSyncs = pgTable("jobtread_syncs", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  jobCount: integer("job_count").notNull(),
});

export const jobtreadJobs = pgTable("jobtread_jobs", {
  jobtreadId: text("jobtread_id").primaryKey(),
  jobNumber: text("job_number").notNull(),
  name: text("name").notNull().default(""),
  customer: text("customer").notNull().default(""),
  city: text("city").notNull().default(""),
  stage: text("stage"),
  stageSince: timestamp("stage_since", { withTimezone: true }),
  installOn: date("install_on", { mode: "string" }),
  installFieldOn: date("install_field_on", { mode: "string" }),
  apptOn: date("appt_on", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true }),
  installConfirmed: boolean("install_confirmed").notNull().default(false),
  cncCutOn: date("cnc_cut_on", { mode: "string" }),
  edgeBandingOn: date("edge_banding_on", { mode: "string" }),
  drawerAssemblyOn: date("drawer_assembly_on", { mode: "string" }),
  finalQaOn: date("final_qa_on", { mode: "string" }),
  materialsOrdered: boolean("materials_ordered"),
  materials: text("materials").array().notNull().default([]),
  orderBy: date("order_by", { mode: "string" }),
  syncId: integer("sync_id").notNull().references(() => jobtreadSyncs.id),
});

// Report setups people save from the Reports tab (filters, columns, sort as a query string).
export const savedReports = pgTable("saved_reports", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  query: text("query").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Blank forms uploaded on the Templates page: detail sheets (fillable PDFs) and
// work sheets (Excel). They hold company pricing, so they live only in the database.
export const formTemplates = pgTable("form_templates", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // "detail" | "worksheet"
  name: text("name").notNull(),
  room: text("room").notNull().default(""),
  revision: text("revision").notNull().default(""),
  position: integer("position").notNull().default(0),
  fileName: text("file_name").notNull(),
  file: bytea("file").notNull(),
  model: jsonb("model").notNull(),
  archived: boolean("archived").notNull().default(false),
  uploadedByUserId: integer("uploaded_by_user_id").references(() => users.id, { onDelete: "set null" }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

// One submission of a job's sale paperwork. A resubmission (for example after
// final measurements) is a new packet with the next version number.
export const paperworkPackets = pgTable("paperwork_packets", {
  id: serial("id").primaryKey(),
  jobtreadId: text("jobtread_id"),
  jobNumber: text("job_number").notNull(),
  customer: text("customer").notNull().default(""),
  city: text("city").notNull().default(""),
  designer: text("designer").notNull().default(""),
  version: integer("version").notNull().default(1),
  label: text("label").notNull().default("Sale Paperwork"),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("draft"), // "draft" | "submitted"
  createdByUserId: integer("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
});

export const paperworkDocs = pgTable("paperwork_docs", {
  id: serial("id").primaryKey(),
  packetId: integer("packet_id").notNull().references(() => paperworkPackets.id, { onDelete: "cascade" }),
  templateId: integer("template_id").notNull().references(() => formTemplates.id),
  title: text("title").notNull().default(""),
  position: integer("position").notNull().default(0),
  values: jsonb("values").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Photos or scans added to a packet, such as hand-drawn grids.
export const paperworkFiles = pgTable("paperwork_files", {
  id: serial("id").primaryKey(),
  packetId: integer("packet_id").notNull().references(() => paperworkPackets.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("grid"), // "grid" | "note" | "other"
  name: text("name").notNull(),
  contentType: text("content_type").notNull(),
  data: bytea("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// A signature with the evidence that ties it to exactly what was signed.
export const paperworkSignatures = pgTable("paperwork_signatures", {
  id: serial("id").primaryKey(),
  packetId: integer("packet_id").notNull().references(() => paperworkPackets.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "customer" | "designer"
  signerName: text("signer_name").notNull(),
  signerEmail: text("signer_email").notNull().default(""),
  // The signed-in account that signed, when there was one (staff, or a client on their own device).
  signerUserId: integer("signer_user_id").references(() => users.id, { onDelete: "set null" }),
  signerClientId: integer("signer_client_id").references(() => clients.id, { onDelete: "set null" }),
  image: text("image").notNull(), // PNG data URL of the drawn signature
  consent: text("consent").notNull(),
  contentHash: text("content_hash").notNull(),
  ip: text("ip").notNull().default(""),
  userAgent: text("user_agent").notNull().default(""),
  signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
});

// Open items on a packet: problems the checks found, or ones people add by hand.
export const paperworkIssues = pgTable("paperwork_issues", {
  id: serial("id").primaryKey(),
  packetId: integer("packet_id").notNull().references(() => paperworkPackets.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  createdBy: text("created_by").notNull().default(""),
  createdByUserId: integer("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  resolvedByUserId: integer("resolved_by_user_id").references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Accounts ----------------------------------------------------------------
// Staff sign in with email + password. Clients sign in with a one-time link, so
// they never manage a password. Permissions come from role + departments in code
// (src/lib/auth/permissions.ts), so a change of policy needs no migration.

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  // Stored lowercased; the sign-in name.
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  // Initials as written in Manager's REF column, to tie step sign-offs to a person.
  initials: text("initials").notNull().default(""),
  // "admin" (everything, manages accounts), "manager" (everything), "staff" (their departments).
  role: text("role").notNull().default("staff"),
  departments: text("departments").array().notNull().default([]),
  // Null until the person accepts their invite and picks a password.
  passwordHash: text("password_hash"),
  // Switched off instead of deleted, so their history keeps a name.
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),
});

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // Stored lowercased. Optional: a client can get a link by text instead.
  email: text("email").unique(),
  phone: text("phone").notNull().default(""),
  // JobTread customer, when known (read-only reference).
  jobtreadCustomerId: text("jobtread_customer_id"),
  active: boolean("active").notNull().default(true),
  createdByUserId: integer("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),
});

// Which jobs a client may see. By job number, because the JobTread copy and the
// Manager paste are both rebuilt on every refresh.
export const clientJobs = pgTable(
  "client_jobs",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    jobNumber: text("job_number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("client_jobs_client_job").on(t.clientId, t.jobNumber), index("client_jobs_job").on(t.jobNumber)],
);

// One row per signed-in browser. Only a hash of the cookie is kept, and deleting
// the row signs that browser out (switching a user off deletes all of theirs).
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: serial("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
    clientId: integer("client_id").references(() => clients.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent").notNull().default(""),
  },
  (t) => [check("auth_sessions_one_owner", sql`(${t.userId} is null) <> (${t.clientId} is null)`)],
);

// One-time links: staff invites, password resets and client sign-in links.
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: serial("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    // "staff_invite" | "password_reset" | "client_login"
    purpose: text("purpose").notNull(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
    clientId: integer("client_id").references(() => clients.id, { onDelete: "cascade" }),
    createdByUserId: integer("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [check("auth_tokens_one_owner", sql`(${t.userId} is null) <> (${t.clientId} is null)`)],
);

// Who did what, for sign-ins, account changes and later signatures and approvals.
export const auditEvents = pgTable(
  "audit_events",
  {
    id: serial("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorClientId: integer("actor_client_id").references(() => clients.id, { onDelete: "set null" }),
    // e.g. "sign_in", "sign_in_failed", "user_invited", "client_link_created"
    action: text("action").notNull(),
    entity: text("entity").notNull().default(""),
    entityId: text("entity_id").notNull().default(""),
    data: jsonb("data").notNull().default({}),
    ip: text("ip").notNull().default(""),
  },
  (t) => [index("audit_events_at").on(t.at), index("audit_events_entity").on(t.entity, t.entityId)],
);
