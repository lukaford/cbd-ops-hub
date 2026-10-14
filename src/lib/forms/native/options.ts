// Dropdown lists from the rev 8-2026c detail sheets. A blank answer stands for
// the paper form's "None" / "Select below", so those entries are left out.

export const COLORS = ["WHITE", "IVORY", "SUMMER DROPS", "RAIN CLOUD", "BLACK", "MIST", "CELADON", "DUKE", "MYSTERIOUS", "LATITUDE NORTH", "SUMMER FLAME", "CANDLELIGHT", "SHIRAZ CHERRY", "CHOCOLATE PEAR", "SUNDAY BRUNCH", "APRES-SKI", "WEEKEND GETAWAY", "WINTER FUN", "TESSUTO", "LINO CANCUN"];

// Backing, face frame and drawer box colours also offer the wood grains.
export const COLORS_ALL = ["WHITE", "IVORY", "SUMMER DROPS", "RAIN CLOUD", "BLACK", "MIST", "CELADON", "DUKE", "MYSTERIOUS", "LATITUDE NORTH", "SUMMER FLAME", "CANDLELIGHT", "SHIRAZ CHERRY", "CHOCOLATE PEAR", "SUNDAY BRUNCH", "SUMMERTIME BLUES", "APRES-SKI", "TETE-A-TETE", "STARGAZER", "WEEKEND GETAWAY", "WINTER FUN", "TESSUTO", "LINO CANCUN"];

// Deco door and drawer fronts.
export const DECO_COLORS = ["WHITE", "IVORY", "SUMMER DROPS", "RAIN CLOUD", "BLACK", "MIST", "CELADON", "DUKE", "MYSTERIOUS", "LATITUDE NORTH 5pc only", "SUMMER FLAME", "CANDLELIGHT", "SHIRAZ CHERRY", "CHOCOLATE PEAR", "SUNDAY BRUNCH", "APRES-SKI", "WEEKEND GETAWAY", "WINTER FUN"];

export const MOLDING_COLORS = ["WHITE", "IVORY", "SUMMER DROPS", "RAIN CLOUD", "BLACK", "MIST", "CELADON", "DUKE", "MYSTERIOUS", "LATITUDE NORTH", "SUMMER FLAME", "CANDLELIGHT", "SHIRAZ CHERRY", "CHOCOLATE PEAR", "SUNDAY BRUNCH", "APRES-SKI", "WEEKEND GETAWAY", "WINTER FUN", "LINO CANCUN contemporary only", "TESSUTO contemporary only"];

export const SCALLOP_COLORS = DECO_COLORS.filter((c) => !c.startsWith("LATITUDE"));

export const COLLECTIONS = ["EVERYDAY", "CLASSIC", "BRIO", "CLASSIC Premium", "BRIO Premium"];
export const TEAR_OUT = ["Standard Wire Rack", "Major Tear Out", "By Client"];
export const HANDLE_OPTIONS = ["CBD Procured (By CBD)", "Client Provided", "Client Installed"];

export const DECO_DOOR_STYLES = ["Arched Bellaire 2299C", "Arched Captiva 2201C", "Half Circle Bellaire 2499C", "Half Circle Captiva 2401C", "Cathedral Bellaire 2399C", "Cathedral Captiva 2301C", "Square Bellaire 2199C", "Square Captiva 2101C", "Shaker Abaco 500", "Shaker Bahama 600", "Sunrise 300Series"];
export const BYPASS_DOOR_STYLES = ["Standard Flat", "Shaker Abaco 3151Y", "Shaker Abaco - reduced rail", "Shaker Bahama 2152Y", "Shaker Bahama - reduced rail"];
export const GARAGE_BYPASS_STYLES = ["Standard Flat", "Shaker Abaco 500", "Shaker Bahama 600"];
export const DECO_DRAWER_STYLES = ["Bellaire 3199C", "Bimini 3000J", "Captiva 3101C", "Sunrise 300F", "Shaker Abaco 3151Y", "Shaker Abaco - reduced rail", "Shaker Bahama 2152Y", "Shaker Bahama - reduced rail"];

