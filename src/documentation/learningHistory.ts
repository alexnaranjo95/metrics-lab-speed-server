/**
 * AI Learning History Documentation Generator
 * 
 * Generates documentation of AI learning patterns, successful optimizations,
 * and failure analysis for specific sites and across the system.
 */

import { db } from '../db/index.js';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { builds, sites } from '../db/schema.js';

export interface LearningHistoryOptions {
  limit?: number;
  includeFailures?: boolean;
  dateRange?: {
    from: Date;
    to: Date;
  };
}

export interface OptimizationLearning {
  sessionId: string;
  buildId: string;
  siteId: string;
  siteName: string;
  timestamp: Date;
  optimizationType: string;
  outcome: 'success' | 'failure' | 'partial';
  performanceImprovement: number | null; // Score point improvement
  siteCharacteristics: {
    cms: string;
    theme: string;
    plugins: string[];
    complexity: 'simple' | 'moderate' | 'complex';
  };
  optimizationAttempts: {
    attempt: number;
    strategy: string;
    settingsApplied: Record<string, unknown>;
    result: 'success' | 'failure';
    failureReason?: string;
    performanceChange: number;
  }[];
  lessonsLearned: string[];
  patternIdentified?: {
    pattern: string;
    confidence: number;
    applicability: string[];
  };
  recommendations: {
    forSimilarSites: string[];
    avoidancePatterns: string[];
  };
}

export interface LearningHistoryResult {
  totalSessions: number;
  successfulSessions: number;
  failedSessions: number;
  averageImprovement: number;
  topOptimizations: {
    type: string;
    successRate: number;
    averageImprovement: number;
    attempts: number;
  }[];
  learningPatterns: {
    pattern: string;
    sites: number;
    successRate: number;
    description: string;
  }[];
  sessions: OptimizationLearning[];
}

export async function generateLearningHistoryDoc(
  siteId: string,
  options: LearningHistoryOptions = {}
): Promise<LearningHistoryResult> {
  const limit = options.limit || 50;
  
  try {
    // Get basic site information
    const site = await db.query.sites.findFirst({
      where: eq(sites.id, siteId)
    });

    if (!site) {
      throw new Error(`Site ${siteId} not found`);
    }

    // Get optimization sessions from builds table (enhanced with AI learning data)
    let whereConditions = [eq(builds.siteId, siteId)];
    
    if (options.dateRange) {
      whereConditions.push(
        and(
          gte(builds.createdAt, options.dateRange.from),
          gte(builds.createdAt, options.dateRange.to)
        )!
      );
    }

    const buildHistory = await db.query.builds.findMany({
      where: and(...whereConditions),
      orderBy: [desc(builds.createdAt)],
      limit,
      with: {
        site: true
      }
    });

    // Analyze the learning patterns from build data
    const sessions = await analyzeBuildHistory(buildHistory, site);
    
    // Calculate aggregate statistics
    const totalSessions = sessions.length;
    const successfulSessions = sessions.filter(s => s.outcome === 'success').length;
    const failedSessions = sessions.filter(s => s.outcome === 'failure').length;
    
    const improvements = sessions
      .map(s => s.performanceImprovement)
      .filter(imp => imp !== null) as number[];
    const averageImprovement = improvements.length > 0 
      ? improvements.reduce((sum, imp) => sum + imp, 0) / improvements.length 
      : 0;

    // Identify top optimization types
    const optimizationCounts = new Map<string, { success: number; total: number; improvements: number[] }>();
    
    sessions.forEach(session => {
      const type = session.optimizationType;
      if (!optimizationCounts.has(type)) {
        optimizationCounts.set(type, { success: 0, total: 0, improvements: [] });
      }
      
      const counts = optimizationCounts.get(type)!;
      counts.total++;
      if (session.outcome === 'success') {
        counts.success++;
        if (session.performanceImprovement) {
          counts.improvements.push(session.performanceImprovement);
        }
      }
    });

    const topOptimizations = Array.from(optimizationCounts.entries())
      .map(([type, counts]) => ({
        type,
        successRate: counts.success / counts.total,
        averageImprovement: counts.improvements.length > 0 
          ? counts.improvements.reduce((sum, imp) => sum + imp, 0) / counts.improvements.length 
          : 0,
        attempts: counts.total
      }))
      .sort((a, b) => b.successRate * b.averageImprovement - a.successRate * a.averageImprovement);

    // Identify learning patterns
    const learningPatterns = await identifyLearningPatterns(sessions, siteId);

    return {
      totalSessions,
      successfulSessions,
      failedSessions,
      averageImprovement,
      topOptimizations: topOptimizations.slice(0, 5),
      learningPatterns,
      sessions: options.includeFailures ? sessions : sessions.filter(s => s.outcome !== 'failure')
    };

  } catch (error) {
    console.error('Failed to generate learning history:', error);
    throw error;
  }
}

