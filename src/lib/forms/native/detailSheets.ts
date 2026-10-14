// The six rev 8-2026c detail sheets as built-in forms. Sections follow the paper
// sheet top to bottom; keys are stable so saved answers survive label changes.

import * as O from "./options";
import type { DetailFormDef, FormField, FormSection } from "./types";

const text = (key: string, label: string, extra: Partial<FormField> = {}): FormField => ({ key, label, type: "text", ...extra });
const num = (key: string, label: string, extra: Partial<FormField> = {}): FormField => ({ key, label, type: "number", ...extra });
const check = (key: string, label: string, extra: Partial<FormField> = {}): FormField => ({ key, label, type: "check", ...extra });
const choice = (key: string, label: string, options: string[], extra: Partial<FormField> = {}): FormField => ({ key, label, type: "choice", options, ...extra });
const checks = (key: string, label: string, options: string[], extra: Partial<FormField> = {}): FormField => ({ key, label, type: "checks", options, ...extra });
const select = (key: string, label: string, options: string[], extra: Partial<FormField> = {}): FormField => ({ key, label, type: "select", options, ...extra });
const yesNo = (key: string, label: string, extra: Partial<FormField> = {}) => choice(key, label, O.YES_NO, extra);

// A quantity with its pick list, as "___ Tie Rack [12" D ...]" on paper.
const item = (key: string, label: string, options?: string[], optionLabel = "Type"): FormField[] =>
  options ? [num(`${key}_qty`, label), select(key, `${label}: ${optionLabel}`, options)] : [num(`${key}_qty`, label)];

const otherLines = (prefix: string, n: number): FormField[] =>
  Array.from({ length: n }, (_, i) => [num(`${prefix}${i + 1}_qty`, `Other item ${i + 1}: qty`), text(`${prefix}${i + 1}`, `Other item ${i + 1}: description`)]).flat();

function header(): FormSection {
  return {
    key: "header",
    title: "Client and room",
    fields: [
      text("client", "Client name", { prefill: "customer" }),
      text("room", "Room / location", { prefill: "room" }),
      text("designer", "Designer", { prefill: "designer" }),
      { key: "date", label: "Date submitted", type: "date", prefill: "date" },
      text("job", "Job #", { prefill: "jobNumber" }),
      select("color", "Color", O.COLORS),
      select("collection", "Collection", O.COLLECTIONS),
      select("tear_out", "Tear out", O.TEAR_OUT),
      check("pics_in_jobtread", "Pics in JobTread"),
    ],
  };
}

function baseBoards(options: string[], extra: FormField[] = [], note?: string): FormSection {
  return {
    key: "base_boards",
    title: "Existing base boards",
    note,
    fields: [
      choice("base_boards", "Existing base boards", options, { wide: true }),
      text("base_material", "Material (wood, tile, etc.)"),
      text("base_height", "Height"),
      text("base_depth", "Depth"),
      ...extra,
    ],
  };
}

const cabinetBacking = (): FormSection => ({
  key: "cabinet_backing",
  title: "Cabinet backing type",
  note: 'Standard = 1/4" white backing. Matching cabinet back = 3/4" upgrade, or on cabinets without doors.',
  fields: [check("backing_standard", "Standard"), num("backing_standard_qty", "Standard: qty"), check("backing_matching", "Matching cabinet back"), num("backing_matching_qty", "Matching cabinet back: qty")],
});

const FRONTS = ["Flat Front", "Deco Front"];

function handleFields(handles: string[]): FormField[] {
  return [
    select("handle_options", "Handle options", O.HANDLE_OPTIONS, { hint: "Client-provided handles are due in the office 2 weeks before install." }),
    select("handle_sku", "Standard handles: SKU", handles),
    select("knob_sku", "Standard knobs: SKU", O.KNOBS),
  ];
}

