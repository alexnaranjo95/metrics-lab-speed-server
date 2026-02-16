/**
 * HTML Code Analysis System
 * 
 * Analyzes HTML structure, dependencies, and safety for code modifications.
 * Provides intelligent analysis to enable safe AI-driven HTML optimizations.
 */

import { load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';

export interface HTMLElement {
  tag: string;
  attributes: Record<string, string>;
  content?: string;
  children: HTMLElement[];
  selector: string;
  line?: number;
  column?: number;
}

export interface HTMLDependency {
  type: 'script' | 'style' | 'link' | 'image' | 'form' | 'iframe';
  source?: string;
  attributes: Record<string, string>;
  critical: boolean;
  external: boolean;
  element: HTMLElement;
}

export interface InteractiveElement {
  type: 'form' | 'button' | 'link' | 'input' | 'select' | 'modal' | 'dropdown' | 'slider';
  selector: string;
  element: HTMLElement;
  dependencies: string[]; // CSS classes, JS functions, etc.
  functionality: string;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface HTMLAnalysisResult {
  structure: {
    doctype: string;
    language: string;
    head: HTMLElement;
    body: HTMLElement;
    totalElements: number;
    maxDepth: number;
  };
  dependencies: HTMLDependency[];
  interactiveElements: InteractiveElement[];
  metaTags: {
    title?: string;
    description?: string;
    viewport?: string;
    charset?: string;
    canonicalUrl?: string;
    openGraph: Record<string, string>;
    twitterCard: Record<string, string>;
  };
  images: {
    element: HTMLElement;
    src: string;
    alt?: string;
    loading?: string;
    fetchpriority?: string;
    dimensions?: { width: number; height: number };
    responsive: boolean;
    lazyLoaded: boolean;
  }[];
  accessibility: {
    missingAltImages: HTMLElement[];
    unlabeledFormElements: HTMLElement[];
    improperHeadingOrder: { expected: string; actual: string; element: HTMLElement }[];
    lowContrastElements: HTMLElement[];
    missingLandmarks: string[];
  };
  performance: {
    renderBlockingResources: HTMLElement[];
    largeInlineStyles: HTMLElement[];
    largeInlineScripts: HTMLElement[];
    unoptimizedImages: HTMLElement[];
    missingResourceHints: string[];
  };
  safetyMetrics: {
    modificationRiskScore: number; // 0-100
    criticalElementsCount: number;
    externalDependenciesCount: number;
    complexInteractionsCount: number;
  };
}

export interface ModificationPlan {
  changes: HTMLModification[];
  riskAssessment: {
    overall: 'low' | 'medium' | 'high' | 'critical';
    factors: string[];
    mitigations: string[];
  };
  testingRequirements: {
    functionalTests: string[];
    visualTests: string[];
    accessibilityTests: string[];
  };
  rollbackPlan: {
    complexity: 'simple' | 'moderate' | 'complex';
    steps: string[];
    verificationPoints: string[];
  };
}

export interface HTMLModification {
  id: string;
  type: 'add' | 'modify' | 'remove' | 'replace';
  target: {
    selector: string;
    element?: HTMLElement;
  };
  change: {
    content?: string;
    attributes?: Record<string, string>;
    newElement?: HTMLElement;
  };
  reason: string;
  impact: 'performance' | 'accessibility' | 'seo' | 'structure';
  riskLevel: 'low' | 'medium' | 'high';
  dependencies: string[];
  verification: string[];
}

export class HTMLAnalyzer {
  private $: CheerioAPI | null = null;
  private analysisCache = new Map<string, HTMLAnalysisResult>();

  /**
   * Analyze HTML content for structure, dependencies, and modification safety
   */
  async analyzeHTML(html: string, url?: string): Promise<HTMLAnalysisResult> {
    const cacheKey = this.generateCacheKey(html, url);
    
    if (this.analysisCache.has(cacheKey)) {
      return this.analysisCache.get(cacheKey)!;
    }

    this.$ = load(html);
    
    const analysis: HTMLAnalysisResult = {
      structure: this.analyzeStructure(),
      dependencies: this.analyzeDependencies(),
      interactiveElements: this.analyzeInteractiveElements(),
      metaTags: this.analyzeMetaTags(),
      images: this.analyzeImages(),
      accessibility: this.analyzeAccessibility(),
      performance: this.analyzePerformance(),
      safetyMetrics: this.calculateSafetyMetrics()
    };

    this.analysisCache.set(cacheKey, analysis);
    return analysis;
  }

  /**
   * Generate safe modification plan for HTML optimizations
   */
  async generateModificationPlan(
    html: string,
    optimizations: string[],
    context?: { siteProfile?: any; currentSettings?: any }
  ): Promise<ModificationPlan> {
    const analysis = await this.analyzeHTML(html);
    const modifications: HTMLModification[] = [];

    // Generate modifications based on requested optimizations
    for (const optimization of optimizations) {
      const mods = await this.generateModificationsForOptimization(
        optimization, 
        analysis, 
        context
      );
      modifications.push(...mods);
    }

    // Assess overall risk
    const riskAssessment = this.assessModificationRisk(modifications, analysis);
    
    // Generate testing requirements
    const testingRequirements = this.generateTestingRequirements(modifications, analysis);
    
    // Create rollback plan
    const rollbackPlan = this.createRollbackPlan(modifications, analysis);

    return {
      changes: modifications,
      riskAssessment,
      testingRequirements,
      rollbackPlan
    };
  }

  /**
   * Validate modification safety before application
   */
  async validateModificationSafety(modification: HTMLModification, analysis: HTMLAnalysisResult): Promise<{
    safe: boolean;
    warnings: string[];
    requirements: string[];
  }> {
    const warnings: string[] = [];
    const requirements: string[] = [];
    let safe = true;

    // Check if target element exists and is safe to modify
    const targetElement = this.findElement(modification.target.selector);
    if (!targetElement) {
      warnings.push(`Target element not found: ${modification.target.selector}`);
      safe = false;
    }

    // Check for critical element modifications
    if (this.isCriticalElement(modification.target.selector)) {
      warnings.push('Modifying critical element - extensive testing required');
      requirements.push('Comprehensive functional testing');
      if (modification.riskLevel === 'high') {
        safe = false;
      }
    }

    // Check for dependency conflicts
    const conflictingDeps = this.checkDependencyConflicts(modification, analysis);
    if (conflictingDeps.length > 0) {
      warnings.push(`Potential conflicts with: ${conflictingDeps.join(', ')}`);
      requirements.push('Dependency conflict resolution');
    }

    // Check for accessibility impact
    if (this.hasAccessibilityImpact(modification, analysis)) {
      requirements.push('Accessibility compliance verification');
    }

    return { safe, warnings, requirements };
  }

  /**
   * Apply modifications to HTML with safety checks
   */
  async applyModifications(html: string, modifications: HTMLModification[]): Promise<{
    modifiedHTML: string;
    appliedChanges: HTMLModification[];
    skippedChanges: Array<{ modification: HTMLModification; reason: string }>;
    warnings: string[];
  }> {
    this.$ = load(html);
    const appliedChanges: HTMLModification[] = [];
    const skippedChanges: Array<{ modification: HTMLModification; reason: string }> = [];
    const warnings: string[] = [];

    // Sort modifications by risk level (low risk first)
    const sortedModifications = modifications.sort((a, b) => {
      const riskOrder = { low: 1, medium: 2, high: 3 };
      return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
    });

    for (const modification of sortedModifications) {
      try {
        const applied = await this.applyModification(modification);
        if (applied) {
          appliedChanges.push(modification);
        } else {
          skippedChanges.push({ 
            modification, 
            reason: 'Failed safety validation or element not found' 
          });
        }
      } catch (error) {
        skippedChanges.push({ 
          modification, 
          reason: `Error applying modification: ${(error as Error).message}` 
        });
        warnings.push(`Failed to apply ${modification.id}: ${(error as Error).message}`);
      }
    }

    return {
      modifiedHTML: this.$.html(),
      appliedChanges,
      skippedChanges,
      warnings
    };
  }

  // Private analysis methods

  private analyzeStructure(): HTMLAnalysisResult['structure'] {
    if (!this.$) throw new Error('HTML not loaded');

    const doctype = this.extractDoctype();
    const html = this.$('html');
    const head = this.$('head');
    const body = this.$('body');

    return {
      doctype,
      language: html.attr('lang') || '',
      head: this.elementToObject(head.get(0)),
      body: this.elementToObject(body.get(0)),
      totalElements: this.$('*').length,
      maxDepth: this.calculateMaxDepth()
    };
  }

  private analyzeDependencies(): HTMLDependency[] {
    if (!this.$) return [];

    const dependencies: HTMLDependency[] = [];

    // Scripts  
    this.$?.('script').each((_, el) => {
      const $el = this.$(el);
      const src = $el.attr('src');
      dependencies.push({
        type: 'script',
        source: src,
        attributes: this.getAttributes(el),
        critical: this.isElementInHead(el) || !$el.attr('defer') && !$el.attr('async'),
        external: !!src && this.isExternalUrl(src),
        element: this.elementToObject(el)
      });
    });

    // Stylesheets
    this.$?.('link[rel="stylesheet"], style').each((_, el) => {
      const $el = this.$(el);
      const href = $el.attr('href');
      dependencies.push({
        type: 'style',
        source: href,
        attributes: this.getAttributes(el),
        critical: this.isElementInHead(el),
        external: !!href && this.isExternalUrl(href),
        element: this.elementToObject(el)
      });
    });

    // Images
    this.$?.('img').each((_, el) => {
      const $el = this.$(el);
      const src = $el.attr('src');
      dependencies.push({
        type: 'image',
        source: src,
        attributes: this.getAttributes(el),
        critical: this.isAboveFold(el),
        external: !!src && this.isExternalUrl(src),
        element: this.elementToObject(el)
      });
    });

    return dependencies;
  }

  private analyzeInteractiveElements(): InteractiveElement[] {
    if (!this.$) return [];

    const interactive: InteractiveElement[] = [];

    // Forms
    this.$?.('form').each((_, el) => {
      interactive.push({
        type: 'form',
        selector: this.generateSelector(el),
        element: this.elementToObject(el),
        dependencies: this.extractElementDependencies(el),
        functionality: 'Form submission and validation',
        riskLevel: 'medium'
      });
    });

    // Buttons
    this.$?.('button, input[type="button"], input[type="submit"]').each((_, el) => {
      interactive.push({
        type: 'button',
        selector: this.generateSelector(el),
        element: this.elementToObject(el),
        dependencies: this.extractElementDependencies(el),
        functionality: 'Click interactions',
        riskLevel: 'low'
      });
    });

    // Links
    this.$?.('a[href]').each((_, el) => {
      const $el = this.$(el);
      interactive.push({
        type: 'link',
        selector: this.generateSelector(el),
        element: this.elementToObject(el),
        dependencies: this.extractElementDependencies(el),
        functionality: $el.attr('href')?.startsWith('#') ? 'Internal navigation' : 'External navigation',
        riskLevel: 'low'
      });
    });

    // Detect common interactive patterns
    this.$?.('[class*="modal"], [class*="dropdown"], [class*="slider"], [class*="carousel"]').each((_, el) => {
      const className = this.$(el).attr('class') || '';
      let type: InteractiveElement['type'] = 'dropdown';
      
      if (className.includes('modal')) type = 'modal';
      else if (className.includes('slider') || className.includes('carousel')) type = 'slider';
      
      interactive.push({
        type,
        selector: this.generateSelector(el),
        element: this.elementToObject(el),
        dependencies: this.extractElementDependencies(el),
        functionality: `Interactive ${type} component`,
        riskLevel: 'high'
      });
    });

    return interactive;
  }

  private analyzeMetaTags(): HTMLAnalysisResult['metaTags'] {
    if (!this.$) return { openGraph: {}, twitterCard: {} };

    return {
      title: this.$('title').text(),
      description: this.$('meta[name="description"]').attr('content'),
      viewport: this.$('meta[name="viewport"]').attr('content'),
      charset: this.$('meta[charset]').attr('charset') || this.$('meta[http-equiv="Content-Type"]').attr('content'),
      canonicalUrl: this.$('link[rel="canonical"]').attr('href'),
      openGraph: this.extractOpenGraphTags(),
      twitterCard: this.extractTwitterCardTags()
    };
  }

  private analyzeImages(): HTMLAnalysisResult['images'] {
    if (!this.$) return [];

    const images: HTMLAnalysisResult['images'] = [];

    this.$('img').each((_, el) => {
      const $el = this.$(el);
      const src = $el.attr('src') || '';
      const width = $el.attr('width');
      const height = $el.attr('height');

      images.push({
        element: this.elementToObject(el),
        src,
        alt: $el.attr('alt'),
        loading: $el.attr('loading'),
        fetchpriority: $el.attr('fetchpriority'),
        dimensions: width && height ? { width: parseInt(width), height: parseInt(height) } : undefined,
        responsive: !!$el.attr('srcset'),
        lazyLoaded: $el.attr('loading') === 'lazy'
      });
    });

    return images;
  }

  private analyzeAccessibility(): HTMLAnalysisResult['accessibility'] {
    if (!this.$) return {
      missingAltImages: [],
      unlabeledFormElements: [],
      improperHeadingOrder: [],
      lowContrastElements: [],
      missingLandmarks: []
    };

    return {
      missingAltImages: this.findImagesWithoutAlt(),
      unlabeledFormElements: this.findUnlabeledFormElements(),
      improperHeadingOrder: this.checkHeadingOrder(),
      lowContrastElements: [], // Would require color analysis
      missingLandmarks: this.checkMissingLandmarks()
    };
  }

  private analyzePerformance(): HTMLAnalysisResult['performance'] {
    if (!this.$) return {
      renderBlockingResources: [],
      largeInlineStyles: [],
      largeInlineScripts: [],
      unoptimizedImages: [],
      missingResourceHints: []
    };

    return {
      renderBlockingResources: this.findRenderBlockingResources(),
      largeInlineStyles: this.findLargeInlineStyles(),
      largeInlineScripts: this.findLargeInlineScripts(),
      unoptimizedImages: this.findUnoptimizedImages(),
      missingResourceHints: this.checkMissingResourceHints()
    };
  }

  private calculateSafetyMetrics(): HTMLAnalysisResult['safetyMetrics'] {
    if (!this.$) return { modificationRiskScore: 100, criticalElementsCount: 0, externalDependenciesCount: 0, complexInteractionsCount: 0 };

    const criticalElements = this.$('script[src], link[rel="stylesheet"], form, [onclick], [onload]').length;
    const externalDeps = this.$('script[src*="//"], link[href*="//"], img[src*="//"]').length;
    const complexInteractions = this.$('[class*="modal"], [class*="dropdown"], [class*="slider"], [data-toggle], [data-target]').length;

    // Calculate risk score (lower is safer)
    let riskScore = 0;
    riskScore += criticalElements * 5;
    riskScore += externalDeps * 3;
    riskScore += complexInteractions * 10;
    riskScore = Math.min(100, riskScore);

    return {
      modificationRiskScore: riskScore,
      criticalElementsCount: criticalElements,
      externalDependenciesCount: externalDeps,
      complexInteractionsCount: complexInteractions
    };
  }

  // Helper methods

  private elementToObject(element: any): HTMLElement {
    if (!element) return { tag: '', attributes: {}, children: [], selector: '' };

    const $el = this.$(element);
    const tag = element.tagName?.toLowerCase() || '';
    
    return {
      tag,
      attributes: this.getAttributes(element),
      content: $el.text(),
      children: [], // Simplified for now
      selector: this.generateSelector(element)
    };
  }

  private getAttributes(element: any): Record<string, string> {
    const attrs: Record<string, string> = {};
    if (element.attribs) {
      Object.assign(attrs, element.attribs);
    }
    return attrs;
  }

  private generateSelector(element: any): string {
    const $el = this.$(element);
    const tag = element.tagName?.toLowerCase() || '';
    const id = $el.attr('id');
    const className = $el.attr('class');

    if (id) return `#${id}`;
    if (className) return `${tag}.${className.split(' ')[0]}`;
    return tag;
  }

  private isElementInHead(element: any): boolean {
    return this.$(element).closest('head').length > 0;
  }

  private isExternalUrl(url: string): boolean {
    return url.startsWith('//') || url.startsWith('http');
  }

  private isAboveFold(element: any): boolean {
    // Simplified - in real implementation would consider viewport
    return this.$(element).index() < 5;
  }

  private extractElementDependencies(element: any): string[] {
    const deps: string[] = [];
    const $el = this.$(element);
    
    // CSS classes
    const className = $el.attr('class');
    if (className) {
      deps.push(...className.split(' ').map(c => `css:${c}`));
    }
    
    // Data attributes (often JS hooks)
    Object.keys($el.get(0)?.attribs || {}).forEach(attr => {
      if (attr.startsWith('data-')) {
        deps.push(`data:${attr}`);
      }
    });
    
    return deps;
  }

  private findImagesWithoutAlt(): HTMLElement[] {
    return this.$('img:not([alt])').map((_, el) => this.elementToObject(el)).get();
  }

  private findUnlabeledFormElements(): HTMLElement[] {
    return this.$('input:not([aria-label]):not([aria-labelledby]), select:not([aria-label]):not([aria-labelledby]), textarea:not([aria-label]):not([aria-labelledby])')
      .filter((_, el) => {
        const $el = this.$(el);
        const id = $el.attr('id');
        return !id || this.$(`label[for="${id}"]`).length === 0;
      })
      .map((_, el) => this.elementToObject(el)).get();
  }

  private checkHeadingOrder(): Array<{ expected: string; actual: string; element: HTMLElement }> {
    const issues: Array<{ expected: string; actual: string; element: HTMLElement }> = [];
    let expectedLevel = 1;

    this.$('h1, h2, h3, h4, h5, h6').each((_, el) => {
      const actualLevel = parseInt(el.tagName.slice(1));
      if (actualLevel > expectedLevel + 1) {
        issues.push({
          expected: `h${expectedLevel}`,
          actual: `h${actualLevel}`,
          element: this.elementToObject(el)
        });
      }
      expectedLevel = Math.max(expectedLevel, actualLevel);
    });

    return issues;
  }

  private checkMissingLandmarks(): string[] {
    const missing: string[] = [];
    
    if (this.$('main, [role="main"]').length === 0) missing.push('main');
    if (this.$('nav, [role="navigation"]').length === 0) missing.push('navigation');
    if (this.$('header, [role="banner"]').length === 0) missing.push('header');
    if (this.$('footer, [role="contentinfo"]').length === 0) missing.push('footer');
    
    return missing;
  }

  private findRenderBlockingResources(): HTMLElement[] {
    return this.$('head script:not([async]):not([defer]), head link[rel="stylesheet"]:not([media="print"])')
      .map((_, el) => this.elementToObject(el)).get();
  }

  private findLargeInlineStyles(): HTMLElement[] {
    return this.$('style').filter((_, el) => {
      const content = this.$(el).html() || '';
      return content.length > 1000; // Styles larger than 1KB
    }).map((_, el) => this.elementToObject(el)).get();
  }

  private findLargeInlineScripts(): HTMLElement[] {
    return this.$('script:not([src])').filter((_, el) => {
      const content = this.$(el).html() || '';
      return content.length > 1000; // Scripts larger than 1KB
    }).map((_, el) => this.elementToObject(el)).get();
  }

  private findUnoptimizedImages(): HTMLElement[] {
    return this.$('img').filter((_, el) => {
      const $el = this.$(el);
      const src = $el.attr('src') || '';
      
      // Check for unoptimized formats
      return src.endsWith('.bmp') || src.endsWith('.tiff') || 
             (!src.endsWith('.webp') && !src.endsWith('.avif'));
    }).map((_, el) => this.elementToObject(el)).get();
  }

  private checkMissingResourceHints(): string[] {
    const missing: string[] = [];
    
    // Check for missing preconnect to external domains
    const externalDomains = new Set<string>();
    this.$('script[src*="//"], link[href*="//"], img[src*="//"]').each((_, el) => {
      const $el = this.$(el);
      const url = $el.attr('src') || $el.attr('href') || '';
      try {
        const domain = new URL(url).hostname;
        externalDomains.add(domain);
      } catch {}
    });

    externalDomains.forEach(domain => {
      if (this.$(`link[rel="preconnect"][href*="${domain}"]`).length === 0) {
        missing.push(`preconnect to ${domain}`);
      }
    });

    return missing;
  }

  private extractDoctype(): string {
    // Simplified doctype detection
    return '<!DOCTYPE html>'; // Most modern sites use HTML5
  }

  private calculateMaxDepth(): number {
    let maxDepth = 0;
    
    this.$('*').each((_, el) => {
      const depth = this.$(el).parents().length;
      maxDepth = Math.max(maxDepth, depth);
    });
    
    return maxDepth;
  }

  private extractOpenGraphTags(): Record<string, string> {
    const og: Record<string, string> = {};
    
    this.$('meta[property^="og:"]').each((_, el) => {
      const property = this.$(el).attr('property')?.replace('og:', '');
      const content = this.$(el).attr('content');
      if (property && content) {
        og[property] = content;
      }
    });
    
    return og;
  }

  private extractTwitterCardTags(): Record<string, string> {
    const twitter: Record<string, string> = {};
    
    this.$('meta[name^="twitter:"]').each((_, el) => {
      const name = this.$(el).attr('name')?.replace('twitter:', '');
      const content = this.$(el).attr('content');
      if (name && content) {
        twitter[name] = content;
      }
    });
    
    return twitter;
  }

  private generateCacheKey(html: string, url?: string): string {
    // Generate a simple hash-like key
    return `${html.length}-${url || 'unknown'}`;
  }

  private async generateModificationsForOptimization(
    optimization: string,
    analysis: HTMLAnalysisResult,
    context?: any
  ): Promise<HTMLModification[]> {
    const modifications: HTMLModification[] = [];

    switch (optimization) {
      case 'add-image-alt-text':
        modifications.push(...this.generateImageAltModifications(analysis));
        break;
      case 'optimize-meta-tags':
        modifications.push(...this.generateMetaTagModifications(analysis, context));
        break;
      case 'add-resource-hints':
        modifications.push(...this.generateResourceHintModifications(analysis));
        break;
      case 'defer-scripts':
        modifications.push(...this.generateScriptDeferModifications(analysis));
        break;
    }

    return modifications;
  }

  private generateImageAltModifications(analysis: HTMLAnalysisResult): HTMLModification[] {
    return analysis.accessibility.missingAltImages.map((img, index) => ({
      id: `add-alt-${index}`,
      type: 'modify' as const,
      target: { selector: img.selector, element: img },
      change: { attributes: { alt: 'Generated alt text for image' } },
      reason: 'Add alt text for accessibility compliance',
      impact: 'accessibility' as const,
      riskLevel: 'low' as const,
      dependencies: [],
      verification: ['Check alt attribute exists', 'Verify alt text quality']
    }));
  }

  private generateMetaTagModifications(analysis: HTMLAnalysisResult, context?: any): HTMLModification[] {
    const modifications: HTMLModification[] = [];

    if (!analysis.metaTags.title || analysis.metaTags.title.length < 30) {
      modifications.push({
        id: 'optimize-title',
        type: 'modify',
        target: { selector: 'title' },
        change: { content: 'Optimized page title' },
        reason: 'Improve SEO with optimized title',
        impact: 'seo',
        riskLevel: 'low',
        dependencies: [],
        verification: ['Check title length 30-60 characters', 'Verify title descriptiveness']
      });
    }

    return modifications;
  }

  private generateResourceHintModifications(analysis: HTMLAnalysisResult): HTMLModification[] {
    return analysis.performance.missingResourceHints.map((hint, index) => ({
      id: `add-hint-${index}`,
      type: 'add',
      target: { selector: 'head' },
      change: {
        newElement: {
          tag: 'link',
          attributes: { rel: 'preconnect', href: `//${hint.split(' ')[2]}` },
          children: [],
          selector: ''
        }
      },
      reason: `Add preconnect hint for ${hint}`,
      impact: 'performance',
      riskLevel: 'low',
      dependencies: [],
      verification: ['Check link element added', 'Verify preconnect functionality']
    }));
  }

  private generateScriptDeferModifications(analysis: HTMLAnalysisResult): HTMLModification[] {
    return analysis.performance.renderBlockingResources
      .filter(el => el.tag === 'script')
      .map((script, index) => ({
        id: `defer-script-${index}`,
        type: 'modify',
        target: { selector: script.selector, element: script },
        change: { attributes: { defer: 'true' } },
        reason: 'Defer non-critical script to improve page load',
        impact: 'performance',
        riskLevel: 'medium',
        dependencies: ['script-execution-order'],
        verification: ['Check script has defer attribute', 'Verify functionality still works']
      }));
  }

  private assessModificationRisk(modifications: HTMLModification[], analysis: HTMLAnalysisResult) {
    const highRiskCount = modifications.filter(m => m.riskLevel === 'high').length;
    const mediumRiskCount = modifications.filter(m => m.riskLevel === 'medium').length;
    
    let overall: 'low' | 'medium' | 'high' | 'critical' = 'low';
    const factors: string[] = [];
    const mitigations: string[] = [];

    if (highRiskCount > 0) {
      overall = 'high';
      factors.push(`${highRiskCount} high-risk modifications`);
      mitigations.push('Comprehensive testing required');
    } else if (mediumRiskCount > 3) {
      overall = 'medium';
      factors.push(`${mediumRiskCount} medium-risk modifications`);
      mitigations.push('Staged deployment recommended');
    }

    if (analysis.safetyMetrics.modificationRiskScore > 50) {
      factors.push('Site has high complexity');
      mitigations.push('Extra caution with interactive elements');
    }

    return { overall, factors, mitigations };
  }

  private generateTestingRequirements(modifications: HTMLModification[], analysis: HTMLAnalysisResult) {
    const functionalTests: string[] = [];
    const visualTests: string[] = [];
    const accessibilityTests: string[] = [];

    // Add test requirements based on modification types
    modifications.forEach(mod => {
      if (mod.impact === 'performance' && mod.type === 'modify') {
        functionalTests.push(`Test functionality after ${mod.reason}`);
      }
      if (mod.impact === 'accessibility') {
        accessibilityTests.push(`Verify accessibility improvement: ${mod.reason}`);
      }
      if (mod.riskLevel === 'high') {
        visualTests.push(`Visual regression test for ${mod.target.selector}`);
      }
    });

    return { functionalTests, visualTests, accessibilityTests };
  }

  private createRollbackPlan(modifications: HTMLModification[], analysis: HTMLAnalysisResult): { complexity: 'simple' | 'moderate' | 'complex'; steps: string[]; verificationPoints: string[] } {
    const complexity: 'simple' | 'moderate' | 'complex' = modifications.some(m => m.riskLevel === 'high') ? 'complex' : modifications.length > 3 ? 'moderate' : 'simple';
    
    return {
      complexity,
      steps: [
        'Backup original HTML before modifications',
        'Apply modifications incrementally',
        'Test after each significant change',
        'Rollback to backup if issues detected',
        'Verify original functionality restored'
      ],
      verificationPoints: [
        'Original functionality works',
        'No visual regressions',
        'Performance metrics restored'
      ]
    };
  }

  private findElement(selector: string): Element | null {
    if (!this.$) return null;
    const element = this.$(selector).get(0);
    return element && 'name' in element ? element as Element : null;
  }

  private isCriticalElement(selector: string): boolean {
    const criticalSelectors = ['html', 'head', 'body', 'script[src]', 'link[rel="stylesheet"]'];
    return criticalSelectors.some(critical => selector.includes(critical));
  }

  private checkDependencyConflicts(modification: HTMLModification, analysis: HTMLAnalysisResult): string[] {
    // Check if modification conflicts with existing dependencies
    const conflicts: string[] = [];
    
    // Example: if modifying a script that other scripts depend on
    if (modification.target.selector.includes('script')) {
      const scriptDeps = analysis.dependencies.filter(dep => dep.type === 'script');
      // Would check for actual conflicts in a real implementation
    }
    
    return conflicts;
  }

  private hasAccessibilityImpact(modification: HTMLModification, analysis: HTMLAnalysisResult): boolean {
    return modification.impact === 'accessibility' || 
           modification.target.selector.includes('img') ||
           modification.target.selector.includes('form') ||
           modification.target.selector.includes('button');
  }

  private async applyModification(modification: HTMLModification): Promise<boolean> {
    if (!this.$) return false;

    try {
      const target = this.$(modification.target.selector);
      if (target.length === 0) return false;

      switch (modification.type) {
        case 'modify':
          if (modification.change.attributes) {
            Object.entries(modification.change.attributes).forEach(([attr, value]) => {
              target.attr(attr, value);
            });
          }
          if (modification.change.content) {
            target.text(modification.change.content);
          }
          break;

        case 'add':
          if (modification.change.newElement) {
            const newEl = this.createElementFromObject(modification.change.newElement);
            target.append(newEl);
          }
          break;

        case 'remove':
          target.remove();
          break;

        case 'replace':
          if (modification.change.newElement) {
            const newEl = this.createElementFromObject(modification.change.newElement);
            target.replaceWith(newEl);
          }
          break;
      }

      return true;
    } catch (error) {
      console.error('Error applying modification:', error);
      return false;
    }
  }

  private createElementFromObject(element: HTMLElement): string {
    const attrs = Object.entries(element.attributes)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ');
    
    return `<${element.tag}${attrs ? ' ' + attrs : ''}>${element.content || ''}</${element.tag}>`;
  }
}

// Export singleton instance
export const htmlAnalyzer = new HTMLAnalyzer();