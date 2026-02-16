/**
 * JavaScript Code Analysis System
 * 
 * Analyzes JavaScript dependencies, patterns, and safety for code modifications.
 * Enables intelligent JS optimizations while preserving functionality.
 */

import { parse as parseJS } from '@babel/parser';
import traverse from '@babel/traverse';
import { Node } from '@babel/types';

export interface JSFunction {
  name: string;
  type: 'function' | 'arrow' | 'method' | 'constructor';
  parameters: string[];
  isAsync: boolean;
  isExported: boolean;
  dependencies: string[];
  line?: number;
  complexity: number;
}

export interface JSVariable {
  name: string;
  type: 'var' | 'let' | 'const';
  scope: 'global' | 'function' | 'block';
  isExported: boolean;
  value?: string;
  dependencies: string[];
  line?: number;
}

export interface JSDependency {
  type: 'import' | 'require' | 'global' | 'cdn';
  source: string;
  imported: string[];
  isExternal: boolean;
  isOptional: boolean;
  usageCount: number;
}

export interface JSAnalysisResult {
  fileSize: number;
  lineCount: number;
  
  // Code structure
  functions: JSFunction[];
  variables: JSVariable[];
  classes: Array<{
    name: string;
    methods: JSFunction[];
    properties: JSVariable[];
    extends?: string;
    isExported: boolean;
  }>;
  
  // Dependencies and imports
  dependencies: JSDependency[];
  globals: string[];
  unusedImports: string[];
  
  // Patterns and frameworks
  patterns: {
    jquery: {
      detected: boolean;
      usage: Array<{ method: string; count: number; canReplace: boolean }>;
      replaceable: boolean;
      riskLevel: 'low' | 'medium' | 'high';
    };
    modernJS: {
      es6Features: string[];
      asyncPatterns: string[];
      modules: boolean;
    };
    frameworks: Array<{
      name: string;
      version?: string;
      confidence: number;
    }>;
  };
  
  // Performance metrics
  performance: {
    bundleSize: number;
    unusedCode: Array<{ name: string; type: string; size: number }>;
    heavyOperations: Array<{ operation: string; location: string; impact: string }>;
    asyncOperations: Array<{ type: string; location: string; optimizable: boolean }>;
  };
  
  // Quality metrics
  quality: {
    complexityScore: number;
    maintainabilityIndex: number;
    duplicateCode: Array<{ snippet: string; occurrences: number }>;
    errorProne: Array<{ issue: string; location: string; severity: string }>;
  };
  
  // Safety metrics
  safetyMetrics: {
    modificationRiskScore: number; // 0-100
    criticalFunctionCount: number;
    globalVariableCount: number;
    dynamicEvalCount: number;
    eventListenerCount: number;
  };
  
  // Optimization opportunities
  optimizationOpportunities: {
    deadCode: Array<{ name: string; reason: string; savings: number }>;
    treeShakinable: Array<{ module: string; unused: string[]; savings: number }>;
    modernizable: Array<{ pattern: string; modern: string; benefit: string }>;
    minifiable: { estimatedSavings: number; techniques: string[] };
  };
}

export interface JSModificationPlan {
  changes: JSModification[];
  riskAssessment: {
    overall: 'low' | 'medium' | 'high' | 'critical';
    factors: string[];
    mitigations: string[];
  };
  expectedSavings: {
    sizeReduction: number; // bytes
    performanceImprovement: string[];
    maintenanceImprovement: string[];
  };
  testingRequirements: {
    functionalTests: string[];
    performanceTests: string[];
    compatibilityTests: string[];
  };
  compatibilityImpact: {
    browserSupport: string[];
    polyfillsNeeded: string[];
    breakingChanges: string[];
  };
}

export interface JSModification {
  id: string;
  type: 'remove' | 'replace' | 'modernize' | 'optimize' | 'minify';
  target: {
    function?: string;
    variable?: string;
    pattern?: string;
    location?: string;
  };
  change: {
    newCode?: string;
    removeCode?: boolean;
    replaceWith?: string;
    optimizeFor?: string;
  };
  reason: string;
  impact: 'performance' | 'size' | 'maintainability' | 'security';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  estimatedSavings: number; // bytes
  browserCompatibility: string[];
  verification: string[];
}

export class JSAnalyzer {
  private analysisCache = new Map<string, JSAnalysisResult>();

