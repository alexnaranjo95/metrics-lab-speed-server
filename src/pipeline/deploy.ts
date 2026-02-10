import { createPagesProject, deployToPages } from '../services/cloudflare.js';

export interface DeployOptions {
  projectName: string;
  outputDir: string;
  siteUrl: string;
}

export interface DeployResult {
  url: string;
  deploymentId: string;
  filesUploaded: number;
  totalSizeBytes: number;
}

/**
 * Deploy the optimized static site to Cloudflare Pages.
 */
export async function deployToCloudflare(options: DeployOptions): Promise<DeployResult> {
  const { projectName, outputDir, siteUrl } = options;

  // Ensure the project exists (idempotent)
  await createPagesProject(projectName);

  // Deploy files
  const result = await deployToPages(projectName, outputDir);

  console.log(`Deployed ${result.filesUploaded} files to ${result.url} (${result.totalSizeBytes} bytes)`);

  return result;
}