// Closet and pantry: one kind of door.
function closetDoors(): FormSection {
  return {
    key: "doors",
    title: "Doors and drawers",
    fields: [
      num("doors_qty", "Doors: amount"),
      num("doors_handles", "Doors: handles"),
      num("doors_knobs", "Doors: knobs"),
      num("drawers_qty", "Drawers: amount"),
      num("drawers_handles", "Drawers: handles"),
      num("drawers_knobs", "Drawers: knobs"),
      checks("door_fronts", "Doors", FRONTS),
      select("door_deco_style", "Door deco style", O.DECO_DOOR_STYLES),
      select("door_color", "Door color", O.DECO_COLORS),
      select("insert_type", "Insert type", O.INSERT_TYPES),
      select("insert_style", "Insert style", O.INSERT_STYLES),
      checks("drawer_fronts", "Drawers", FRONTS),
      select("drawer_deco_style", "Drawer deco style", O.DECO_DRAWER_STYLES),
      select("drawer_color", "Drawer color", O.DECO_COLORS),
      choice("drawer_box", "Drawer box color", ["Standard WHITE", "Other color"]),
      select("drawer_box_color", "Drawer box: other color", O.COLORS_ALL),
      ...handleFields(O.HANDLES),
    ],
  };
}

// Office, laundry and garage: hinged and by-pass doors, extruded pulls.
function cabinetDoors(opts: { bypassStyles: string[]; drawerBoxColors: string[]; handles: string[] }): FormSection {
  return {
    key: "doors",
    title: "Doors and drawers",
    fields: [
      num("doors_qty", "Doors: amount"),
      num("doors_handles", "Doors: handles"),
      num("doors_knobs", "Doors: knobs"),
      num("doors_extruded", "Doors: extruded pull"),
      num("drawers_qty", "Drawers: amount"),
      num("drawers_handles", "Drawers: handles"),
      num("drawers_knobs", "Drawers: knobs"),
      checks("door_fronts", "Doors, hinged", FRONTS),
      select("door_deco_style", "Hinged doors: deco style", O.DECO_DOOR_STYLES),
      select("door_color", "Hinged doors: color", O.DECO_COLORS),
      checks("bypass_fronts", "Doors, by-pass", FRONTS),
      select("bypass_deco_style", "By-pass doors: deco style", opts.bypassStyles),
      select("bypass_color", "By-pass doors: color", O.DECO_COLORS),
      select("insert_type", "Insert type", O.INSERT_TYPES),
      select("insert_style", "Insert style", O.INSERT_STYLES),
      checks("drawer_fronts", "Drawers", FRONTS),
      select("drawer_deco_style", "Drawer deco style", O.DECO_DRAWER_STYLES),
      select("drawer_color", "Drawer color", O.DECO_COLORS),
      choice("drawer_box", "Drawer box color", ["Standard WHITE", "Other color"]),
      select("drawer_box_color", "Drawer box: other color", opts.drawerBoxColors),
      ...handleFields(opts.handles),
    ],
  };
}

const specialtyHandles = (): FormSection => ({
  key: "specialty_handles",
  title: "TAG and all specialty handles / knobs",
  fields: [text("tag_handles", "Handle / knob", { wide: true }), text("tag_sku", "SKU"), text("tag_size", "Size")],
});

function moldingSection(withBacking: boolean): FormSection {
  return {
    key: "molding",
    title: "Molding, accent top shelf and backing",
    fields: [
      select("crown_molding", "Crown molding", O.CROWN_MOLDING),
      select("base_molding", "Base molding", O.BASE_MOLDING),
      yesNo("ats", "Accent top shelf (ATS)"),
      select("ats_color", "ATS color", O.COLORS),
      yesNo("face_frame", "Face frame"),
      select("face_frame_color", "Face frame color", O.COLORS_ALL),
      ...(withBacking ? [yesNo("backing", '3/4" backing'), select("backing_color", '3/4" backing color', O.COLORS_ALL)] : []),
    ],
  };
}

function countertops(list: string[]): FormSection {
  return {
    key: "countertops",
    title: "Countertops",
    note: 'Melamine countertops maximum 95-1/4" long, rectangle only.',
    fields: [
      select("countertop", "Countertop", list, { wide: true }),
      select("edge_banding", "Edge banding", O.EDGE_BANDING),
      check("butcher_block", 'Butcher block 1-1/2" thick'),
      select("butcher_block_size", "Butcher block size", O.BUTCHER_BLOCK_SIZES),
      text("countertop_color", "Countertop color / name"),
      text("countertop_number", "Number"),
      yesNo("template", "Template"),
      yesNo("backsplash", "Backsplash for countertops"),
    ],
  };
}

const baskets = (): FormField[] =>
  ["6", "11", "17"].flatMap((h) => [
    num(`baskets_${h}h_qty`, `${h}"h baskets`),
    num(`baskets_${h}h_12d_qty`, `${h}"h baskets, 12"d: qty`),
    select(`baskets_${h}h_12d`, `${h}"h baskets, 12"d: size`, O.BASKETS_12D),
    num(`baskets_${h}h_16d_qty`, `${h}"h baskets, 16"d: qty`),
    select(`baskets_${h}h_16d`, `${h}"h baskets, 16"d: size`, O.BASKETS_16D),
  ]);