export const INSERT_TYPES = ["GLASS", "LEATHER", "MESH"];
export const INSERT_STYLES = ["Mirror", "Reeded Glass", "Rain Glass", "Smoked Glass", "Bronze Glass", "Frosted Glass", "Clear Glass", "Black - Shagreen", "Pebble - Shagreen", "Cocoa - Shagreen", "Green Stone - Shagreen", "Coal - Buffalo", "Grey Umber - Buffalo", "Paloma Grey - Buffalo", "Bright White - Buffalo", "Metro - Flat Black", "Metro - Satin Nickel", "Metro - Satin Brass", "Creel - Flat Black (textured)", "Creel - Satin Nickel (textured)", "Tweed - Antique Brass", "Tweed - Flat Black", "Tweed - Satin Brass"];

export const HANDLES = ["96mm Chrome Bar 155.99.003", "128mm Chrome Bar 155.99.014", "96mm Black Bar 155.99.002", "128mm Black Bar 155.99.017", "96mm Brushed Nickel Bar 155.99.000", "128mm Brushed Nickel Bar 155.99.016", "96mm Matt Gold Bar 155.02.411", "128mm Matt Gold Bar 155.02.413", "96mm Chrome Crescent 155.99.018", "128mm Chrome Crescent 155.99.023", "96mm Black Crescent 155.99.019", "128mm Black Crescent 155.99.024", "96mm Brushed Nickel Crescent 155.99.022", "128mm Brushed Nickel Crescent 155.99.027", "96mm Matt Gold Crescent 155.99.032", "128mm Matt Gold Crescent 155.02.430", "96mm D Handle Chrome 116.07.024", "96mm D Handle Brushed Nickel 116.07.628", "96mm D Handle Gold 116.07.229", "96mm D Handle Black 116.07.329"];
// Office, laundry and garage cabinets can also take the TAG extruded pull.
export const CABINET_HANDLES = ["TAG Omni Track Extruded Pull", ...HANDLES];
export const KNOBS = ["Chrome Knob 155.99.031", "Brushed Nickel Knob 155.99.029", "Gold Knob 155.01.819", "Black Knob 155.99.028"];
export const HARDWARE_FINISHES = ["Chrome", "Brushed Nickel", "Matt Aluminum", "Matt Nickel", "Matt Gold", "Slate Gray", "Black"];

export const CROWN_MOLDING = ["Standard Crown to Ceiling", "Standard Crown Under Ceiling", "Contemporary Crown to Ceiling", "Contemporary Crown Under Ceiling"];
export const BASE_MOLDING = ["Standard Base Molding", "Contemporary Base Molding"];

export const COUNTERTOPS = ['3/4" Melamine (Straight up to 95" Long)', '3/4" BRIO (Straight up to 95" Long)', '1 1/4" Melamine Color Match (Straight Edge)', '1 1/4" HPL Wilsonart', '1 1/2" Butcher Block', '1.18" Quartz up to 27" deep', '1.18" Quartz 27 1/8" to 42" deep'];
export const OFFICE_COUNTERTOPS = ['3/4" Melamine (Straight up to 95" Long)', '3/4" BRIO (Straight up to 95" Long)', '1 1/4" Melamine Color Match (Straight Edge)', '1 1/4" HPL Wilsonart up to 27" deep', '1 1/4" HPL Wilsonart 27 1/8" up to 48" deep', '1 1/2" Butcher Block', '1.18" Quartz up to 27" deep', '1.18" Quartz 27 1/8" to 42" deep'];
export const EDGE_BANDING = ["Straight Edge", "Crescent Edge"];
export const BUTCHER_BLOCK_SIZES = ['96"L x 25"D', '72"L x 39"D'];

export const ROD_FINISHES = ["POLISHED CHROME", "MATT ALUMINUM", "MATT NICKEL", "MATT GOLD", "BLACK", "SLATE"];
export const RACK_FINISHES = ["Chrome", "Matt Aluminum", "Matt Nickel", "Matt Gold", "Black", "Slate Grey"];
export const GROMMETS_DBL = ["Dbl. Sq. White", "Dbl. Sq. Black", "Dbl. Sq. Brown", "Dbl. Sq. Tan", "Dbl. Sq. Almond", "Dbl. Sq. Lt. Grey"];
export const GROMMETS_SNGL = ["Sngl. Black", "Sngl. White", "Sngl. Brown", "Sngl. Tan", "Sngl. Lt. Grey", "Sngl. Almond"];
export const GROMMETS_RND = ["Rnd. White", "Rnd. Black", "Rnd. Brown", "Rnd. Tan", "Rnd. Almond", "Rnd. Lt. Grey"];
export const BASKETS_12D = ['12"d x 18"w', '12"d x 24"w', '12"d x 30"w'];
export const BASKETS_16D = ['16"d x 18"w', '16"d x 24"w', '16"d x 30"w'];
export const IRONING = ["In Drawer", "Wall Mounted"];