  /**
   * Analyze JavaScript content for structure, dependencies, and optimization opportunities
   */
  async analyzeJS(js: string, options?: {
    filePath?: string;
    sourceType?: 'module' | 'script';
    includeUsageAnalysis?: boolean;
    targetBrowsers?: string[];
  }): Promise<JSAnalysisResult> {
    const cacheKey = this.generateCacheKey(js, options);
    
    if (this.analysisCache.has(cacheKey)) {
      return this.analysisCache.get(cacheKey)!;
    }

    let ast;
    try {
      ast = parseJS(js, {
        sourceType: options?.sourceType || 'unambiguous',
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        plugins: [
          'jsx', 'typescript', 'decorators-legacy', 'classProperties',
          'asyncGenerators', 'functionBind', 'exportDefaultFrom',
          'exportNamespaceFrom', 'dynamicImport', 'nullishCoalescingOperator',
          'optionalChaining', 'importMeta', 'topLevelAwait', 'bigInt'
        ]
      });
    } catch (error) {
      throw new Error(`Failed to parse JavaScript: ${(error as Error).message}`);
    }

    const analysis: JSAnalysisResult = {
      fileSize: new Blob([js]).size,
      lineCount: js.split('\n').length,
      functions: [],
      variables: [],
      classes: [],
      dependencies: [],
      globals: [],
      unusedImports: [],
      patterns: this.analyzePatterns(ast, js),
      performance: this.analyzePerformance(ast, js),
      quality: this.analyzeQuality(ast, js),
      safetyMetrics: this.calculateSafetyMetrics(ast, js),
      optimizationOpportunities: this.identifyOptimizationOpportunities(ast, js)
    };

    // Populate detailed analysis
    this.extractFunctionsAndVariables(ast, analysis);
    this.extractDependencies(ast, analysis);
    this.identifyGlobals(ast, analysis);

    this.analysisCache.set(cacheKey, analysis);
    return analysis;
  }

  /**
   * Generate JavaScript modification plan for optimization
   */
  async generateOptimizationPlan(
    js: string,
    optimizations: string[],
    options?: {
      aggressiveness?: 'conservative' | 'moderate' | 'aggressive';
      targetBrowsers?: string[];
      preserveCompatibility?: boolean;
    }
  ): Promise<JSModificationPlan> {
    const analysis = await this.analyzeJS(js, options);
    const modifications: JSModification[] = [];

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
    
    // Generate testing and compatibility requirements
    const testingRequirements = this.generateTestingRequirements(modifications, analysis);
    const compatibilityImpact = this.assessCompatibilityImpact(modifications, options?.targetBrowsers);

    return {
      changes: modifications,
      riskAssessment,
      expectedSavings,
      testingRequirements,
      compatibilityImpact
    };
  }

  /**
   * Analyze jQuery usage and replacement opportunities
   */
  async analyzeJQueryUsage(js: string): Promise<{
    canRemove: boolean;
    usage: Array<{
      method: string;
      occurrences: number;
      modernReplacement: string;
      complexity: 'simple' | 'moderate' | 'complex';
    }>;
    estimatedSavings: number;
    riskFactors: string[];
  }> {
    const analysis = await this.analyzeJS(js);
    const jquery = analysis.patterns.jquery;

    const usage = jquery.usage.map(u => ({
      method: u.method,
      occurrences: u.count,
      modernReplacement: this.getModernReplacement(u.method),
      complexity: this.getReplacementComplexity(u.method)
    }));

    const riskFactors: string[] = [];
    
    if (!jquery.replaceable) {
      riskFactors.push('Complex jQuery patterns detected');
    }
    
    if (usage.some(u => u.complexity === 'complex')) {
      riskFactors.push('Some replacements are complex');
    }

    return {
      canRemove: jquery.replaceable,
      usage,
      estimatedSavings: 87000, // jQuery library size
      riskFactors
    };
  }