const grommets = (): FormField[] => [
  num("grommets_qty", "Grommets"),
  select("grommets_dbl", "Grommets: double square", O.GROMMETS_DBL),
  select("grommets_sngl", "Grommets: single", O.GROMMETS_SNGL),
  select("grommets_rnd", "Grommets: round", O.GROMMETS_RND),
];

const canvasLiners = () => num("canvas_liners_qty", 'Canvas liners for sliding baskets (16"d sections only)', { wide: true });

const lighting = (): FormSection => ({ key: "lighting", title: "Lighting", note: "Lighting information goes on the lighting detail sheet.", fields: [] });

function siteSection(): FormSection {
  return {
    key: "site",
    title: "Measurements and site",
    fields: [
      yesNo("measurements_final", "Measurements final"),
      { key: "measurements_final_date", label: "If not final, date they will be final", type: "date" },
      yesNo("obstacles_impacting", "Any obstacles impacting design"),
      yesNo("obstacles_noted", "All obstacles noted and plotted"),
      text("property_type", "Type of property"),
      text("floor", "Floor"),
      yesNo("van_parking", "Is parking available for van"),
      yesNo("service_elevator", "Is there a service elevator"),
      { key: "special_notes", label: "Special notes", type: "textarea", wide: true },
    ],
  };
}

const rack = (key: string, label: string): FormField[] => [
  num(`${key}_12_qty`, `${label} 12"D: qty`),
  select(`${key}_12`, `${label} 12"D: finish`, O.RACK_FINISHES),
  num(`${key}_14_qty`, `${label} 14"D: qty`),
  select(`${key}_14`, `${label} 14"D: finish`, O.RACK_FINISHES),
];

const closet: DetailFormDef = {
  key: "closet-detail",
  kind: "detail",
  room: "Closet",
  name: "Closet Detail Sheet",
  revision: "rev 8-2026c",
  position: 110,
  sections: [
    header(),
    baseBoards(["None", "Remove", "Notch"]),
    closetDoors(),
    specialtyHandles(),
    moldingSection(true),
    countertops(O.COUNTERTOPS),
    {
      key: "rods",
      title: "Rods and special items",
      fields: [
        num("rods_qty", "Rods"),
        num("oval_chrome_qty", "Oval chrome"),
        num("round_rods_qty", "Round rods"),
        select("rod_color", "Rod color", O.ROD_FINISHES),
        ...rack("tie_rack", "Tie rack"),
        ...rack("belt_rack", "Belt rack"),
        ...rack("valet_rod", "Valet rod"),
        ...rack("scarf_rack", "Scarf rack"),
        num("valet_pin_qty", "Valet pin"),
        select("valet_pin_color", "Valet pin: color", O.RACK_FINISHES),
        num("reach_pole_qty", "Reach pole (chrome only)"),
        num("pulldown_rods_qty", "Pulldown rods"),
        num("pdr1_qty", "PDR-1"),
        num("pdr2_qty", "PDR-2"),
        num("pdr3_qty", "PDR-3"),
        ...grommets(),
        ...item("ironing", "Ironing", O.IRONING),
        num("mirror_qty", "Mirror"),
        select("mirror_wall", "Mirror: wall", O.MIRRORS),
        select("mirror_rotating", "Mirror: rotating", O.MIRRORS),
        num("slanted_shoe_qty", "Slanted shoe shelves"),
        select("toe_stops", "Slanted shoe shelves: toe stops", O.TOE_STOPS),
        select("fence_stops", "Fence", O.FENCE_STOPS),
        select("rail_stops", "Rail", O.RAIL_STOPS),
        num("flat_shelf_lip_qty", "Flat shelf w/ lip"),
        text("flat_shelf_lip", "Flat shelf w/ lip: details"),
        num("pull_out_tray_qty", "Pull out tray"),
        num("pullout_shelf_qty", "Pullout shelf"),
        num("pullout_shelf_lip_qty", "With melamine front lip"),
        ...item("synergy_hampers", "Synergy nylon bag hampers", O.SYNERGY_HAMPERS),
        ...item("wire_hampers", "Wire basket tiltout hampers", O.WIRE_HAMPERS),
        num("wire_hamper_liners_qty", "Wire basket hamper canvas liners"),
        ...item("slideout_hamper", "Slideout hamper", O.SLIDEOUT_HAMPERS),
        ...item("jewelry_single", "Single jewelry tray", O.JEWELRY_SINGLE),
        ...item("jewelry_double", "Double jewelry tray", O.JEWELRY_DOUBLE),
        ...item("velvet_tray", "Velvet tray, no dividers", O.VELVET_TRAYS),
        num("velvet_drawer_bottom_qty", "Velvet drawer bottom (all widths, black only)"),
        num("door_locks_qty", "Locks for doors (front only)"),
        num("drawer_locks_qty", "Locks for drawers"),
        checks("drawer_locks", "Drawer locks", ["Front", "Side"]),
        ...baskets(),
        canvasLiners(),
        ...otherLines("other", 3),
      ],
    },
    lighting(),
    siteSection(),
  ],
};

