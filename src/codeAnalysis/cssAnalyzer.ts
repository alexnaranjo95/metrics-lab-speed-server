/**
 * CSS Code Analysis System
 * 
 * Analyzes CSS dependencies, critical styles, and safety for code modifications.
 * Enables intelligent CSS optimizations while preserving visual integrity.
 */

import { parse as parseCSS, Rule, Declaration, Comment, AtRule } from 'css';

export interface CSSRule {
  type: 'rule' | 'media' | 'keyframes' | 'import' | 'font-face' | 'supports';
  selector?: string;
  property?: string;
  value?: string;
  declarations: CSSDeclaration[];
  rules?: CSSRule[];
  media?: string;
  line?: number;
  column?: number;
}

export interface CSSDeclaration {
  property: string;
  value: string;
  important: boolean;
  line?: number;
  column?: number;
}

export interface CSSAnalysisResult {
  totalRules: number;
  totalDeclarations: number;
  fileSize: number;
  
  // Rule analysis
  selectors: {
    unique: string[];
    duplicated: Array<{ selector: string; count: number }>;
    complex: Array<{ selector: string; specificity: number; complexity: number }>;
    unused: string[];
  };
  
  // Property analysis
  properties: {
    common: Array<{ property: string; count: number }>;
    deprecated: Array<{ property: string; alternatives: string[] }>;
    vendor: Array<{ property: string; standardVersion?: string }>;
  };
  
  // Critical CSS identification
  critical: {
    aboveFoldSelectors: string[];
    layoutSelectors: string[];
    fontSelectors: string[];
    colorSelectors: string[];
    estimatedSize: number;
  };
  
  // Dependencies and imports
  dependencies: {
    imports: Array<{ url: string; media?: string; supports?: string }>;
    fontFaces: Array<{ family: string; src: string[]; weight?: string; style?: string }>;
    customProperties: Array<{ name: string; value: string; scope: string }>;
  };
  
  // Performance metrics
  performance: {
    renderBlockingRules: CSSRule[];
    largeValues: Array<{ property: string; value: string; size: number }>;
    inefficientSelectors: Array<{ selector: string; reason: string }>;
    redundantRules: Array<{ selector: string; duplicateCount: number }>;
  };
  
  // Safety metrics
  safetyMetrics: {
    modificationRiskScore: number; // 0-100
    criticalRuleCount: number;
    complexSelectorCount: number;
    vendorPrefixCount: number;
    customPropertyCount: number;
  };
  
  // Optimization opportunities
  optimizationOpportunities: {
    purgeable: Array<{ selector: string; reason: string; savings: number }>;
    mergeable: Array<{ selectors: string[]; reason: string }>;
    minifiable: { estimatedSavings: number; techniques: string[] };
  };
}

export interface CSSModificationPlan {
  changes: CSSModification[];
  riskAssessment: {
    overall: 'low' | 'medium' | 'high' | 'critical';
    factors: string[];
    mitigations: string[];
  };
  expectedSavings: {
    sizeReduction: number; // bytes
    ruleReduction: number; // count
    selectorReduction: number; // count
  };
  testingRequirements: {
    visualTests: string[];
    responsiveTests: string[];
    interactionTests: string[];
  };
}

export interface CSSModification {
  id: string;
  type: 'remove' | 'modify' | 'merge' | 'split' | 'minify';
  target: {
    selector?: string;
    property?: string;
    rule?: CSSRule;
  };
  change: {
    newValue?: string;
    newSelector?: string;
    mergeWith?: string[];
    remove?: boolean;
  };
  reason: string;
  impact: 'performance' | 'maintainability' | 'size' | 'critical';
  riskLevel: 'low' | 'medium' | 'high';
  estimatedSavings: number; // bytes
  verification: string[];
}

export class CSSAnalyzer {
  private analysisCache = new Map<string, CSSAnalysisResult>();

