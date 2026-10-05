/**
 * Goal catalog — all 12 unique goals from corpus_clean.csv.
 *
 * These are the *only* goals the chatbot can operate under. The user's
 * free-text input is matched against these to find the nearest ones.
 *
 * To update: just edit this array. All goals must be from a single domain
 * (here: U.S. government services).
 */
const GOALS = [
  "Process disability benefits for veteran",
  "File federal tax return for citizen",
  "Process FOIA request for agency records",
  "Verify Medicare eligibility for applicant",
  "Process student loan forgiveness application",
  "Process Social Security retirement application",
  "Process immigration visa application",
  "Process disaster relief application",
  "Process workplace safety complaint",
  "Handle census data collection",
  "Check veterans education benefits",
  "Process procurement request for office equipment",
];

module.exports = GOALS;
