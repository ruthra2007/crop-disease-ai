const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const WORKER_PATH = path.join(PROJECT_ROOT, 'ml', 'inference', 'worker.py');
const pendingRequests = new Map();
let workerProcess;
let workerReady;
let requestSequence = 0;

function windowsPathToWsl(windowsPath) {
  const normalizedPath = path.resolve(windowsPath).replace(/\\/g, '/');
  const driveMatch = normalizedPath.match(/^([A-Za-z]):(.*)$/);
  if (!driveMatch) {
    throw new Error('The project path cannot be mapped into WSL.');
  }
  return `/mnt/${driveMatch[1].toLowerCase()}${driveMatch[2]}`;
}

function rejectPendingRequests(error) {
  for (const [id, request] of pendingRequests) {
    clearTimeout(request.timeout);
    request.reject(error);
    pendingRequests.delete(id);
  }
}

function handleWorkerExit(child, error) {
  if (workerProcess !== child) return;
  workerProcess = undefined;
  workerReady = undefined;
  rejectPendingRequests(error);
}

function startWorker() {
  if (workerReady) return workerReady;

  const isWindows = process.platform === 'win32';
  const pythonPath = process.env.ML_WSL_PYTHON
    || `/home/${(process.env.USERNAME || 'ruthra').toLowerCase()}/cropai-gpu-venv/bin/python`;
  const workerPath = isWindows ? windowsPathToWsl(WORKER_PATH) : WORKER_PATH;
  const command = isWindows ? 'wsl.exe' : (process.env.ML_PYTHON || 'python3');
  const args = isWindows
    ? ['--distribution', process.env.ML_WSL_DISTRO || 'Ubuntu', '--exec', pythonPath, '-u', workerPath]
    : ['-u', workerPath];

  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  workerProcess = child;

  workerReady = new Promise((resolve, reject) => {
    const startupTimeout = setTimeout(() => {
      child.kill();
      reject(new Error('Timed out while loading the crop model.'));
      handleWorkerExit(child, new Error('Crop model worker timed out.'));
    }, 180_000);

    const stdout = readline.createInterface({ input: child.stdout });
    stdout.on('line', (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        console.error(`Unexpected model worker output: ${line}`);
        return;
      }

      if (message.type === 'ready') {
        clearTimeout(startupTimeout);
        resolve();
        return;
      }

      const request = pendingRequests.get(message.id);
      if (!request) return;
      clearTimeout(request.timeout);
      pendingRequests.delete(message.id);
      if (message.error) request.reject(new Error(message.error));
      else request.resolve(message.result);
    });

    child.stderr.on('data', (chunk) => {
      process.stderr.write(`[crop-model] ${chunk}`);
    });

    child.once('error', (error) => {
      clearTimeout(startupTimeout);
      reject(error);
      handleWorkerExit(child, error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(startupTimeout);
      const error = new Error(
        `Crop model worker exited (${signal || code}). Configure ML_WSL_PYTHON and verify the WSL model environment.`,
      );
      reject(error);
      handleWorkerExit(child, error);
    });
  });

  return workerReady;
}

async function predict(imageBuffer, crop = 'auto') {
  await startWorker();
  if (!workerProcess || !workerProcess.stdin.writable) {
    throw new Error('Crop model worker is not available.');
  }

  const id = ++requestSequence;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error('Prediction timed out.'));
    }, 60_000);

    pendingRequests.set(id, { resolve, reject, timeout });
    workerProcess.stdin.write(
      `${JSON.stringify({ id, crop, image: imageBuffer.toString('base64') })}\n`,
      (error) => {
        if (!error) return;
        clearTimeout(timeout);
        pendingRequests.delete(id);
        reject(error);
      },
    );
  });
}

module.exports = { predict };