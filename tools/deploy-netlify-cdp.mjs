import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

function findChrome() {
  for (const c of CHROME_CANDIDATES) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

function waitForHttp(url, timeoutMs = 15000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(body));
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) reject(new Error(`timeout waiting for ${url}`));
        else setTimeout(tick, 250);
      });
      req.setTimeout(2000, () => req.destroy());
    };
    tick();
  });
}

async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  let id = 0;

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', (e) => reject(new Error(`websocket error: ${e.message || 'unknown'}`)), { once: true });
  });

  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
      else resolve(msg.result);
    }
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    socket.send(JSON.stringify({ id: msgId, method, params }));
    setTimeout(() => {
      if (pending.has(msgId)) {
        pending.delete(msgId);
        reject(new Error(`CDP timeout: ${method}`));
      }
    }, 30000);
  });

  return { socket, send };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    console.error('Chrome not found');
    process.exit(1);
  }

  const PORT = 9445;
  const profile = mkdtempSync(path.join(tmpdir(), 'qv-netlify-'));
  const child = spawn(chrome, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1440,900',
    'https://app.netlify.com/drop'
  ], { stdio: 'ignore' });

  const cleanup = () => {
    try {
      if (child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {}
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(); });

  try {
    console.log('1. Waiting for Chrome remote debugging...');
    await waitForHttp(`http://127.0.0.1:${PORT}/json/version`);
    
    const targetsRaw = await waitForHttp(`http://127.0.0.1:${PORT}/json/list`);
    const targets = JSON.parse(targetsRaw);
    const pageTarget = targets.find(t => t.type === 'page');
    if (!pageTarget) throw new Error('No page target found');

    console.log('2. Connecting CDP to target:', pageTarget.webSocketDebuggerUrl);
    const { send } = await connect(pageTarget.webSocketDebuggerUrl);

    await send('Page.enable');
    await send('DOM.enable');
    await send('Runtime.enable');
    await send('Network.enable');

    console.log('3. Waiting for #drop-hero-file element to appear in DOM...');
    let found = false;
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      const evalCheck = await send('Runtime.evaluate', {
        expression: `!!document.getElementById('drop-hero-file')`
      });
      if (evalCheck.result.value === true) {
        console.log(`Element #drop-hero-file appeared at t+${i+1}s!`);
        found = true;
        break;
      }
    }

    if (!found) {
      console.error('Timeout waiting for #drop-hero-file');
      return;
    }

    const doc = await send('DOM.getDocument', { depth: -1 });
    const fileInput = await send('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector: '#drop-hero-file'
    });

    console.log(`4. Found nodeId: ${fileInput.nodeId}`);
    const zipPath = path.resolve('dist.zip');
    console.log(`5. Setting file: ${zipPath}`);

    await send('DOM.setFileInputFiles', {
      files: [zipPath],
      nodeId: fileInput.nodeId
    });

    console.log('6. Dispatching change & input events...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const input = document.getElementById('drop-hero-file');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      })()`
    });

    console.log('7. Monitoring page for 45s...');
    for (let i = 0; i < 22; i++) {
      await sleep(2000);
      const state = await send('Runtime.evaluate', {
        expression: `({
          url: window.location.href,
          title: document.title,
          text: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 200)
        })`,
        returnByValue: true
      });
      console.log(`[+${(i+1)*2}s] ${state.result.value.url} | ${state.result.value.text.slice(0, 100)}`);

      // Check if URL changed away from /drop or if there is a site link
      if (state.result.value.url.includes('netlify.app') && !state.result.value.url.endsWith('/drop')) {
        console.log('🚀 DEPLOY SUCCESS URL:', state.result.value.url);
      }

      // Check if a link to netlify.app appeared in the DOM
      const links = await send('Runtime.evaluate', {
        expression: `Array.from(document.querySelectorAll('a')).map(a => a.href).filter(h => h.includes('.netlify.app'))`,
        returnByValue: true
      });
      if (links.result.value && links.result.value.length > 0) {
        console.log('🔗 Found Netlify Links:', links.result.value);
      }
    }

    // Save screenshot
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync('netlify_deploy_result.png', Buffer.from(shot.data, 'base64'));
    console.log('Screenshot saved to netlify_deploy_result.png');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    cleanup();
  }
}

main();
