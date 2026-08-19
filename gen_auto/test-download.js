const fs = require('fs');
const path = require('path');

const SAVE_DIR = process.env.GEN_DIR || path.join(__dirname, 'downloads');

// config.js больше не в git (там раньше лежали реальные Jira/Whitegen куки) —
// на новых деплоях его может не быть, а значения всё равно приходят через env
// (per-user креды из /settings), поэтому файл нужен только как необязательный
// фолбэк, а не жёсткая зависимость.
let fileConfig = {};
try {
  fileConfig = require('./config');
} catch (e) {
  if (e.code !== 'MODULE_NOT_FOUND') throw e;
}
const WHITEGEN_COOKIE = process.env.WHITEGEN_COOKIE || fileConfig.WHITEGEN_COOKIE;
const WHITEGEN_AUTH = process.env.WHITEGEN_AUTH || fileConfig.WHITEGEN_AUTH;
const JIRA_USER = process.env.JIRA_USER || fileConfig.JIRA_USER;

const db = require('./db');

const HEADERS = {
  "accept": "application/json, application/zip, application/octet-stream, */*",
  "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
  "authorization": WHITEGEN_AUTH,
  "priority": "u=1, i",
  "sec-ch-ua": "\"Chromium\";v=\"148\", \"Google Chrome\";v=\"148\", \"Not/A)Brand\";v=\"99\"",
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": "\"macOS\"",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "cookie": WHITEGEN_COOKIE,
  "Referer": "https://whitegen.org/list"
};

async function findGeneration(number) {
  let page = 1;
  while (true) {
    const res = await fetch(
      `https://whitegen.org/api/v1/generator/list?page=${page}&per_page=10`,
      { headers: HEADERS, body: null, method: 'GET' }
    ).then(r => r.json());

    const items = res.data || [];
    const found = items.find(item => item.number === number);
    if (found) return found;

    if (items.length < 10) return null;
    page++;
  }
}

async function downloadGen(gen) {
  const response = await fetch(
    `https://whitegen.org/api/v1/generator/download/${gen.id}`,
    { headers: HEADERS, body: null, method: 'GET' }
  );

  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename[^;=\n]*=(?:['"]?)([^'"\n]+)/i);
  const filename = match ? match[1] : `${gen.domain}.zip`;
  const filePath = path.join(SAVE_DIR, filename);

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(filePath, Buffer.from(buffer));
  console.log(`Saved: ${filePath}`);
}

async function main() {
  const keys = db.getCreatedKeys(JIRA_USER);
  const filteredKeys = keys.filter(k => !db.isDeployed(k));

  console.log(`Keys in created-tasks: ${keys.length}, already deployed: ${keys.length - filteredKeys.length}, to download: ${filteredKeys.length}`);
  if (filteredKeys.length === 0) {
    console.log('Nothing to download.');
    process.exit(0);
  }

  if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR, { recursive: true });

  for (const key of filteredKeys) {
    console.log(`Looking for ${key}...`);
    const gen = await findGeneration(key);
    if (!gen) {
      console.log(`${key}: not found, skipping`);
      continue;
    }
    if (gen.status !== 'finished') {
      console.log(`${key}: status="${gen.status}", skipping`);
      continue;
    }
    // всегда качаем свежий zip и перезаписываем — если задачу перегенерировали
    // после первого скачивания за день, старый файл не должен блокировать
    // получение новой версии
    console.log(`${key}: found id=${gen.id}, downloading...`);
    await downloadGen(gen);
    if (gen.domain) {
      db.setDomainIfMissing(key, JIRA_USER, gen.domain);
    }
  }

  console.log('\nГотово. Для деплоя запусти: python3 deploy.py');
}

main().catch(error => console.error('Error:', error));
