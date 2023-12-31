const http = require('http');
const httpProxy = require('http-proxy');
const url = require('url');
const https = require('https');
require('colors');

const proxy = httpProxy.createProxyServer({});

const TELEGRAM_BOT_TOKEN = 'Your_Bot_Token';
const TELEGRAM_CHANNEL_ID = 'Your_Telegram_Channel_ID';

const blacklistedIPs = new Set();
const requestCountMap = new Map();

setInterval(() => {
  requestCountMap.clear();
}, 60 * 1000);

function sendTelegramMessage(message) {
  const data = {
    chat_id: TELEGRAM_CHANNEL_ID,
    text: message,
    parse_mode: 'Markdown',
  };

  const postData = JSON.stringify(data);

  const options = {
    hostname: 'api.telegram.org',
    port: 443,
    path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
    rejectUnauthorized: false,
  };

  const req = https.request(options, (res) => {
    let responseData = '';

    res.on('data', (chunk) => {
      responseData += chunk;
    });

    res.on('end', () => {
      //console.log('Telegram API response:'.cyan, responseData);
    });
  });

  req.on('error', (error) => {
    console.error('Telegram API request failed:'.red, error.message);
  });

  req.write(postData);
  req.end();
}

const separatorLine = '----------------------------------------'.cyan;

const server = http.createServer((req, res) => {
  const clientIP = req.connection.remoteAddress;

  if (blacklistedIPs.has(clientIP)) {
    req.destroy();
    //console.log(`Connection from blocked IP ${clientIP} is dropped.`.red);
    return;
  }

  if (requestCountMap.has(clientIP) && requestCountMap.get(clientIP).count >= 10) {
    const blockMessage = `⚠*检测到潜在的滥用行为*⚠\n➖➖➖➖➖➖➖➖\n*滥用者IP:* \`${clientIP}\`\n*最后请求URL:* \`${requestCountMap.get(clientIP).lastURL}\`\n*最后请求标头:* \`\`\`${JSON.stringify(requestCountMap.get(clientIP).lastHeaders, null, 2)}\`\`\``;
    const blockMessageRaw = `Blocked IP: ${clientIP} for 60 minutes\nLast URL: ${requestCountMap.get(clientIP).lastURL}\nLast Headers:\n ${JSON.stringify(requestCountMap.get(clientIP).lastHeaders, null, 2)}`;
    console.log(separatorLine);
    console.log(blockMessageRaw.red);

    if (!blacklistedIPs.has(clientIP)) {
      sendTelegramMessage(blockMessage);
      blacklistedIPs.add(clientIP);
    }

    req.destroy();
    //console.log(`Connection from blocked IP ${clientIP} is dropped due to excessive requests.`.red);
    return;
  }

  if (!requestCountMap.has(clientIP)) {
    requestCountMap.set(clientIP, { count: 1, lastURL: req.url, lastHeaders: req.headers });
  } else {
    requestCountMap.get(clientIP).count += 1;
    requestCountMap.get(clientIP).lastURL = req.url;
    requestCountMap.get(clientIP).lastHeaders = req.headers;
  }

  const method = req.method;
  const targetURL = req.url;
  const httpVersion = req.httpVersion;
  const userAgent = req.headers['user-agent'];

  console.log(separatorLine);
  console.log('Received request from IP:'.green, clientIP.green);
  console.log('HTTP Method:'.yellow, method.yellow);
  console.log('Target URL:'.blue, targetURL.blue);
  console.log('HTTP Version:'.magenta, `HTTP/${httpVersion}`.magenta);
  console.log('User-Agent:'.cyan, userAgent.cyan);
  console.log(`Request count for ${clientIP}:`.green, requestCountMap.get(clientIP).count.toString().green);

  try {
    const parsedUrl = url.parse(targetURL);
    proxy.web(req, res, { target: parsedUrl.href });
  } catch (error) {
    console.error('Error processing request:'.red, error);

    const errorMessage = `Error processing request from IP ${clientIP}: \`${error.message}\``;
    console.error(errorMessage.red);

    sendTelegramMessage(errorMessage);

    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error'.red);
  }
});

const PORT = 3128;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Proxy server is listening on port ${PORT}`.blue);
});