const pantry: DetailFormDef = {
  key: "pantry-detail",
  kind: "detail",
  room: "Pantry",
  name: "Pantry Detail Sheet",
  revision: "rev 8-2026c",
  position: 210,
  sections: [
    header(),
    baseBoards(["None", "Remove", "Notch"]),
    closetDoors(),
    specialtyHandles(),
    moldingSection(true),
    countertops(O.COUNTERTOPS),
    {
      key: "addons",
      title: "Pantry add-ons",
      fields: [
        num("wine_bottle_holders_qty", "Wine bottle holders (set of 3)"),
        num("wine_pegs_4_qty", "Wine pegs (set of 4)"),
        num("wine_pegs_6_qty", "Wine pegs (set of 6)"),
        num("x_wine_racks_qty", "X-wine racks"),
        select("x_wine_rack_color", "X-wine racks: color", O.COLORS),
        select("x_wine_rack", "X-wine racks: size", O.X_WINE_RACKS),
        ...item("sliding_wine", "Sliding wine racks", O.SLIDING_WINE, "Size"),
        ...item("sliding_spice", "Sliding spice racks", O.SLIDING_SPICE, "Size"),
        ...item("lattice_wine", "Wood lattice wine racks (maple / raw wood)", O.LATTICE_WINE, "Size"),
        select("scallop_color", "Melamine wine scallops: color", O.SCALLOP_COLORS),
        ...item("wine_scallops", "Melamine wine scallops", O.WINE_SCALLOPS, "Size"),
        num("pull_out_shelf_qty", "Pull out shelf"),
        num("pull_out_shelf_lip_qty", "With melamine lip"),
        num("pull_out_tray_qty", "Pull out tray"),
        ...item("slanted_can", "Slanted can shelves", O.CAN_SHELF_LIPS, "Lip"),
        ...item("flat_can", "Flat can shelves", O.CAN_SHELF_LIPS, "Lip"),
        num("lucite_dividers_qty", "Lucite dividers"),
        num("lucite_clear_qty", "Lucite dividers: clear"),
        num("lucite_matte_qty", "Lucite dividers: matte"),
        num("drawer_locks_qty", "Locks for drawers"),
        num("drawer_locks_front_qty", "Locks for drawers: front"),
        num("drawer_locks_side_qty", "Locks for drawers: side"),
        num("door_locks_qty", "Locks for doors (front only)"),
        ...baskets(),
        canvasLiners(),
        ...grommets(),
        ...otherLines("other", 4),
      ],
    },
    lighting(),
    siteSection(),
  ],
};

