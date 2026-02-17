/**
 * VideoDownloader — Downloads videos from platforms that require it
 * (YouTube, Vimeo, Loom, Wistia, Mux, Dailymotion, Twitch) using yt-dlp.
 *
 * Returns a local file path. Caller is responsible for cleanup.
 */

import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { config } from '../../config.js';

const execFileAsync = promisify(execFile);

export interface DownloadResult {
  filePath: string;
  format: string;
  sizeBytes: number;
  duration?: number;
}

function getTempDir(): string {
  return (config as any).VIDEO_TEMP_DIR || '/tmp/ml-video';
}

function getYtdlpPath(): string {
  return (config as any).YTDLP_PATH || 'yt-dlp';
}

/**
 * Download a video from a URL using yt-dlp.
 * Returns the path to the downloaded file.
 */
export async function downloadVideo(
  sourceUrl: string,
  videoId: string,
  platform: string
): Promise<DownloadResult> {
  const tempDir = getTempDir();
  await fs.mkdir(tempDir, { recursive: true });

  const outputTemplate = path.join(tempDir, `${platform}-${videoId}.%(ext)s`);
  const ytdlp = getYtdlpPath();

  console.log(`[video-download] Downloading ${platform}/${videoId} from ${sourceUrl}`);

  try {
    const { stdout, stderr } = await execFileAsync(ytdlp, [
      sourceUrl,
      '-o', outputTemplate,
      '--format', 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
      '--merge-output-format', 'mp4',
      '--no-playlist',
      '--no-check-certificates',
      '--socket-timeout', '30',
      '--retries', '3',
      '--print', 'filename',
      '--print', 'duration',
    ], {
      timeout: 10 * 60 * 1000, // 10 minute timeout
      maxBuffer: 10 * 1024 * 1024,
    });

    const lines = stdout.trim().split('\n');
    const filePath = lines[0]?.trim();
    const duration = parseFloat(lines[1] || '0') || undefined;

    if (!filePath) {
      throw new Error('yt-dlp did not return a filename');
    }

    // Verify file exists
    const stat = await fs.stat(filePath);

    console.log(`[video-download] Downloaded ${platform}/${videoId}: ${filePath} (${stat.size} bytes)`);

    return {
      filePath,
      format: path.extname(filePath).slice(1) || 'mp4',
      sizeBytes: stat.size,
      duration,
    };
  } catch (err: any) {
    const stderr = err.stderr || '';
    console.error(`[video-download] yt-dlp failed for ${platform}/${videoId}: ${err.message}`);
    if (stderr) console.error(`[video-download] stderr: ${stderr.slice(0, 500)}`);
    throw new Error(`Video download failed: ${err.message}`);
  }
}

/**
 * Clean up a downloaded temp file.
 */
export async function cleanupDownload(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
    console.log(`[video-download] Cleaned up: ${filePath}`);
  } catch {
    // non-critical
  }
}