async function analyzeBuildHistory(
  buildHistory: any[],
  site: any
): Promise<OptimizationLearning[]> {
  const sessions: OptimizationLearning[] = [];

  for (const build of buildHistory) {
    try {
      // Extract optimization information from build data
      const session: OptimizationLearning = {
        sessionId: `session_${build.id}`,
        buildId: build.id,
        siteId: build.siteId,
        siteName: site.name,
        timestamp: build.createdAt,
        optimizationType: determineOptimizationType(build),
        outcome: determineOutcome(build),
        performanceImprovement: calculatePerformanceImprovement(build),
        siteCharacteristics: await analyzeSiteCharacteristics(site, build),
        optimizationAttempts: extractOptimizationAttempts(build),
        lessonsLearned: generateLessonsLearned(build),
        recommendations: generateRecommendations(build)
      };

      // Identify patterns if we have enough data
      if (sessions.length > 0) {
        session.patternIdentified = identifyPattern(session, sessions);
      }

      sessions.push(session);
    } catch (error) {
      console.warn(`Failed to analyze build ${build.id}:`, (error as Error).message);
    }
  }

  return sessions;
}

function determineOptimizationType(build: any): string {
  // Analyze build log or settings to determine primary optimization type
  const resolvedSettings = build.resolvedSettings;
  
  if (resolvedSettings?.images?.enabled && resolvedSettings?.images?.webp?.quality < 80) {
    return 'aggressive-image-compression';
  }
  
  if (resolvedSettings?.css?.purgeUnusedCss && resolvedSettings?.css?.aggressiveness === 'moderate') {
    return 'css-purging-moderate';
  }
  
  if (resolvedSettings?.js?.removeJquery) {
    return 'jquery-removal';
  }
  
  if (resolvedSettings?.js?.deferNonCritical) {
    return 'script-deferral';
  }

  return 'comprehensive-optimization';
}

function determineOutcome(build: any): 'success' | 'failure' | 'partial' {
  if (build.status === 'success') {
    const improvement = build.lighthouseScoreAfter - build.lighthouseScoreBefore;
    if (improvement >= 5) return 'success';
    if (improvement >= 0) return 'partial';
    return 'failure';
  }
  
  return 'failure';
}

function calculatePerformanceImprovement(build: any): number | null {
  if (build.lighthouseScoreAfter && build.lighthouseScoreBefore) {
    return build.lighthouseScoreAfter - build.lighthouseScoreBefore;
  }
  return null;
}

async function analyzeSiteCharacteristics(site: any, build: any): Promise<OptimizationLearning['siteCharacteristics']> {
  // Analyze site characteristics from crawl results or build log
  const buildLog = build.buildLog || [];
  
  let cms = 'unknown';
  let theme = 'unknown';
  let plugins: string[] = [];
  let complexity = 'moderate' as const;

  // Extract characteristics from build log
  for (const entry of buildLog) {
    if (entry.message.includes('WordPress')) cms = 'WordPress';
    if (entry.message.includes('Elementor')) theme = 'Elementor';
    if (entry.message.includes('plugin')) {
      const match = entry.message.match(/(\w+)\s+plugin/i);
      if (match) plugins.push(match[1]);
    }
  }

  // Determine complexity based on page count and build duration
  if (build.pagesTotal > 50 || plugins.length > 10) {
    complexity = 'complex';
  } else if (build.pagesTotal < 10 && plugins.length < 3) {
    complexity = 'simple';
  }

  return { cms, theme, plugins, complexity: complexity as 'simple' | 'moderate' | 'complex' };
}

function extractOptimizationAttempts(build: any): OptimizationLearning['optimizationAttempts'] {
  // In a real implementation, this would analyze iteration data
  // For now, simulate based on build outcome
  const attempts: OptimizationLearning['optimizationAttempts'] = [];
  
  const improvement = calculatePerformanceImprovement(build) || 0;
  const outcome = determineOutcome(build);
  
  attempts.push({
    attempt: 1,
    strategy: determineOptimizationType(build),
    settingsApplied: build.resolvedSettings || {},
    result: outcome === 'failure' ? 'failure' : 'success',
    failureReason: outcome === 'failure' ? build.errorMessage : undefined,
    performanceChange: improvement
  });

  return attempts;
}

function generateLessonsLearned(build: any): string[] {
  const lessons: string[] = [];
  const outcome = determineOutcome(build);
  const optimizationType = determineOptimizationType(build);
  
  if (outcome === 'success') {
    lessons.push(`${optimizationType} strategy successful for this site type`);
    
    const improvement = calculatePerformanceImprovement(build);
    if (improvement && improvement > 10) {
      lessons.push('High performance improvement achieved - settings can be replicated');
    }
  } else {
    lessons.push(`${optimizationType} strategy failed - avoid for similar sites`);
    
    if (build.errorMessage) {
      lessons.push(`Common failure pattern: ${build.errorMessage.substring(0, 100)}`);
    }
  }

  return lessons;
}

