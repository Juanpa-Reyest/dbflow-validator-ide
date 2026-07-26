import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import { execSync } from 'child_process';

const CLI_VERSION = 'v0.3.1';
const GITHUB_REPO = 'Juanpa-Reyest/dbflow-validator';
const BINARY_NAME = 'dbflow-validator';

/**
 * Resolves the path to the dbflow-validator binary.
 * Priority:
 *  1. User-configured path in settings
 *  2. Binary found in system PATH
 *  3. Binary previously downloaded to globalStoragePath
 */
export async function resolveBinary(context: vscode.ExtensionContext): Promise<string | undefined> {
  // 1. Check user setting
  const config = vscode.workspace.getConfiguration('dbflowValidator');
  const configuredPath = config.get<string>('binaryPath');
  if (configuredPath && fs.existsSync(configuredPath)) {
    return configuredPath;
  }

  // 2. Check PATH
  const pathBinary = findInPath();
  if (pathBinary) {
    return pathBinary;
  }

  // 3. Check globalStoragePath
  const storedBinary = getStoredBinaryPath(context);
  if (fs.existsSync(storedBinary)) {
    return storedBinary;
  }

  return undefined;
}

/**
 * Attempts to find the binary in the system PATH.
 */
function findInPath(): string | undefined {
  try {
    const command = process.platform === 'win32' ? 'where' : 'which';
    const result = execSync(`${command} ${BINARY_NAME}`, { encoding: 'utf-8' }).trim();
    if (result && fs.existsSync(result.split('\n')[0])) {
      return result.split('\n')[0];
    }
  } catch {
    // Binary not found in PATH
  }
  return undefined;
}

/**
 * Returns the expected path for the binary in globalStoragePath.
 */
function getStoredBinaryPath(context: vscode.ExtensionContext): string {
  const ext = process.platform === 'win32' ? '.exe' : '';
  return path.join(context.globalStorageUri.fsPath, `${BINARY_NAME}${ext}`);
}

/**
 * Detects the current platform and architecture for GitHub release asset naming.
 */
function detectPlatformAsset(): string {
  const platform = process.platform;
  const arch = process.arch;

  let os: string;
  switch (platform) {
    case 'linux':
      os = 'linux';
      break;
    case 'darwin':
      os = 'darwin';
      break;
    case 'win32':
      os = 'windows';
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }

  let cpu: string;
  switch (arch) {
    case 'x64':
      cpu = 'amd64';
      break;
    case 'arm64':
      cpu = 'arm64';
      break;
    default:
      throw new Error(`Unsupported architecture: ${arch}`);
  }

  const ext = platform === 'win32' ? '.exe' : '';
  return `${BINARY_NAME}-${os}-${cpu}${ext}`;
}

/**
 * Downloads the CLI binary from GitHub Releases and stores it in globalStoragePath.
 */
export async function downloadBinary(context: vscode.ExtensionContext): Promise<string> {
  const assetName = detectPlatformAsset();
  const url = `https://github.com/${GITHUB_REPO}/releases/download/${CLI_VERSION}/${assetName}`;

  const storagePath = context.globalStorageUri.fsPath;
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }

  const destPath = getStoredBinaryPath(context);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Downloading dbflow-validator ${CLI_VERSION}...`,
      cancellable: false,
    },
    async () => {
      await downloadFile(url, destPath);
    }
  );

  // Make executable on unix systems
  if (process.platform !== 'win32') {
    fs.chmodSync(destPath, 0o755);
  }

  return destPath;
}

/**
 * Downloads a file from a URL following redirects (GitHub releases redirect to S3).
 */
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = (targetUrl: string) => {
      https.get(targetUrl, { headers: { 'User-Agent': 'dbflow-validator-vscode' } }, (response) => {
        // Follow redirects (301, 302)
        if (response.statusCode && [301, 302].includes(response.statusCode) && response.headers.location) {
          file.close();
          fs.unlinkSync(dest);
          const newFile = fs.createWriteStream(dest);
          downloadToStream(response.headers.location, newFile).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(dest);
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        file.close();
        fs.unlinkSync(dest);
        reject(err);
      });
    };
    request(url);
  });
}

function downloadToStream(url: string, file: fs.WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'dbflow-validator-vscode' } }, (response) => {
      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      reject(err);
    });
  });
}
