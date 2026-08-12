const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-telle';

/**
 * Connection options tuned for serverless.
 *
 * The mongoose defaults assume a long-lived server. On Vercel each cold start
 * opens a fresh connection and the instance can be frozen mid-handshake, so
 * keep the timeouts short enough that a request fails fast instead of hanging,
 * and keep the pool small so a burst of cold starts cannot exhaust the Atlas
 * connection limit (the default maxPoolSize is 100 *per instance*).
 */
const OPTIONS = {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  minPoolSize: 0,
  maxIdleTimeMS: 60000
};

/**
 * Cache the connection on globalThis.
 *
 * A warm Vercel instance serves many requests from one module instance, and
 * several requests can arrive while the first connect is still in flight. We
 * cache the *promise*, not the resolved connection, so concurrent callers all
 * await the same handshake instead of each opening its own.
 */
const cache = globalThis.__aitelleMongo || (globalThis.__aitelleMongo = {
  promise: null,
  clientPromise: null,
  lastFailureAt: 0
});

/**
 * After a failed connect, fail fast for this long instead of making every
 * queued request sit through another 10s handshake timeout. Without it an
 * outage turns each page load into a 10s hang before its 503.
 */
const FAIL_FAST_MS = 5000;

function isConnected() {
  return mongoose.connection.readyState === 1;
}

/**
 * Connect, or return the in-flight / established connection.
 *
 * Deliberately does NOT call process.exit() on failure. Killing the process
 * turns one transient Atlas hiccup into a hard 500 for every request that
 * lands on that instance, including static and health routes that never touch
 * the database. Instead the error propagates to the caller, the cached promise
 * is cleared, and the next request retries.
 */
function connectDB() {
  if (isConnected() && cache.promise) return cache.promise;

if (!cache.promise && Date.now() - cache.lastFailureAt < FAIL_FAST_MS) {
  return Promise.reject(new Error('MongoDB unavailable (cooling down after a failed connect)'));
}

if (!cache.promise) {
  cache.promise = mongoose
  .connect(MONGODB_URI, OPTIONS)
  .then((m) => {
    console.log(`MongoDB connected: ${m.connection.host}`);
    return m;
  })
  .catch((err) => {
    // Clear the cache so the next request gets a fresh attempt rather than
         // replaying a permanently rejected promise.
         cache.promise = null;
    cache.lastFailureAt = Date.now();
    console.error(`MongoDB connection error: ${err.message}`);
    throw err;
  });
}

return cache.promise;
}

const sleep = (ms) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    // Don't hold the event loop open just to wait on a retry.
              if (typeof t.unref === 'function') t.unref();
  });

/**
 * The underlying MongoClient, for connect-mongo's session store.
 *
 * Sharing mongoose's client means one connection per instance instead of two.
 * The previous setup handed connect-mongo its own mongoUrl, which opened a
 * second client whose failures surfaced as unhandled promise rejections.
 *
 * This promise is deliberately written so it never rejects. connect-mongo holds
 * whatever promise it is given for the life of the process, so a rejection at
 * boot (Mongo briefly unreachable during a cold start) would permanently break
 * sessions on that instance even after Mongo came back. Instead it retries with
 * backoff. Requests are not left hanging on it: the readiness gate in server.js
 * answers 503 while the database is down, so nothing reaches the session
 * middleware until a connection exists.
 */
function getClientPromise() {
  if (!cache.clientPromise) {
    cache.clientPromise = (async () => {
      for (let attempt = 1; ; attempt++) {
        try {
          const m = await connectDB();
          return m.connection.getClient();
        } catch (err) {
          const delay = Math.min(1000 * attempt, 30000);
          console.error(`Session store: Mongo unavailable (attempt ${attempt}), retrying in ${delay}ms`);
          await sleep(delay);
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
