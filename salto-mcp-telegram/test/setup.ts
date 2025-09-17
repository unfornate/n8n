import nock from "nock";

process.env.NODE_ENV = "test";
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "TEST_TOKEN";
process.env.ALLOWED_CHAT_IDS = process.env.ALLOWED_CHAT_IDS || "";
process.env.PORT = process.env.PORT || "8787";

nock.disableNetConnect();

afterAll(() => {
  nock.cleanAll();
  nock.enableNetConnect();
});
