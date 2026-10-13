import { boolean, date, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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
