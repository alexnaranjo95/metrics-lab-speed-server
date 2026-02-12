import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function formatTimeAgo(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}

export function buildDisplayName(siteUrl: string, deploymentNumber: number | null): string {
  try {
    const hostname = new URL(siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`).hostname;
    const domain = hostname.replace(/^www\./, '');
    const safe = domain.replace(/[^a-zA-Z0-9.-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || domain;
    const num = deploymentNumber ?? 0;
    return num > 0 ? `${safe}-Deploy-${num}` : safe;
  } catch {
    return `Deploy-${deploymentNumber ?? '?'}`;
  }
}

export function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return '--';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const totalSec = Math.floor((end - start) / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}
