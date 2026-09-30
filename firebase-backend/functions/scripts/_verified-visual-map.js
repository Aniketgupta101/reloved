/**
 * Visually verified matches only (local file → wall itemId).
 * Built by comparing photos, NOT title keywords.
 * DO NOT expand without visual check.
 */
module.exports = {
  // HIGH confidence — same garment in both photos
  high: [
    { file: "01_bluegrey_striped_boss_polo.jpg", folder: "tshirts", itemId: "PoyV81nJy5aNZ2QiCwGx", title: "BOSS Striped Polo" },
    { file: "02_red_boss_polo.jpg", folder: "tshirts", itemId: "4Hjl5nnpbR9HC8Li0eK7", title: "BOSS Red Polo" },
    { file: "03_navy_boss_polo_striped_collar.jpg", folder: "tshirts", itemId: "KJcfJcMX3TRlH1s7CEre", title: "BOSS Men's Navy Polo" },
    { file: "04_olive_scotchsoda_polo.jpg", folder: "tshirts", itemId: "t2vfDpQe0Uv9NU8ZQz1T", title: "Scotch & Soda Green Polo" },
    { file: "06_white_giordano_polo.jpg", folder: "tshirts", itemId: "TXcaUOk7mjjLofvKbv3N", title: "White Giordano Polo" },
    { file: "08_navy_boss_polo_green_tipping.jpg", folder: "tshirts", itemId: "kagjDQsHq9vLiD0u9383", title: "BOSS Black Polo (file misnamed navy; is black+green tip)" },
    { file: "09_white_boss_polo_contrast_collar.jpg", folder: "tshirts", itemId: "Oi9wvFM0rFMKjHgpRBCD", title: "BOSS White Polo" },
    { file: "07_navy_blauwrecords_print_polo.jpg", folder: "tshirts", itemId: "ccCjlhUVieHKhss9aI9y", title: "Scotch & Soda Patterned Polo" },
    { file: "17_hugo_wavydot_shirt.jpg", folder: "tshirts", itemId: "3a6UsBzLcODSLO6f75mx", title: "HUGO Patterned Shirt (NOT yellow checkered)" },
    { file: "10_scotchsoda_mott_blue_chino.jpg", folder: "pants", itemId: "DOBjbBZYgFTd9DTfLE9V", title: "Scotch & Soda Mott Blue Chino" },
  ],
  // Previously WRONG title-based mappings — do not use
  rejected: [
    { file: "16_boss_chambray_polkadot_shirt.jpg", was: "1WxRhkw7r89jYaOHUPl7 BOSS Pink", reason: "local is light-blue polkadot; wall is pink+navy collar" },
    { file: "17_hugo_wavydot_shirt.jpg", was: "dLeS4yIgyB80rbN4J548 HUGO Yellow", reason: "local is cream wavy; yellow is different shirt" },
    { file: "14_canali_blackedition_stripe_shirt_TAGONLY.jpg", was: "lo90olbuGwQrrl1LZOS8 Canali Striped", reason: "local is green/purple diagonal BLACK EDITION; wall is grey dashed" },
  ],
  // Still need visual match or no wall counterpart
  pending: [
    "05_sage_giordano_polo.jpg",
    "10_canali_floral_print_shirt.jpg",
    "11_canali_arrow_print_shirt.jpg",
    "12_brooksbrothers_houndstooth_shirt.jpg",
    "13_canali_crosshatch_shirt.jpg",
    "14_canali_blackedition_stripe_shirt_TAGONLY.jpg",
    "15_canali_geometric_stripe_shirt.jpg",
    "16_boss_chambray_polkadot_shirt.jpg",
    "01_black_dress_pants.jpg",
    "02_brooksbrothers_khaki_chino.jpg",
    "03_boss_charcoal_brown_dress_pants.jpg",
    "04_armani_jeans.jpg",
    "05_navy_dress_pants.jpg",
    "06_navy_corduroy_pants.jpg",
    "07_scotchsoda_stuart_mustard_chino.jpg",
    "08_brooksbrothers_soho_greyolive_chino.jpg",
    "09_scotchsoda_thedrop_jeans.jpg",
    "11_scotchsoda_mott_green_chino.jpg",
  ],
}