  /**
   * Analyze CSS content for structure, dependencies, and optimization opportunities
   */
  async analyzeCSS(css: string, options?: {
    htmlContent?: string;
    usageData?: Record<string, boolean>;
    criticalViewport?: { width: number; height: number };
  }): Promise<CSSAnalysisResult> {
    const cacheKey = this.generateCacheKey(css, options);
    
    if (this.analysisCache.has(cacheKey)) {
      return this.analysisCache.get(cacheKey)!;
    }

    let ast;
    try {
      ast = parseCSS(css, { silent: true });
    } catch (error) {
      throw new Error(`Failed to parse CSS: ${(error as Error).message}`);
    }

    const analysis: CSSAnalysisResult = {
      totalRules: 0,
      totalDeclarations: 0,
      fileSize: new Blob([css]).size,
      selectors: this.analyzeSelectors(ast, options),
      properties: this.analyzeProperties(ast),
      critical: await this.identifyCriticalCSS(ast, options),
      dependencies: this.analyzeDependencies(ast),
      performance: this.analyzePerformance(ast),
      safetyMetrics: this.calculateSafetyMetrics(ast),
      optimizationOpportunities: this.identifyOptimizationOpportunities(ast, options)
    };

    // Set totals
    analysis.totalRules = this.countRules(ast);
    analysis.totalDeclarations = this.countDeclarations(ast);

    this.analysisCache.set(cacheKey, analysis);
    return analysis;
  }

  /**
   * Generate CSS modification plan for optimization
   */
  async generateOptimizationPlan(
    css: string,
    optimizations: string[],
    options?: {
      aggressiveness?: 'conservative' | 'moderate' | 'aggressive';
      preserveVendorPrefixes?: boolean;
      htmlContent?: string;
    }
  ): Promise<CSSModificationPlan> {
    const analysis = await this.analyzeCSS(css, options);
    const modifications: CSSModification[] = [];

    for (const optimization of optimizations) {
      const mods = await this.generateModificationsForOptimization(
        optimization, 
        analysis, 
        options
      );
      modifications.push(...mods);
    }

    // Calculate expected savings
    const expectedSavings = this.calculateExpectedSavings(modifications);
    
    // Assess risk
    const riskAssessment = this.assessOptimizationRisk(modifications, analysis);
    
    // Generate testing requirements
    const testingRequirements = this.generateTestingRequirements(modifications, analysis);

    return {
      changes: modifications,
      riskAssessment,
      expectedSavings,
      testingRequirements
    };
  }

  /**
   * Extract critical CSS for above-the-fold content
   */
  async extractCriticalCSS(
    css: string,
    htmlContent: string,
    viewport: { width: number; height: number } = { width: 1440, height: 900 }
  ): Promise<{
    critical: string;
    nonCritical: string;
    stats: {
      originalSize: number;
      criticalSize: number;
      compressionRatio: number;
    };
  }> {
    const analysis = await this.analyzeCSS(css, { htmlContent, criticalViewport: viewport });
    
    let ast;
    try {
      ast = parseCSS(css);
    } catch (error) {
      throw new Error(`Failed to parse CSS: ${(error as Error).message}`);
    }

    const criticalRules: any[] = [];
    const nonCriticalRules: any[] = [];

    // Separate critical from non-critical rules
    this.traverseRules(ast.stylesheet?.rules || [], (rule: any) => {
      if (this.isCriticalRule(rule, analysis.critical)) {
        criticalRules.push(rule);
      } else {
        nonCriticalRules.push(rule);
      }
    });

    const critical = this.generateCSSFromRules(criticalRules);
    const nonCritical = this.generateCSSFromRules(nonCriticalRules);

    return {
      critical,
      nonCritical,
      stats: {
        originalSize: css.length,
        criticalSize: critical.length,
        compressionRatio: critical.length / css.length
      }
    };
  }

