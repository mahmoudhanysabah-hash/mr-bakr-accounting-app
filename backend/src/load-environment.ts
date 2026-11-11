// Vercel injects environment variables directly; local runs still use .env.
// Keep this side effect before application imports that read those variables.
if (process.env.VERCEL !== '1') {
  require('dotenv/config');
}
