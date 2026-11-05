/*
 * Darji Brothers — site settings
 * ---------------------------------------------------------------
 * 1. Leave SUPABASE_URL and SUPABASE_KEY empty to run in DEMO MODE
 *    (sample products, admin changes saved only in your own browser).
 * 2. After you create your free Supabase project (see README.md),
 *    paste the Project URL and the anon / publishable key below.
 *    The key is meant to be public — your data is protected by the
 *    security rules in supabase/setup.sql.
 */
window.DARJI_CONFIG = {
  SUPABASE_URL: "https://pqghrcqlkifqkeuyoizf.supabase.co",
  SUPABASE_KEY: "sb_publishable_23T0hE1txQbU3-npqwPBzQ_zFfXm8mA",

  // Fallback contact details. Once Supabase is connected you can
  // change these from Admin → Store details without touching code.
  WHATSAPP: "918980223301",          // country code + number, digits only
  INSTAGRAM: "darjibrothers",
  EMAIL: "darjibrother25@gmail.com",
  ADDRESS: "173/2068 Pratiksha App., Sola Road, Naranpura, Ahmedabad – 380063",

  // Your logo. Put the file in the images folder (for example images/logo.png,
  // white logo on a transparent or black background works best) and write its path here.
  // Leave empty to use the built-in DB monogram.
  LOGO: "",

  // Name of the storage bucket created by supabase/setup.sql
  BUCKET: "product-images",

  // Body measurements in inches used to suggest a ready size in the
  // Contact us measurement helper. Change these to match your own chart.
  SIZE_CHART: {
    S:     { bust: 34, waist: 28, hip: 36 },
    M:     { bust: 36, waist: 30, hip: 38 },
    L:     { bust: 38, waist: 32, hip: 40 },
    XL:    { bust: 40, waist: 34, hip: 42 },
    XXL:   { bust: 42, waist: 36, hip: 44 },
    XXXL:  { bust: 44, waist: 38, hip: 46 },
    XXXXL: { bust: 46, waist: 40, hip: 48 }
  }
};