  /**
   * Remove unused CSS rules safely
   */
  async removeUnusedCSS(
    css: string,
    usageData: Record<string, boolean>,
    options?: {
      safelist?: string[];
      removeKeyframes?: boolean;
      removeCustomProperties?: boolean;
    }
  ): Promise<{
    optimizedCSS: string;
    removedRules: string[];
    stats: {
      originalRules: number;
      removedRules: number;
      sizeSavings: number;
    };
  }> {
    const analysis = await this.analyzeCSS(css, { usageData });
    
    let ast;
    try {
      ast = parseCSS(css);
    } catch (error) {
      throw new Error(`Failed to parse CSS: ${(error as Error).message}`);
    }

    const removedRules: string[] = [];
    const keptRules: any[] = [];

    // Filter rules based on usage
    this.traverseRules(ast.stylesheet?.rules || [], (rule: any) => {
      if (this.shouldKeepRule(rule, usageData, options)) {
        keptRules.push(rule);
      } else {
        removedRules.push(this.serializeRule(rule));
      }
    });

    const optimizedCSS = this.generateCSSFromRules(keptRules);

    return {
      optimizedCSS,
      removedRules,
      stats: {
        originalRules: analysis.totalRules,
        removedRules: removedRules.length,
        sizeSavings: css.length - optimizedCSS.length
      }
    };
  }

  // Private analysis methods

  private analyzeSelectors(ast: any, options?: any): CSSAnalysisResult['selectors'] {
    const selectors: string[] = [];
    const selectorCounts = new Map<string, number>();

    this.traverseRules(ast.stylesheet.rules, (rule: any) => {
      if (rule.type === 'rule' && rule.selectors) {
        rule.selectors.forEach((selector: string) => {
          selectors.push(selector);
          selectorCounts.set(selector, (selectorCounts.get(selector) || 0) + 1);
        });
      }
    });

    const unique = Array.from(new Set(selectors));
    const duplicated = Array.from(selectorCounts.entries())
      .filter(([_, count]) => count > 1)
      .map(([selector, count]) => ({ selector, count }))
      .sort((a, b) => b.count - a.count);

    const complex = unique
      .map(selector => ({
        selector,
        specificity: this.calculateSpecificity(selector),
        complexity: this.calculateSelectorComplexity(selector)
      }))
      .filter(s => s.complexity > 5)
      .sort((a, b) => b.complexity - a.complexity);

    // Determine unused selectors (simplified)
    const unused = options?.usageData 
      ? unique.filter(selector => !this.isSelectorUsed(selector, options.usageData))
      : [];

    return { unique, duplicated, complex, unused };
  }