function generateRecommendations(build: any): OptimizationLearning['recommendations'] {
  const outcome = determineOutcome(build);
  const optimizationType = determineOptimizationType(build);
  
  const recommendations = {
    forSimilarSites: [] as string[],
    avoidancePatterns: [] as string[]
  };

  if (outcome === 'success') {
    recommendations.forSimilarSites.push(`Apply ${optimizationType} with similar settings`);
    
    const improvement = calculatePerformanceImprovement(build);
    if (improvement && improvement > 15) {
      recommendations.forSimilarSites.push('High-impact optimization - prioritize for similar sites');
    }
  } else {
    recommendations.avoidancePatterns.push(`Avoid ${optimizationType} for this site profile`);
    
    if (build.errorMessage?.includes('jQuery')) {
      recommendations.avoidancePatterns.push('jQuery removal risky for sites with heavy plugin dependencies');
    }
  }

  return recommendations;
}

function identifyPattern(
  currentSession: OptimizationLearning,
  previousSessions: OptimizationLearning[]
): OptimizationLearning['patternIdentified'] {
  // Look for patterns in similar site types
  const similarSites = previousSessions.filter(session => 
    session.siteCharacteristics.cms === currentSession.siteCharacteristics.cms &&
    session.siteCharacteristics.complexity === currentSession.siteCharacteristics.complexity
  );

  if (similarSites.length >= 3) {
    const successfulOptimizations = similarSites.filter(s => s.outcome === 'success');
    const successRate = successfulOptimizations.length / similarSites.length;
    
    if (successRate > 0.7) {
      return {
        pattern: `${currentSession.siteCharacteristics.cms} + ${currentSession.siteCharacteristics.complexity} sites respond well to ${currentSession.optimizationType}`,
        confidence: successRate,
        applicability: [`${currentSession.siteCharacteristics.cms} sites`, `${currentSession.siteCharacteristics.complexity} complexity sites`]
      };
    }
  }

  return undefined;
}

async function identifyLearningPatterns(
  sessions: OptimizationLearning[],
  siteId: string
): Promise<LearningHistoryResult['learningPatterns']> {
  const patterns: LearningHistoryResult['learningPatterns'] = [];

  // Group sessions by site characteristics
  const siteGroups = new Map<string, OptimizationLearning[]>();
  
  sessions.forEach(session => {
    const key = `${session.siteCharacteristics.cms}-${session.siteCharacteristics.complexity}`;
    if (!siteGroups.has(key)) {
      siteGroups.set(key, []);
    }
    siteGroups.get(key)!.push(session);
  });

  // Identify patterns with sufficient data
  for (const [groupKey, groupSessions] of siteGroups) {
    if (groupSessions.length >= 3) {
      const successRate = groupSessions.filter(s => s.outcome === 'success').length / groupSessions.length;
      
      if (successRate > 0.6 || successRate < 0.3) { // Strong pattern (high success or high failure)
        const [cms, complexity] = groupKey.split('-');
        patterns.push({
          pattern: `${cms} sites with ${complexity} complexity`,
          sites: 1, // This is for a single site, but in real implementation would be cross-site
          successRate,
          description: successRate > 0.6 
            ? `High success rate for optimizations on ${cms} ${complexity} sites`
            : `Low success rate - optimization challenges with ${cms} ${complexity} sites`
        });
      }
    }
  }

  return patterns;
}

export async function getCrossSystemLearningPatterns(): Promise<{
  patterns: {
    siteProfile: string;
    optimizationType: string;
    successRate: number;
    averageImprovement: number;
    sampleSize: number;
    recommendations: string[];
  }[];
  insights: string[];
}> {
  try {
    // This would query across all sites to find system-wide patterns
    // For now, return mock data structure
    return {
      patterns: [
        {
          siteProfile: 'WordPress + Elementor + WooCommerce',
          optimizationType: 'aggressive-image-compression',
          successRate: 0.87,
          averageImprovement: 12.3,
          sampleSize: 45,
          recommendations: [
            'Use moderate CSS purging instead of aggressive',
            'Preserve WooCommerce and Elementor CSS classes',
            'Focus on image optimization for maximum impact'
          ]
        }
      ],
      insights: [
        'Sites with jQuery dependencies have 65% lower success rate for jQuery removal',
        'Image optimization provides most consistent performance improvements (>90% success rate)',
        'CSS purging effectiveness correlates with theme complexity'
      ]
    };
  } catch (error) {
    console.error('Failed to get cross-system learning patterns:', error);
    return { patterns: [], insights: [] };
  }
}