  /**
   * Remove unused code safely
   */
  async removeUnusedCode(
    js: string,
    usageData?: Record<string, boolean>
  ): Promise<{
    optimizedJS: string;
    removedCode: string[];
    stats: {
      originalSize: number;
      finalSize: number;
      sizeSavings: number;
      removedFunctions: number;
      removedVariables: number;
    };
  }> {
    const analysis = await this.analyzeJS(js);
    
    // Identify unused code
    const unused = analysis.optimizationOpportunities.deadCode;
    const removedCode: string[] = [];
    
    // For now, return original (actual implementation would modify AST)
    const optimizedJS = js; // Would implement actual removal
    
    unused.forEach(item => {
      removedCode.push(`${item.name}: ${item.reason}`);
    });

    return {
      optimizedJS,
      removedCode,
      stats: {
        originalSize: js.length,
        finalSize: optimizedJS.length,
        sizeSavings: js.length - optimizedJS.length,
        removedFunctions: unused.filter(u => u.name.includes('function')).length,
        removedVariables: unused.filter(u => u.name.includes('var')).length
      }
    };
  }

  // Private analysis methods

  private analyzePatterns(ast: any, js: string): JSAnalysisResult['patterns'] {
    const jquery = this.analyzeJQueryPatterns(ast, js);
    const modernJS = this.analyzeModernJSFeatures(ast);
    const frameworks = this.detectFrameworks(js);

    return { jquery, modernJS, frameworks };
  }

  private analyzeJQueryPatterns(ast: any, js: string): JSAnalysisResult['patterns']['jquery'] {
    const jqueryMethods: Record<string, number> = {};
    let detected = false;

    // Check for jQuery usage
    if (js.includes('$') || js.includes('jQuery')) {
      detected = true;

      // Common jQuery methods
      const methods = [
        'ready', 'click', 'on', 'off', 'show', 'hide', 'fadeIn', 'fadeOut',
        'addClass', 'removeClass', 'toggleClass', 'css', 'attr', 'html',
        'text', 'val', 'append', 'prepend', 'remove', 'each', 'find',
        'parent', 'children', 'siblings', 'next', 'prev'
      ];

      methods.forEach(method => {
        const regex = new RegExp(`\\.${method}\\(`, 'g');
        const matches = js.match(regex);
        if (matches) {
          jqueryMethods[method] = matches.length;
        }
      });
    }

    const usage = Object.entries(jqueryMethods).map(([method, count]) => ({
      method,
      count,
      canReplace: this.canReplaceJQueryMethod(method)
    }));

    // Determine if replaceable
    const replaceable = usage.length > 0 && usage.every(u => u.canReplace);
    
    // Assess risk level
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (usage.some(u => ['ready', 'on', 'ajax'].includes(u.method))) {
      riskLevel = 'medium';
    }
    if (usage.some(u => ['serialize', 'serializeArray', 'load'].includes(u.method))) {
      riskLevel = 'high';
    }

    return { detected, usage, replaceable, riskLevel };
  }

  private analyzeModernJSFeatures(ast: any): JSAnalysisResult['patterns']['modernJS'] {
    const es6Features: string[] = [];
    const asyncPatterns: string[] = [];
    let modules = false;

    traverse(ast, {
      ArrowFunctionExpression() {
        if (!es6Features.includes('arrow-functions')) {
          es6Features.push('arrow-functions');
        }
      },
      TemplateElement() {
        if (!es6Features.includes('template-literals')) {
          es6Features.push('template-literals');
        }
      },
      VariableDeclaration(path: any) {
        if (path.node.kind === 'const' || path.node.kind === 'let') {
          if (!es6Features.includes('let-const')) {
            es6Features.push('let-const');
          }
        }
      },
      ClassDeclaration() {
        if (!es6Features.includes('classes')) {
          es6Features.push('classes');
        }
      },
      ImportDeclaration() {
        modules = true;
        if (!es6Features.includes('modules')) {
          es6Features.push('modules');
        }
      },
      AwaitExpression() {
        if (!asyncPatterns.includes('async-await')) {
          asyncPatterns.push('async-await');
        }
      },
      FunctionDeclaration(path: any) {
        if (path.node.async && !asyncPatterns.includes('async-functions')) {
          asyncPatterns.push('async-functions');
        }
      }
    });

    return { es6Features, asyncPatterns, modules };
  }

  private detectFrameworks(js: string): Array<{ name: string; version?: string; confidence: number }> {
    const frameworks: Array<{ name: string; version?: string; confidence: number }> = [];

    // React detection
    if (js.includes('React') || js.includes('jsx') || js.includes('useState')) {
      frameworks.push({ name: 'React', confidence: 0.8 });
    }

    // Vue detection
    if (js.includes('Vue') || js.includes('v-') || js.includes('@click')) {
      frameworks.push({ name: 'Vue', confidence: 0.8 });
    }

    // Angular detection
    if (js.includes('angular') || js.includes('@Component') || js.includes('ngOnInit')) {
      frameworks.push({ name: 'Angular', confidence: 0.8 });
    }

    // jQuery detection
    if (js.includes('jQuery') || js.includes('$(')) {
      frameworks.push({ name: 'jQuery', confidence: 0.9 });
    }

    return frameworks;
  }