export const JEWELRY_SINGLE = ['BLACK 24"w single', 'BLACK 30"w single', 'SILVER 24"w single', 'SILVER 30"w single', 'NAVY BLUE 24"w single'];
export const JEWELRY_DOUBLE = ['BLACK 24"w double', 'BLACK 30"w double', 'SILVER 24"w double', 'SILVER 30"w double'];
export const VELVET_TRAYS = ['BLACK 24"w', 'BLACK 30"w', 'SILVER 24"w', 'SILVER 30"w', 'NAVY BLUE 24"w', 'NAVY BLUE 30"w'];
const MIRROR_FINISHES = ["Matt Aluminum", "Matt Nickel", "Matt Gold", "Black", "Slate Grey"];
export const MIRRORS = MIRROR_FINISHES.flatMap((f) => [`35" - ${f}`, `47" - ${f}`]);
export const TOE_STOPS = ["Melamine", "Lucite", "Fence", "Rail"];
export const FENCE_STOPS = [
  ...[["Chrome", "547.52.22"], ["Matt Aluminum", "547.52.42"], ["Matt Nickel", "547.52.62"], ["Matt Gold", "547.52.92"], ["Black", "547.52.52"], ["Slate Grey", "547.52.32"]].flatMap(([f, sku]) =>
    [["12", "1"], ["18", "2"], ["24", "3"], ["30", "4"], ["36", "6"]].map(([w, d]) => `${w}" ${f} ${sku}${d}`),
  ),
];
export const RAIL_STOPS = [["Chrome Plated", "547.51.20"], ["Matt Nickel", "547.51.60"], ["Black", "547.51.30"]].flatMap(([f, sku]) =>
  [["11", "1"], ["17", "2"], ["23", "3"], ["29", "4"], ["35", "6"]].map(([w, d]) => `${w}" ${f} ${sku}${d}`),
);
export const SYNERGY_HAMPERS = ['18" - 1 Bag Black 547.43.311', '24" - 2 - 12" Bags Black 547.43.313', '30" - 1-12" / 1-18" Bags Black 547.43.315', "Tilt Out Nylon Hampers With Door"];
export const WIRE_HAMPERS = ['18" Wide Chrome', '24" Wide Chrome'];
export const SLIDEOUT_HAMPERS = [["Chrome", "807.52.23"], ["Matt Aluminum", "807.52.93"], ["Matt Nickel", "807.52.63"], ["Black", "807.52.33"]].flatMap(([f, sku]) => [
  `18" - 1 Bag ${f} ${sku}1`,
  `24" - 2 - 12" Bags ${f} ${sku}3`,
  `30" - 1 - 12" / 1 - 18" Bags ${f} ${sku}5`,
]);

export const CAN_SHELF_LIPS = ["Melamine Lip", "Lucite Lip - Clear", "Lucite Lip - Matt"];
export const X_WINE_RACKS = ['24"w x 24"h x 12"d', '24"w x 24"h x 16"d'];
export const SLIDING_WINE = ['18" wide - 4 Bottles', '24" wide - 6 Bottles'];
export const SLIDING_SPICE = ['18" wide 16 Spices', '24" wide 22 Spices'];
export const LATTICE_WINE = ['18"w x 30"h - 22 Bottles', '18"h x 37"w - 28 Bottles', '24"w x 24"h - 25 Bottles', '24"w x 30"h - 31 Bottles'];
export const WINE_SCALLOPS = ['18" wide - 3 Bottles', '24" wide - 4 Bottles', '30" wide - 5 Bottles', '36" wide - 6 Bottles'];

export const GARAGE_BASE_TYPES = ["AXILO LEGS", "STANDARD LEGS"];
export const EXTRUSIONS = ["White", "Brushed Aluminum"];
export const DESIGN_WALL_COLORS = ["White - HSW1008", "Gray - HSW3008", "Black - HSW4008", "Taupe - HSW2008", "Graphite - HSW13008", "Beachwood - HSW14008", "Driftwood Slate - HSW17008"];
export const GARAGE_ROD_COLORS = ["Chr", "Blk", "M/G", "MN", "M/A", "Slate"];
export const GAMBIS_COLORS = ["White", "Black"];
export const HEBGO_COLORS = ["Dark Grey", "Steel"];

export const YES_NO = ["Yes", "No"];