function officeLike(room: "Office" | "Laundry"): DetailFormDef {
  const laundry = room === "Laundry";
  return {
    key: `${room.toLowerCase()}-detail`,
    kind: "detail",
    room,
    name: `${room} Detail Sheet`,
    revision: "rev 8-2026c",
    position: laundry ? 510 : 310,
    sections: [
      header(),
      laundry
        ? baseBoards(["None installed", "Remove", "See option below"], [], "Laundry rooms are exclusive to garage cabinets, all on AXILO legs. Accent top shelf included.")
        : baseBoards(["None installed", "Remove", "See option below"], [check("office_option", 'Office option: install cabinets 1-1/2" from wall (remove only the quarter round molding)', { wide: true, hint: "Leaves a gap behind the cabinets that will not be filled." })]),
      cabinetBacking(),
      cabinetDoors({ bypassStyles: O.BYPASS_DOOR_STYLES, drawerBoxColors: O.COLORS_ALL, handles: O.CABINET_HANDLES }),
      specialtyHandles(),
      moldingSection(false),
      countertops(laundry ? O.COUNTERTOPS : O.OFFICE_COUNTERTOPS),
      {
        key: "base_type",
        title: "Base type and wall backing",
        fields: [
          laundry
            ? check("axilo_legs", "AXILO legs with toe kick", { hint: "All tall and base cabinets are on AXILO legs only." })
            : choice("base_type", "Base type", ["Floor based", 'Floating (24" deep maximum)']),
          yesNo("wall_backing", '3/4" wall backing between upper and lower cabinets (horizontal grain)', { wide: true }),
        ],
      },
      {
        key: "file_drawers",
        title: "File drawers",
        fields: [
          num("letter_f2b_qty", "Letter front to back"),
          num("letter_lateral_qty", "Letter lateral"),
          num("double_letter_qty", "Double letter"),
          num("legal_f2b_qty", "Legal front to back"),
          num("legal_lateral_qty", "Legal lateral"),
          num("double_legal_qty", "Double legal"),
          select("file_backing_color", "Backing color", O.COLORS_ALL),
        ],
      },
      {
        key: "accessories",
        title: "Accessories",
        fields: [
          num("pull_out_shelf_qty", "Pull out shelf"),
          num("pull_out_shelf_lip_qty", "With melamine front lip"),
          num("pull_out_tray_qty", "Pull out tray"),
          num("keyboard_tray_qty", "Keyboard tray"),
          ...grommets(),
          num("pop_up_grommet_qty", "Pop up grommet"),
          num("valance_qty", "Valance"),
          select("valance_color", "Valance: color", O.COLORS),
          ...(laundry ? item("ironing", "Ironing boards", O.IRONING) : []),
          num("door_locks_qty", "Locks for doors (front only)"),
          num("electronic_lock_qty", "Electronic lock"),
          num("drawer_locks_qty", "Locks for drawers"),
          checks("drawer_locks", "Drawer locks", ["Front", "Side"]),
          num("rods_qty", "Rods"),
          num("oval_chrome_qty", "Oval chrome"),
          num("round_rods_qty", "Round"),
          select("rod_color", "Rod color", O.ROD_FINISHES),
          ...baskets(),
          canvasLiners(),
          ...otherLines("other", 3),
        ],
      },
      lighting(),
      siteSection(),
    ],
  };
}

const garage: DetailFormDef = {
  key: "garage-detail",
  kind: "detail",
  room: "Garage",
  name: "Garage Detail Sheet",
  revision: "rev 8-2026c",
  position: 410,
  sections: [
    header(),
    {
      key: "garage_door",
      title: "Garage door obstacle and mudsill",
      fields: [
        ...["A", "B", "C", "D", "E"].map((l) => text(`door_obstacle_${l.toLowerCase()}`, `Garage door obstacle ${l}`)),
        text("mudsill_front", "Mudsill height: front of garage"),
        text("mudsill_back", "Mudsill height: back of garage"),
        text("mudsill_depth", "Mudsill depth"),
      ],
    },
    baseBoards(["None installed", "Remove"]),
    cabinetBacking(),
    cabinetDoors({ bypassStyles: O.GARAGE_BYPASS_STYLES, drawerBoxColors: O.COLORS, handles: O.CABINET_HANDLES }),
    specialtyHandles(),
    {
      key: "molding",
      title: "Molding, backing and accent top shelf",
      fields: [
        select("crown_molding", "Molding", O.CROWN_MOLDING),
        check("backing", '3/4" backing'),
        select("backing_color", '3/4" backing color', O.COLORS),
        yesNo("face_frame", "Face frame"),
        select("face_frame_color", "Face frame color", O.COLORS),
        yesNo("ats", "Accent top shelf (ATS)"),
        select("ats_color", "ATS color", O.COLORS),
      ],
    },
    countertops(O.COUNTERTOPS),
    {
      key: "base_type",
      title: "Base type and extrusions",
      note: "Garage flooring information goes on the garage flooring detail sheet.",
      fields: [
        select("base_type", "Base type", O.GARAGE_BASE_TYPES),
        select("extrusions", "Extrusions", O.EXTRUSIONS),
        check("door_extrusions", "Extra charge: add extrusions to doors"),
        num("door_extrusions_qty", "Extrusions on doors: qty"),
      ],
    },
    {
      key: "design_wall",
      title: "Design wall and special items",
      note: "Use the Design Wall accessory sheet to document chosen accessories.",
      fields: [
        select("design_wall_color", "Design wall color", O.DESIGN_WALL_COLORS),
        ...baskets(),
        num("pull_out_shelf_qty", "Pull out shelf"),
        num("pull_out_shelf_lip_qty", "With melamine front lip"),
        num("pull_out_tray_qty", "Pull out tray"),
        ...grommets(),
        canvasLiners(),
        num("rods_qty", "Rods"),
        num("oval_chrome_qty", "Oval chrome"),
        num("round_rods_qty", "Round"),
        select("rod_color", "Rod color", O.GARAGE_ROD_COLORS),
        num("door_locks_qty", "Locks for doors"),
        num("drawer_locks_qty", "Locks for drawers"),
        checks("drawer_locks", "Drawer locks", ["Front", "Side"]),
        num("open_shelving_qty", "Open shelving (draw shelving on designs)"),
        num("gambis_qty", "Gambis brackets"),
        select("gambis_color", "Gambis brackets: color", O.GAMBIS_COLORS),
        num("hebgo_qty", "Hebgo brackets"),
        select("hebgo_color", "Hebgo brackets: color", O.HEBGO_COLORS),
        ...otherLines("other", 4),
      ],
    },
    lighting(),
    siteSection(),
  ],
};

