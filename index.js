const { App, LogLevel, HTTPReceiver } = require('@slack/bolt');
const { OpenAI } = require('openai');

const env = process.env || {};
const BOT_TOKEN = env.BOT_TOKEN;
const SIGNING_SECRET = env.SIGNING_SECRET;
const APP_TOKEN = env.APP_TOKEN;
const SLASH_COMMAND = env.SLASH_COMMAND;
const OPENAI_API_KEY = env.OPENAI_API_KEY;
const ASSISTANT_ID = env.ASSISTANT_ID;
const BOT_TITLE = env.BOT_TITLE || '';

const sleep = (ms) => {
  return new Promise((r) => setTimeout(r, ms));
};

(async () => {
  if (!BOT_TOKEN) {
    console.log(`Environment variable 'BOT_TOKEN' is required. Service will be stopped automatically in 60s`);
    await sleep(60 * 1000);
  }

  if (!SIGNING_SECRET) {
    console.log(`Environment variable 'SIGNING_SECRET' is required. Service will be stopped automatically in 60s`);
    await sleep(60 * 1000);
  }

  if (!APP_TOKEN) {
    console.log(`Environment variable 'APP_TOKEN' is required. Service will be stopped automatically in 60s`);
    await sleep(60 * 1000);
  }

  if (!SLASH_COMMAND) {
    console.log(`Environment variable 'SLASH_COMMAND' is required. Service will be stopped automatically in 60s`);
    await sleep(60 * 1000);
  }

  if (!OPENAI_API_KEY) {
    console.log(`Environment variable 'OPENAI_API_KEY' is required. Service will be stopped automatically in 60s`);
    await sleep(60 * 1000);
  }

  if (!ASSISTANT_ID) {
    console.log(`Environment variable 'ASSISTANT_ID' is required. Service will be stopped automatically in 60s`);
    await sleep(60 * 1000);
  }

  const openai = new OpenAI({
    apiKey: OPENAI_API_KEY
  });

  const app = new App({
    token: BOT_TOKEN,
    signingSecret: SIGNING_SECRET,
    appToken: APP_TOKEN,
    logLevel: LogLevel.DEBUG,
    port: 3000,
    receiver: new HTTPReceiver({
      signingSecret: SIGNING_SECRET,
      unhandledRequestHandler: async ({ logger, response }) => {
        logger.info('Acknowledging this incoming request because 20 seconds already passed...');
        response.writeHead(200);
        response.end();
      },
      unhandledRequestTimeoutMillis: 20000
    })
  });

  app.message(async ({ message, say }) => {
    if (message.subtype === 'message_changed') {
      return;
    }

    try {
      const userQuestion = message.text;

      const initialResponse = await app.client.chat.postMessage({
        channel: message.channel,
        text: `AI가 당신의 문의를 처리하고 있습니다. 잠시만 기다려 주세요🙏`
      });

      const messageThread = await openai.beta.threads.create({
        messages: [{ role: 'user', content: userQuestion }],
        metadata: {
          user: message.user
        }
      });

      console.log(messageThread);

      const run = await openai.beta.threads.runs.create(
        messageThread.id,
        { assistant_id: ASSISTANT_ID }
      );

      console.log(run);

      let runStatus = await openai.beta.threads.runs.retrieve(run.thread_id, run.id);

      let response = null;

      for (let i = 0; i < 400; i++) {
        runStatus = await openai.beta.threads.runs.retrieve(run.thread_id, run.id);

        if (runStatus.status === 'completed') {
          const messages = await openai.beta.threads.messages.list(run.thread_id);

          response = messages.data.find((message) => message.run_id === run.id && message.role === 'assistant');

          if (response?.content?.length > 0 && response.content[0].text.value) {
            break;
          }
        }

        await sleep(300);
      }

      const botResponse = await app.client.chat.update({
        channel: initialResponse.channel,
        ts: initialResponse.ts,
        blocks: [
          {
            type: 'divider'
          },
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: BOT_TITLE
            }
          },
          {
            type: 'divider'
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🔷 *질문*\n${userQuestion}`
            }
          },
          {
            type: 'divider'
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🔶 *답변*\n${response ? response.content[0].text.value : `답변을 가져올 수 없습니다.`}`
            }
          }
        ]
      });
    } catch (error) {
      console.error(`Error fetching data from API: ${error.message}`, error);

      let errorMessage;
      switch (error.status) {
        case 400:
          errorMessage = '⚠️ 잘못된 요청입니다. 로그를 확인해주세요.';
          break;
        case 401:
          errorMessage = '⚠️ 인증 오류가 발생했습니다. OpenAI API 키가 잘못 입력 되었거나 만료되었는지 확인 후 재시도하세요.';
          break;
        case 403:
          errorMessage = '⚠️ OpenAI API에 접근할 수 없는 국가/지역에서 접속을 시도하였습니다.';
          break;
        case 404:
          errorMessage = '⚠️ 찾을 수 없는 리소스입니다.';
          break;
        case 422:
          errorMessage = '⚠️ 처리할 수 없는 엔터티입니다.';
          break;
        case 429:
          errorMessage = '⚠️ OpenAI 크레딧 한도를 초과하였거나 호출 한도를 초과하였습니다. OpenAI 대시보드에서 해당 항목을 확인하세요.';
          break;
        default:
          if (error.status >= 500) {
            errorMessage = '⚠️ OpenAI 측 서버에 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
          } else {
            errorMessage = '⚠️ 알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
          }
          break;
      }

      if (error.status === 400) {
        await say({
          blocks: [
            {
              type: 'divider'
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*${errorMessage}*`
              }
            },
            {
              type: 'divider'
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*클라우드타입에서 로그뷰 보기*'
              },
              accessory: {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '로그뷰 보는 법',
                  emoji: true
                },
                value: 'cloudtype_logview',
                url: 'https://docs.cloudtype.io/guide/cli/logs',
                action_id: 'button-action'
              }
            }
          ]
        });
      } else if (error.status === 401) {
        await say({
          blocks: [
            {
              type: 'divider'
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*${errorMessage}*`
              }
            },
            {
              type: 'divider'
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*OpenAI 대시보드에서 API 키 확인하기*'
              },
              accessory: {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'OpenAI 대시보드',
                  emoji: true
                },
                value: 'openai_dashboard_apikeys',
                url: 'https://platform.openai.com/api-keys',
                action_id: 'button-action'
              }
            }
          ]
        });
      } else if (error.status >= 500) {
        await say({
          blocks: [
            {
              type: 'divider'
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*${errorMessage}*`
              }
            },
            {
              type: 'divider'
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*OpenAI 상태 확인하기*'
              },
              accessory: {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'OpenAI Status',
                  emoji: true
                },
                value: 'openai_status',
                url: 'https://status.openai.com/',
                action_id: 'button-action'
              }
            }
          ]
        });
      } else {
        await say({
          blocks: [
            {
              type: 'divider'
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*${errorMessage}*`
              }
            },
            {
              type: 'divider'
            }
          ]
        });
      }
    }
  });

  try {
    await app.start();
    console.log('⚡️ Bot is running!');
  } catch (error) {
    console.log(`Error occurred: ${error.message}`);
    console.error(error);
    await sleep(60 * 1000);
  }
})();
