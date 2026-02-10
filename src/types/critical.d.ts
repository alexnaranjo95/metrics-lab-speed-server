declare module 'critical' {
  interface CriticalOptions {
    html?: string;
    src?: string;
    css?: string | string[];
    width?: number;
    height?: number;
    inline?: boolean;
    extract?: boolean;
    penthouse?: {
      timeout?: number;
      [key: string]: any;
    };
    [key: string]: any;
  }

  interface CriticalResult {
    html: string;
    css: string;
    uncritical: string;
  }

  export function generate(options: CriticalOptions): Promise<CriticalResult>;
}