const wallBed: DetailFormDef = {
  key: "wallbed-detail",
  kind: "detail",
  room: "Wall Bed",
  name: "Wall Bed Detail Sheet",
  revision: "rev 8-2026c",
  position: 360,
  note: "For wall beds only. If designing Infinity with a wall bed system, use the Office detail sheet for those cabinets.",
  sections: [
    header(),
    {
      key: "base_boards",
      title: "Existing base boards",
      note: "Remove. The wall bed must be installed flush against the wall: no buildout or outset option.",
      fields: [],
    },
    {
      key: "doors",
      title: "Doors",
      fields: [
        num("doors_qty", "Doors: amount"),
        num("doors_handles", "Doors: handles"),
        select("handle_color", "Handle color", O.HARDWARE_FINISHES),
        checks("door_fronts", "Doors", FRONTS),
        select("door_deco_style", "Deco style", O.DECO_DRAWER_STYLES),
        select("door_color", "Door color", O.DECO_COLORS),
        select("handle_options", "Handle options", O.HANDLE_OPTIONS, { hint: "Client-provided handles are due in the office 2 weeks before install." }),
        select("handle_sku", "Handles: SKU", O.HANDLES),
        text("special_handles", "Special handles / SKU"),
      ],
    },
    {
      key: "molding",
      title: "Accent top shelf, molding and backing",
      note: "ATS and 3/4\" backing are included with the wall bed. No base molding in front of wall beds.",
      fields: [
        select("ats_color", "ATS color", O.COLORS),
        select("crown_molding", "Molding", O.CROWN_MOLDING),
        select("molding_color", "Molding color", O.MOLDING_COLORS),
        select("backing_color", '3/4" backing color', O.COLORS),
      ],
    },
    {
      key: "bed",
      title: "Wall bed",
      fields: [
        yesNo("office_cabinets", "Office cabinets being installed with the wall bed", { wide: true, hint: "If yes, fill out the Office detail sheet as well." }),
        choice("orientation", "Orientation", ["Vertical wall bed", "Horizontal wall bed"]),
        choice("bed_size", "Wall bed size", ["Twin", "Full", "Queen", "Twin XL", "Full XL", "Queen XL"], { hint: 'XL = extended leg: these beds sit 2-7/16" higher off the floor.' }),
        yesNo("mattress_by_cbd", "Mattress by CBD"),
        checks("side_panels", "Side panels", ["Left side", "Right side"]),
        choice("side_panel_type", "Side panel type", ["Melamine", "Deco"]),
        text("side_panel_deco_style", "Deco style"),
      ],
    },
    {
      key: "lighting",
      title: "Lighting",
      note: "If yes, lighting information goes on the lighting detail sheet.",
      fields: [yesNo("lighting", "Lighting")],
    },
    siteSection(),
  ],
};

export const DETAIL_SHEETS: DetailFormDef[] = [closet, pantry, officeLike("Office"), wallBed, garage, officeLike("Laundry")];

export function allFields(def: { sections: FormSection[] }): FormField[] {
  return def.sections.flatMap((s) => s.fields);
}