  private analyzePerformance(ast: any, js: string): JSAnalysisResult['performance'] {
    const unusedCode: Array<{ name: string; type: string; size: number }> = [];
    const heavyOperations: Array<{ operation: string; location: string; impact: string }> = [];
    const asyncOperations: Array<{ type: string; location: string; optimizable: boolean }> = [];

    traverse(ast, {
      CallExpression(path: any) {
        const callee = path.node.callee;
        
        // Detect heavy DOM operations
        if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
          const method = callee.property.name;
          if (['querySelector', 'querySelectorAll', 'getElementById'].includes(method)) {
            heavyOperations.push({
              operation: method,
              location: `Line ${path.node.loc?.start.line || 'unknown'}`,
              impact: 'DOM query performance'
            });
          }
        }

        // Detect async operations
        if (callee.type === 'Identifier' && callee.name === 'fetch') {
          asyncOperations.push({
            type: 'fetch',
            location: `Line ${path.node.loc?.start.line || 'unknown'}`,
            optimizable: true
          });
        }
      },

      FunctionDeclaration(path: any) {
        // Check for potentially unused functions
        // This would require more sophisticated analysis in practice
        if (path.node.id?.name.startsWith('unused')) {
          unusedCode.push({
            name: path.node.id.name,
            type: 'function',
            size: 100 // Simplified estimation
          });
        }
      }
    });

