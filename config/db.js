const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-telle';

/**
 * Connection options tuned for serverless.
 *
 * Keep the pool small: the default maxPoolSize is 100 *per instance*, and a
 * burst of cold starts can otherwise exhaust the Atlas connection limit.
 *
 * Timeouts are per attempt, not per request - connectWithRetry below makes
 * several attempts, so an individual one can afford to give up early.
 */
const OPTIONS = {
  serverSelectionTimeoutMS: 8000,
  connectTimeoutMS: 8000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  minPoolSize: 0,
  maxIdleTimeMS: 60000
};

/**
 * How many fresh connection attempts a single request will make before giving
 * up, and the base backoff between them (400ms, then 800ms).
 *
 * Retrying matters because of how Vercel suspends instances. An instance can be
 * frozen mid-handshake and thawed minutes later holding a dead connection; the
 * production logs showed a "retry in 1000ms" that actually fired 5 minutes and
 * 6 seconds later. A retry gets a clean attempt instead of inheriting that.
 */
const CONNECT_ATTEMPTS = 3;
const RETRY_BASE_MS = 400;

/**
 * Cache the connection on globalThis.
 *
 * A warm instance serves many requests from one module instance, and several
 * can arrive while the first connect is in flight. We cache the *promise*, so
 * concurrent callers await one handshake instead of each opening their own.
 *
 * A rejection is never cached - see connectDB.
 */
const cache = globalThis.__aitelleMongo || (globalThis.__aitelleMongo = {
  promise: null,
  clientPromise: null
});

/**
 * Backoff on the request path. This one is intentionally NOT unref'd: a request
 * is waiting on it, and an unref'd timer lets Node exit the loop mid-backoff so
 * the retry never fires at all.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Backoff for the background session-store loop. Unref'd, so an idle retry
 * never by itself keeps a serverless instance awake.
 */
const sleepIdle = (ms) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (typeof t.unref === 'function') t.unref();
  });

function isConnected() {
  return mongoose.connection.readyState === 1;
}

/**
 * Make up to CONNECT_ATTEMPTS genuinely fresh connection attempts.
 *
 * Deliberately does NOT call process.exit() on failure. Killing the process
 * turns one transient hiccup into a hard 500 for every request on that
 * instance, including static and health routes that never touch the database.
 */
async function connectWithRetry() {
  let lastError;

for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt++) {
  try {
    const m = await mongoose.connect(MONGODB_URI, OPTIONS);
    console.log(
      `MongoDB connected: ${m.connection.host}` +
      (attempt > 1 ? ` (succeeded on attempt ${attempt})` : '')
      );
    return m;
  } catch (err) {
    lastError = err;
    console.error(`MongoDB connect attempt ${attempt}/${CONNECT_ATTEMPTS} failed: ${err.message}`);
    if (attempt < CONNECT_ATTEMPTS) {
      await sleep(RETRY_BASE_MS * attempt);
    }
  }
}

throw lastError;
}

/**
 * Connect, or return the in-flight / established connection.
 *
 * There is deliberately no "fail fast" cooldown here. An earlier version kept
 * one for 5 seconds after a failure so queued requests would not each wait out
 * a handshake - but the real failure mode is a single stale instance, not a
 * database outage, so the cooldown mostly manufactured extra silent 503s and
 * delayed recovery. Retrying is cheap; refusing to try is what hurt.
 */
function connectDB() {
  if (isConnected() && cache.promise) return cache.promise;

if (!cache.promise) {
  cache.promise = connectWithRetry().catch((err) => {
    // Never leave a rejected promise in the cache - the next request must get
                                           // a clean attempt rather than replaying this failure forever.
                                           cache.promise = null;
    cache.clientPromise = null;
    throw err;
  });
}

return cache.promise;
}

/**
 * The underlying MongoClient, for connect-mongo's session store.
 *
 * Sharing mongoose's client means one connection per instance instead of two.
 * The previous setup handed connect-mongo its own mongoUrl, which opened a
 * second client whose failures surfaced as unhandled promise rejections.
 *
 * This promise is written so it never rejects: connect-mongo holds whatever it
 * is given for the life of the process, so a rejection at boot would break
 * sessions on that instance permanently. Requests are not left hanging on it -
 * the readiness gate in server.js answers 503 while the database is down, so
 * nothing reaches the session middleware until a connection exists.
 */
function getClientPromise() {
  if (!cache.clientPromise) {
    cache.clientPromise = (async () => {
      for (let round = 1; ; round++) {
        try {
          const m = await connectDB();
          return m.connection.getClient();
        } catch (err) {
          const delay = Math.min(1000 * round, 10000);
          console.error(`Session store: Mongo unavailable (round ${round}), retrying in ${delay}ms`);
          await sleepIdle(delay);
        }
      }
    })();
  }
  return cache.clientPromise;
}

module.exports = connectDB;
module.exports.connectDB = connectDB;
module.exports.getClientPromise = getClientPromise;
module.exports.isConnected = isConnected;