  private analyzeProperties(ast: any): CSSAnalysisResult['properties'] {
    const propertyCounts = new Map<string, number>();
    const deprecatedProps = new Set([
      'zoom', 'filter', '-webkit-appearance', '-moz-appearance'
    ]);
    const vendorPrefixes = new Set([
      '-webkit-', '-moz-', '-ms-', '-o-'
    ]);

    this.traverseRules(ast.stylesheet.rules, (rule: any) => {
      if (rule.declarations) {
        rule.declarations.forEach((decl: any) => {
          if (decl.type === 'declaration') {
            const prop = decl.property;
            propertyCounts.set(prop, (propertyCounts.get(prop) || 0) + 1);
          }
        });
      }
    });

    const common = Array.from(propertyCounts.entries())
      .map(([property, count]) => ({ property, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    const deprecated = Array.from(propertyCounts.keys())
      .filter(prop => deprecatedProps.has(prop))
      .map(property => ({
        property,
        alternatives: this.getAlternatives(property)
      }));

    const vendor = Array.from(propertyCounts.keys())
      .filter(prop => Array.from(vendorPrefixes).some(prefix => prop.startsWith(prefix)))
      .map(property => ({
        property,
        standardVersion: this.getStandardVersion(property)
      }));

    return { common, deprecated, vendor };
  }

  private async identifyCriticalCSS(ast: any, options?: any): Promise<CSSAnalysisResult['critical']> {
    const criticalSelectors: string[] = [];

    // Common critical selectors
    const criticalPatterns = [
      'html', 'body', 'head',
      'h1', 'h2', 'h3', 'p',
      '.hero', '.header', '.nav', '.navigation',
      '[class*="above-fold"]', '[class*="header"]',
      'main', 'article'
    ];

    this.traverseRules(ast.stylesheet.rules, (rule: any) => {
      if (rule.type === 'rule' && rule.selectors) {
        rule.selectors.forEach((selector: string) => {
          if (this.isCriticalSelector(selector, criticalPatterns)) {
            criticalSelectors.push(selector);
          }
        });
      }
    });

    // Identify layout-affecting properties
    const layoutSelectors = this.identifyLayoutSelectors(ast);
    const fontSelectors = this.identifyFontSelectors(ast);
    const colorSelectors = this.identifyColorSelectors(ast);

    return {
      aboveFoldSelectors: criticalSelectors,
      layoutSelectors,
      fontSelectors,
      colorSelectors,
      estimatedSize: this.estimateCriticalSize(criticalSelectors)
    };
  }

  private analyzeDependencies(ast: any): CSSAnalysisResult['dependencies'] {
    const imports: any[] = [];
    const fontFaces: any[] = [];
    const customProperties: any[] = [];

    this.traverseRules(ast.stylesheet.rules, (rule: any) => {
      switch (rule.type) {
        case 'import':
          imports.push({
            url: rule.import,
            media: rule.media,
            supports: rule.supports
          });
          break;

        case 'font-face':
          const fontFamily = rule.declarations?.find((d: any) => d.property === 'font-family')?.value;
          const src = rule.declarations?.filter((d: any) => d.property === 'src').map((d: any) => d.value);
          fontFaces.push({
            family: fontFamily,
            src,
            weight: rule.declarations?.find((d: any) => d.property === 'font-weight')?.value,
            style: rule.declarations?.find((d: any) => d.property === 'font-style')?.value
          });
          break;

        case 'rule':
          if (rule.declarations) {
            rule.declarations.forEach((decl: any) => {
              if (decl.property?.startsWith('--')) {
                customProperties.push({
                  name: decl.property,
                  value: decl.value,
                  scope: rule.selectors?.[0] || 'unknown'
                });
              }
            });
          }
          break;
      }
    });

    return { imports, fontFaces, customProperties };
  }

  private analyzePerformance(ast: any): CSSAnalysisResult['performance'] {
    const renderBlockingRules: CSSRule[] = [];
    const largeValues: any[] = [];
    const inefficientSelectors: any[] = [];
    const redundantRules: any[] = [];

    this.traverseRules(ast.stylesheet.rules, (rule: any) => {
      if (rule.type === 'rule') {
        // Check for inefficient selectors
        if (rule.selectors) {
          rule.selectors.forEach((selector: string) => {
            if (this.isInefficientSelector(selector)) {
              inefficientSelectors.push({
                selector,
                reason: this.getInefficiencyReason(selector)
              });
            }
          });
        }

        // Check for large values
        if (rule.declarations) {
          rule.declarations.forEach((decl: any) => {
            if (decl.value && decl.value.length > 100) {
              largeValues.push({
                property: decl.property,
                value: decl.value,
                size: decl.value.length
              });
            }
          });
        }
      }
    });

    return {
      renderBlockingRules,
      largeValues,
      inefficientSelectors,
      redundantRules
    };
  }

  private calculateSafetyMetrics(ast: any): CSSAnalysisResult['safetyMetrics'] {
    let criticalRuleCount = 0;
    let complexSelectorCount = 0;
    let vendorPrefixCount = 0;
    let customPropertyCount = 0;

    this.traverseRules(ast.stylesheet.rules, (rule: any) => {
      if (rule.type === 'rule') {
        if (rule.selectors) {
          rule.selectors.forEach((selector: string) => {
            if (this.isCriticalSelector(selector, ['html', 'body', '*'])) {
              criticalRuleCount++;
            }
            if (this.calculateSelectorComplexity(selector) > 5) {
              complexSelectorCount++;
            }
          });
        }

        if (rule.declarations) {
          rule.declarations.forEach((decl: any) => {
            if (decl.property?.startsWith('-')) {
              vendorPrefixCount++;
            }
            if (decl.property?.startsWith('--')) {
              customPropertyCount++;
            }
          });
        }
      }
    });

    // Calculate risk score
    let riskScore = 0;
    riskScore += criticalRuleCount * 10;
    riskScore += complexSelectorCount * 5;
    riskScore += vendorPrefixCount * 2;
    riskScore = Math.min(100, riskScore);

    return {
      modificationRiskScore: riskScore,
      criticalRuleCount,
      complexSelectorCount,
      vendorPrefixCount,
      customPropertyCount
    };
  }

  private identifyOptimizationOpportunities(ast: any, options?: any): CSSAnalysisResult['optimizationOpportunities'] {
    const purgeable: any[] = [];
    const mergeable: any[] = [];
    
    // Find purgeable rules
    if (options?.usageData) {
      this.traverseRules(ast.stylesheet.rules, (rule: any) => {
        if (rule.type === 'rule' && rule.selectors) {
          const unusedSelectors = rule.selectors.filter((sel: string) => 
            !this.isSelectorUsed(sel, options.usageData)
          );
          
          if (unusedSelectors.length > 0) {
            purgeable.push({
              selector: unusedSelectors.join(', '),
              reason: 'Selector not found in HTML',
              savings: this.estimateRuleSavings(rule)
            });
          }
        }
      });
    }

    // Estimate minification savings
    const minifiable = {
      estimatedSavings: this.estimateMinificationSavings(ast),
      techniques: ['whitespace removal', 'comment removal', 'property optimization']
    };

    return { purgeable, mergeable, minifiable };
  }

  // Helper methods

  private traverseRules(rules: any[], callback: (rule: any) => void) {
    rules?.forEach(rule => {
      callback(rule);
      if (rule.rules) {
        this.traverseRules(rule.rules, callback);
      }
    });
  }

  private countRules(ast: any): number {
    let count = 0;
    this.traverseRules(ast.stylesheet.rules, (rule) => {
      if (rule.type === 'rule') count++;
    });
    return count;
  }

  private countDeclarations(ast: any): number {
    let count = 0;
    this.traverseRules(ast.stylesheet.rules, (rule) => {
      if (rule.declarations) {
        count += rule.declarations.length;
      }
    });
    return count;
  }

  private calculateSpecificity(selector: string): number {
    // Simplified specificity calculation
    let specificity = 0;
    specificity += (selector.match(/#/g) || []).length * 100;  // IDs
    specificity += (selector.match(/\./g) || []).length * 10;   // Classes
    specificity += (selector.match(/[a-zA-Z]/g) || []).length; // Elements
    return specificity;
  }

  private calculateSelectorComplexity(selector: string): number {
    // Count combinators and pseudo-selectors
    const combinators = selector.match(/[>+~]/g) || [];
    const pseudos = selector.match(/:/g) || [];
    const parts = selector.split(/\s+/);
    
    return combinators.length + pseudos.length + parts.length;
  }

  private isSelectorUsed(selector: string, usageData: Record<string, boolean>): boolean {
    // Simplified usage check
    const normalized = selector.replace(/[>#.]/g, '').split(/\s+/)[0];
    return usageData[normalized] === true;
  }

  private isCriticalSelector(selector: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(selector);
      }
      return selector.includes(pattern);
    });
  }

  private identifyLayoutSelectors(ast: any): string[] {
    const layoutProperties = [
      'display', 'position', 'float', 'clear',
      'width', 'height', 'margin', 'padding',
      'top', 'left', 'right', 'bottom'
    ];

    const selectors: string[] = [];
    
    this.traverseRules(ast.stylesheet.rules, (rule: any) => {
      if (rule.type === 'rule' && rule.declarations && rule.selectors) {
        const hasLayoutProps = rule.declarations.some((decl: any) => 
          layoutProperties.includes(decl.property)
        );
        
        if (hasLayoutProps) {
          selectors.push(...rule.selectors);
        }
      }
    });

    return selectors;
  }

  private identifyFontSelectors(ast: any): string[] {
    const fontProperties = [
      'font-family', 'font-size', 'font-weight', 'font-style',
      'line-height', 'letter-spacing', 'text-transform'
    ];

    const selectors: string[] = [];
    
    this.traverseRules(ast.stylesheet.rules, (rule: any) => {
      if (rule.type === 'rule' && rule.declarations && rule.selectors) {
        const hasFontProps = rule.declarations.some((decl: any) => 
          fontProperties.includes(decl.property)
        );
        
        if (hasFontProps) {
          selectors.push(...rule.selectors);
        }
      }
    });

    return selectors;
  }

  private identifyColorSelectors(ast: any): string[] {
    const colorProperties = [
      'color', 'background-color', 'border-color',
      'background', 'border'
    ];

    const selectors: string[] = [];
    
    this.traverseRules(ast.stylesheet.rules, (rule: any) => {
      if (rule.type === 'rule' && rule.declarations && rule.selectors) {
        const hasColorProps = rule.declarations.some((decl: any) => 
          colorProperties.includes(decl.property)
        );
        
        if (hasColorProps) {
          selectors.push(...rule.selectors);
        }
      }
    });

    return selectors;
  }

  private estimateCriticalSize(selectors: string[]): number {
    // Rough estimate: selector length + avg 50 chars per declaration
    return selectors.reduce((size, sel) => size + sel.length + 50, 0);
  }

  private getAlternatives(property: string): string[] {
    const alternatives: Record<string, string[]> = {
      'zoom': ['transform: scale()'],
      'filter': ['backdrop-filter', 'CSS filters'],
      '-webkit-appearance': ['appearance'],
      '-moz-appearance': ['appearance']
    };
    
    return alternatives[property] || [];
  }

  private getStandardVersion(property: string): string | undefined {
    const standards: Record<string, string> = {
      '-webkit-appearance': 'appearance',
      '-moz-appearance': 'appearance',
      '-webkit-transform': 'transform',
      '-moz-transform': 'transform'
    };
    
    return standards[property];
  }

  private isInefficientSelector(selector: string): boolean {
    // Universal selector at the end is inefficient
    if (selector.endsWith('*')) return true;
    
    // Overly complex selectors
    if (this.calculateSelectorComplexity(selector) > 10) return true;
    
    // Multiple class selectors without descendant combinator
    if (selector.match(/\.[a-zA-Z-]+\.[a-zA-Z-]+/) && !selector.includes(' ')) return true;
    
    return false;
  }

  private getInefficiencyReason(selector: string): string {
    if (selector.endsWith('*')) return 'Universal selector is inefficient';
    if (this.calculateSelectorComplexity(selector) > 10) return 'Overly complex selector';
    return 'Potentially inefficient selector pattern';
  }

  private estimateRuleSavings(rule: any): number {
    // Rough estimate of bytes saved by removing this rule
    let size = 0;
    
    if (rule.selectors) {
      size += rule.selectors.join(',').length;
    }
    
    if (rule.declarations) {
      size += rule.declarations.reduce((acc: number, decl: any) => {
        return acc + (decl.property?.length || 0) + (decl.value?.length || 0) + 5; // +5 for syntax
      }, 0);
    }
    
    return size;
  }

  private estimateMinificationSavings(ast: any): number {
    // Rough estimate: 20-30% savings from minification
    const totalSize = JSON.stringify(ast).length;
    return Math.round(totalSize * 0.25);
  }

  private isCriticalRule(rule: any, critical: CSSAnalysisResult['critical']): boolean {
    if (rule.type !== 'rule' || !rule.selectors) return false;
    
    return rule.selectors.some((selector: string) => 
      critical.aboveFoldSelectors.includes(selector) ||
      critical.layoutSelectors.includes(selector) ||
      critical.fontSelectors.includes(selector)
    );
  }

  private shouldKeepRule(rule: any, usageData: Record<string, boolean>, options?: any): boolean {
    // Always keep critical rules
    if (rule.type === 'font-face' || rule.type === 'keyframes') {
      return !(options?.removeKeyframes && rule.type === 'keyframes');
    }
    
    if (rule.type === 'rule' && rule.selectors) {
      // Keep if any selector is used or in safelist
      return rule.selectors.some((selector: string) => 
        this.isSelectorUsed(selector, usageData) ||
        options?.safelist?.some((safe: string) => selector.includes(safe))
      );
    }
    
    return true; // Keep by default
  }

  private serializeRule(rule: any): string {
    // Convert rule back to CSS string
    if (rule.selectors) {
      return rule.selectors.join(', ');
    }
    return rule.type || 'unknown-rule';
  }

  private generateCSSFromRules(rules: any[]): string {
    // Simplified CSS generation
    return rules.map(rule => this.serializeRule(rule)).join('\n');
  }

  private generateCacheKey(css: string, options?: any): string {
    return `${css.length}-${JSON.stringify(options || {})}`;
  }

  private async generateModificationsForOptimization(
    optimization: string,
    analysis: CSSAnalysisResult,
    options?: any
  ): Promise<CSSModification[]> {
    const modifications: CSSModification[] = [];

    switch (optimization) {
      case 'remove-unused-css':
        modifications.push(...this.generateUnusedCSSModifications(analysis));
        break;
      case 'minify-css':
        modifications.push(...this.generateMinificationModifications(analysis));
        break;
      case 'merge-duplicate-rules':
        modifications.push(...this.generateMergeModifications(analysis));
        break;
    }

    return modifications;
  }

  private generateUnusedCSSModifications(analysis: CSSAnalysisResult): CSSModification[] {
    return analysis.selectors.unused.map((selector, index) => ({
      id: `remove-unused-${index}`,
      type: 'remove' as const,
      target: { selector },
      change: { remove: true },
      reason: 'Remove unused CSS selector',
      impact: 'size' as const,
      riskLevel: 'medium' as const,
      estimatedSavings: 100, // Rough estimate
      verification: ['Check visual appearance', 'Test responsive design']
    }));
  }

  private generateMinificationModifications(analysis: CSSAnalysisResult): CSSModification[] {
    return [{
      id: 'minify-all',
      type: 'minify',
      target: {},
      change: {},
      reason: 'Minify CSS for smaller file size',
      impact: 'size',
      riskLevel: 'low',
      estimatedSavings: analysis.optimizationOpportunities.minifiable.estimatedSavings,
      verification: ['Check CSS still valid', 'Verify visual appearance']
    }];
  }

  private generateMergeModifications(analysis: CSSAnalysisResult): CSSModification[] {
    return analysis.selectors.duplicated.map((dup, index) => ({
      id: `merge-duplicate-${index}`,
      type: 'merge',
      target: { selector: dup.selector },
      change: { mergeWith: [dup.selector] },
      reason: `Merge ${dup.count} duplicate rules`,
      impact: 'size',
      riskLevel: 'low',
      estimatedSavings: dup.count * 50,
      verification: ['Check merged rules work correctly']
    }));
  }

  private calculateExpectedSavings(modifications: CSSModification[]) {
    return {
      sizeReduction: modifications.reduce((total, mod) => total + mod.estimatedSavings, 0),
      ruleReduction: modifications.filter(m => m.type === 'remove').length,
      selectorReduction: modifications.filter(m => m.type === 'remove' || m.type === 'merge').length
    };
  }

  private assessOptimizationRisk(modifications: CSSModification[], analysis: CSSAnalysisResult) {
    const highRiskCount = modifications.filter(m => m.riskLevel === 'high').length;
    const mediumRiskCount = modifications.filter(m => m.riskLevel === 'medium').length;
    
    let overall: 'low' | 'medium' | 'high' | 'critical' = 'low';
    const factors: string[] = [];
    const mitigations: string[] = [];

    if (highRiskCount > 0) {
      overall = 'high';
      factors.push(`${highRiskCount} high-risk modifications`);
      mitigations.push('Visual regression testing required');
    } else if (mediumRiskCount > 5) {
      overall = 'medium';
      factors.push(`${mediumRiskCount} medium-risk modifications`);
      mitigations.push('Responsive design testing recommended');
    }

    if (analysis.safetyMetrics.criticalRuleCount > 10) {
      factors.push('Many critical CSS rules present');
      mitigations.push('Careful testing of layout and styling');
    }

    return { overall, factors, mitigations };
  }

  private generateTestingRequirements(modifications: CSSModification[], analysis: CSSAnalysisResult) {
    const visualTests: string[] = ['Compare before/after screenshots'];
    const responsiveTests: string[] = ['Test across mobile, tablet, desktop'];
    const interactionTests: string[] = ['Test hover states and animations'];

    // Add specific tests based on modification types
    modifications.forEach(mod => {
      if (mod.type === 'remove') {
        visualTests.push(`Verify removal of ${mod.target.selector} doesn't break layout`);
      }
      if (mod.riskLevel === 'high') {
        responsiveTests.push(`Extra responsive testing for ${mod.target.selector}`);
      }
    });

    return { visualTests, responsiveTests, interactionTests };
  }
}

// Export singleton instance
export const cssAnalyzer = new CSSAnalyzer();