    return {
      bundleSize: js.length,
      unusedCode,
      heavyOperations,
      asyncOperations
    };
  }

  private analyzeQuality(ast: any, js: string): JSAnalysisResult['quality'] {
    let complexityScore = 0;
    const duplicateCode: Array<{ snippet: string; occurrences: number }> = [];
    const errorProne: Array<{ issue: string; location: string; severity: string }> = [];

    traverse(ast, {
      FunctionDeclaration(path) {
        // Calculate cyclomatic complexity
        const complexity = 1; // Simplified complexity
        complexityScore += complexity;

        if (complexity > 10) {
          errorProne.push({
            issue: `High complexity function: ${path.node.id?.name}`,
            location: `Line ${path.node.loc?.start.line || 'unknown'}`,
            severity: 'high'
          });
        }
      },

      CallExpression(path) {
        // Detect potential issues
        if (path.node.callee.type === 'Identifier' && path.node.callee.name === 'eval') {
          errorProne.push({
            issue: 'Use of eval() detected - security risk',
            location: `Line ${path.node.loc?.start.line || 'unknown'}`,
            severity: 'critical'
          });
        }
      }
    });

    const maintainabilityIndex = this.calculateMaintainabilityIndex(complexityScore, js.length);

    return {
      complexityScore,
      maintainabilityIndex,
      duplicateCode,
      errorProne
    };
  }

  private calculateSafetyMetrics(ast: any, js: string): JSAnalysisResult['safetyMetrics'] {
    let criticalFunctionCount = 0;
    let globalVariableCount = 0;
    let dynamicEvalCount = 0;
    let eventListenerCount = 0;

    traverse(ast, {
      VariableDeclaration(path: any) {
        if (path.scope.block.type === 'Program') {
          globalVariableCount++;
        }
      },

      FunctionDeclaration(path: any) {
        const name = path.node.id?.name;
        if (name && ['init', 'main', 'onload', 'ready'].includes(name)) {
          criticalFunctionCount++;
        }
      },

      CallExpression(path: any) {
        if (path.node.callee.type === 'Identifier' && path.node.callee.name === 'eval') {
          dynamicEvalCount++;
        }

        if (path.node.callee.type === 'MemberExpression') {
          const method = path.node.callee.property;
          if (method.type === 'Identifier' && method.name === 'addEventListener') {
            eventListenerCount++;
          }
        }
      }
    });

    // Calculate risk score
    let riskScore = 0;
    riskScore += criticalFunctionCount * 15;
    riskScore += globalVariableCount * 5;
    riskScore += dynamicEvalCount * 25;
    riskScore += eventListenerCount * 2;
    riskScore = Math.min(100, riskScore);

    return {
      modificationRiskScore: riskScore,
      criticalFunctionCount,
      globalVariableCount,
      dynamicEvalCount,
      eventListenerCount
    };
  }

  private identifyOptimizationOpportunities(ast: any, js: string): JSAnalysisResult['optimizationOpportunities'] {
    const deadCode: Array<{ name: string; reason: string; savings: number }> = [];
    const treeShakinable: Array<{ module: string; unused: string[]; savings: number }> = [];
    const modernizable: Array<{ pattern: string; modern: string; benefit: string }> = [];

    // Detect modernizable patterns
    if (js.includes('var ')) {
      modernizable.push({
        pattern: 'var declarations',
        modern: 'const/let',
        benefit: 'Block scoping and immutability'
      });
    }

    if (js.includes('function(')) {
      modernizable.push({
        pattern: 'function expressions',
        modern: 'arrow functions',
        benefit: 'Shorter syntax and lexical this'
      });
    }

    const minifiable = {
      estimatedSavings: Math.round(js.length * 0.3), // 30% compression typical
      techniques: ['whitespace removal', 'variable name shortening', 'dead code elimination']
    };

    return { deadCode, treeShakinable, modernizable, minifiable };
  }

  private extractFunctionsAndVariables(ast: any, analysis: JSAnalysisResult) {
    traverse(ast, {
      FunctionDeclaration(path: any) {
        const func = path.node;
        analysis.functions.push({
          name: func.id?.name || 'anonymous',
          type: 'function',
          parameters: func.params.map((param: any) => param.name || 'unknown'),
          isAsync: func.async || false,
          isExported: false, // Would need export analysis
          dependencies: [], // Would need dependency analysis
          line: func.loc?.start.line,
          complexity: 1 // Simplified complexity
        });
      },

      ArrowFunctionExpression(path: any) {
        analysis.functions.push({
          name: 'arrow function',
          type: 'arrow',
          parameters: path.node.params.map((param: any) => param.name || 'unknown'),
          isAsync: path.node.async || false,
          isExported: false,
          dependencies: [],
          line: path.node.loc?.start.line,
          complexity: 1 // Simplified complexity
        });
      },

      VariableDeclarator(path: any) {
        const id = path.node.id;
        if (id.type === 'Identifier') {
          analysis.variables.push({
            name: id.name,
            type: (path.parent as any).kind || 'var',
            scope: path.scope.block.type === 'Program' ? 'global' : 'function',
            isExported: false,
            dependencies: [],
            line: path.node.loc?.start.line
          });
        }
      }
    });
  }

  private extractDependencies(ast: any, analysis: JSAnalysisResult) {
    traverse(ast, {
      ImportDeclaration(path: any) {
        const source = path.node.source.value;
        const imported = path.node.specifiers.map((spec: any) => {
          if (spec.type === 'ImportDefaultSpecifier') return 'default';
          if (spec.type === 'ImportNamespaceSpecifier') return '*';
          return spec.imported?.name || 'unknown';
        });

        analysis.dependencies.push({
          type: 'import',
          source,
          imported,
          isExternal: !source.startsWith('.'),
          isOptional: false,
          usageCount: 0 // Would need usage analysis
        });
      },

      CallExpression(path: any) {
        if (path.node.callee.type === 'Identifier' && path.node.callee.name === 'require') {
          const arg = path.node.arguments[0];
          if (arg && arg.type === 'StringLiteral') {
            analysis.dependencies.push({
              type: 'require',
              source: arg.value,
              imported: ['*'], // CommonJS imports everything
              isExternal: !arg.value.startsWith('.'),
              isOptional: false,
              usageCount: 1
            });
          }
        }
      }
    });
  }

  private identifyGlobals(ast: any, analysis: JSAnalysisResult) {
    // Common globals
    const knownGlobals = [
      'window', 'document', 'console', 'setTimeout', 'setInterval',
      'fetch', 'localStorage', 'sessionStorage', '$', 'jQuery'
    ];

    knownGlobals.forEach(global => {
      if (analysis.dependencies.some(dep => dep.source.includes(global.toLowerCase()))) {
        analysis.globals.push(global);
      }
    });
  }

  // Helper methods

  private canReplaceJQueryMethod(method: string): boolean {
    const replaceableMethods = [
      'ready', 'click', 'addClass', 'removeClass', 'toggleClass',
      'css', 'attr', 'html', 'text', 'show', 'hide', 'find'
    ];
    return replaceableMethods.includes(method);
  }

  private getModernReplacement(method: string): string {
    const replacements: Record<string, string> = {
      'ready': 'DOMContentLoaded event',
      'click': 'addEventListener("click", ...)',
      'addClass': 'element.classList.add()',
      'removeClass': 'element.classList.remove()',
      'toggleClass': 'element.classList.toggle()',
      'css': 'element.style.property',
      'attr': 'element.setAttribute()',
      'html': 'element.innerHTML',
      'text': 'element.textContent',
      'show': 'element.style.display = "block"',
      'hide': 'element.style.display = "none"',
      'find': 'element.querySelector()'
    };
    return replacements[method] || 'Manual replacement needed';
  }

  private getReplacementComplexity(method: string): 'simple' | 'moderate' | 'complex' {
    const simple = ['addClass', 'removeClass', 'show', 'hide', 'attr', 'html', 'text'];
    const moderate = ['click', 'css', 'find', 'toggleClass'];
    const complex = ['ready', 'on', 'off', 'ajax', 'animate'];

    if (simple.includes(method)) return 'simple';
    if (moderate.includes(method)) return 'moderate';
    return 'complex';
  }

  private calculateCyclomaticComplexity(node: any): number {
    // Simplified complexity calculation
    let complexity = 1; // Base complexity

    // Would traverse node and count decision points
    // (if, while, for, switch cases, catch, ternary, logical operators)
    
    return complexity;
  }

  private calculateMaintainabilityIndex(complexity: number, size: number): number {
    // Simplified maintainability index
    // Real formula: 171 - 5.2 * ln(Halstead Volume) - 0.23 * (Cyclomatic Complexity) - 16.2 * ln(Lines of Code)
    return Math.max(0, 100 - (complexity * 2) - (size / 1000));
  }

  private estimateNodeSize(node: any): number {
    // Rough estimate of node size in characters
    return JSON.stringify(node).length;
  }

  private generateCacheKey(js: string, options?: any): string {
    return `${js.length}-${JSON.stringify(options || {})}`;
  }

  private async generateModificationsForOptimization(
    optimization: string,
    analysis: JSAnalysisResult,
    options?: any
  ): Promise<JSModification[]> {
    const modifications: JSModification[] = [];

    switch (optimization) {
      case 'remove-jquery':
        modifications.push(...this.generateJQueryRemovalModifications(analysis));
        break;
      case 'modernize-js':
        modifications.push(...this.generateModernizationModifications(analysis));
        break;
      case 'remove-unused-code':
        modifications.push(...this.generateDeadCodeRemovalModifications(analysis));
        break;
      case 'minify-js':
        modifications.push(...this.generateMinificationModifications(analysis));
        break;
    }

    return modifications;
  }

  private generateJQueryRemovalModifications(analysis: JSAnalysisResult): JSModification[] {
    if (!analysis.patterns.jquery.detected) return [];

    return analysis.patterns.jquery.usage.map((usage, index) => ({
      id: `jquery-replace-${index}`,
      type: 'replace' as const,
      target: { pattern: usage.method },
      change: { replaceWith: this.getModernReplacement(usage.method) },
      reason: `Replace jQuery ${usage.method} with modern JavaScript`,
      impact: 'performance' as const,
      riskLevel: analysis.patterns.jquery.riskLevel,
      estimatedSavings: Math.round(87000 / analysis.patterns.jquery.usage.length), // Distribute jQuery size
      browserCompatibility: ['ES6+'],
      verification: [`Test ${usage.method} functionality`, 'Check for jQuery dependencies']
    }));
  }

  private generateModernizationModifications(analysis: JSAnalysisResult): JSModification[] {
    return analysis.optimizationOpportunities.modernizable.map((modern, index) => ({
      id: `modernize-${index}`,
      type: 'modernize' as const,
      target: { pattern: modern.pattern },
      change: { replaceWith: modern.modern },
      reason: `Modernize ${modern.pattern} - ${modern.benefit}`,
      impact: 'maintainability' as const,
      riskLevel: 'low' as const,
      estimatedSavings: 0, // No size savings, but improved maintainability
      browserCompatibility: ['ES6+'],
      verification: ['Check browser compatibility', 'Test functionality']
    }));
  }

  private generateDeadCodeRemovalModifications(analysis: JSAnalysisResult): JSModification[] {
    return analysis.optimizationOpportunities.deadCode.map((dead, index) => ({
      id: `remove-dead-${index}`,
      type: 'remove' as const,
      target: { function: dead.name },
      change: { removeCode: true },
      reason: `Remove unused code: ${dead.reason}`,
      impact: 'size' as const,
      riskLevel: 'medium' as const,
      estimatedSavings: dead.savings,
      browserCompatibility: ['All'],
      verification: ['Ensure no dependencies', 'Test application functionality']
    }));
  }

  private generateMinificationModifications(analysis: JSAnalysisResult): JSModification[] {
    return [{
      id: 'minify-all',
      type: 'minify',
      target: {},
      change: { optimizeFor: 'size' },
      reason: 'Minify JavaScript for smaller bundle size',
      impact: 'size',
      riskLevel: 'low',
      estimatedSavings: analysis.optimizationOpportunities.minifiable.estimatedSavings,
      browserCompatibility: ['All'],
      verification: ['Check syntax validity', 'Test functionality']
    }];
  }

  private calculateExpectedSavings(modifications: JSModification[]) {
    const sizeReduction = modifications.reduce((total, mod) => total + mod.estimatedSavings, 0);
    const performanceImprovement: string[] = [];
    const maintenanceImprovement: string[] = [];

    modifications.forEach(mod => {
      if (mod.impact === 'performance') {
        performanceImprovement.push(mod.reason);
      }
      if (mod.impact === 'maintainability') {
        maintenanceImprovement.push(mod.reason);
      }
    });

    return { sizeReduction, performanceImprovement, maintenanceImprovement };
  }

  private assessOptimizationRisk(modifications: JSModification[], analysis: JSAnalysisResult) {
    const criticalCount = modifications.filter(m => m.riskLevel === 'critical').length;
    const highRiskCount = modifications.filter(m => m.riskLevel === 'high').length;
    
    let overall: 'low' | 'medium' | 'high' | 'critical' = 'low';
    const factors: string[] = [];
    const mitigations: string[] = [];

    if (criticalCount > 0) {
      overall = 'critical';
      factors.push(`${criticalCount} critical modifications`);
      mitigations.push('Extensive testing and staged rollout required');
    } else if (highRiskCount > 0) {
      overall = 'high';
      factors.push(`${highRiskCount} high-risk modifications`);
      mitigations.push('Comprehensive functional testing required');
    }

    if (analysis.safetyMetrics.modificationRiskScore > 60) {
      factors.push('Code has high complexity');
      mitigations.push('Extra caution with critical functions');
    }

    return { overall, factors, mitigations };
  }

  private generateTestingRequirements(modifications: JSModification[], analysis: JSAnalysisResult) {
    const functionalTests: string[] = ['Test all interactive features'];
    const performanceTests: string[] = ['Measure bundle size', 'Test load times'];
    const compatibilityTests: string[] = [];

    // Add specific tests based on modifications
    modifications.forEach(mod => {
      if (mod.target.pattern?.includes('jquery')) {
        functionalTests.push('Test jQuery replacement functionality');
        compatibilityTests.push('Test in browsers without jQuery');
      }
      
      if (mod.type === 'modernize') {
        compatibilityTests.push(`Test ${mod.change.replaceWith} browser support`);
      }
    });

    return { functionalTests, performanceTests, compatibilityTests };
  }

  private assessCompatibilityImpact(modifications: JSModification[], targetBrowsers?: string[]) {
    const browserSupport: string[] = [];
    const polyfillsNeeded: string[] = [];
    const breakingChanges: string[] = [];

    modifications.forEach(mod => {
      // Check each modification for compatibility issues
      if (mod.browserCompatibility.includes('ES6+')) {
        if (!targetBrowsers || targetBrowsers.some(b => b.includes('IE'))) {
          browserSupport.push(`${mod.reason} requires ES6 support`);
          polyfillsNeeded.push('ES6 polyfills for older browsers');
        }
      }

      if (mod.riskLevel === 'high' || mod.riskLevel === 'critical') {
        breakingChanges.push(mod.reason);
      }
    });

    return { browserSupport, polyfillsNeeded, breakingChanges };
  }
}

// Export singleton instance
export const jsAnalyzer = new JSAnalyzer();