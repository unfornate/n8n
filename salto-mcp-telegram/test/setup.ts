import nock from "nock";

process.env.NODE_ENV = "test";
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "TEST_TOKEN";
process.env.ALLOWED_CHAT_IDS = process.env.ALLOWED_CHAT_IDS || "";
process.env.PORT = process.env.PORT || "8787";
process.env.ALLOW_LEGACY_BODY = process.env.ALLOW_LEGACY_BODY || "true";
process.env.TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || "@TestBot";

nock.disableNetConnect();

afterAll(() => {
  nock.cleanAll();
  nock.enableNetConnect();
});
