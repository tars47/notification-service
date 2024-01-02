const { createClient } = require("redis");

async function connectRedis() {
  try {
    const client = await createClient({
      url: process.env.REDIS_CON_URL,
    })
      .on("error", err => console.log("Redis Client Error", err))
      .connect();
    const subscriber = client.duplicate();
    subscriber.on("error", err => console.error(err));
    await subscriber.connect();
    return { client, subscriber };
  } catch (err) {
    console.log("Redis Connect Error", err);
    process.exit(1);
  }
}

module.exports = connectRedis;
