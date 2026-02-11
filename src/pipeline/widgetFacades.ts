import * as cheerio from 'cheerio';
import type { OptimizationSettings } from '../shared/settingsSchema.js';

export interface WidgetFacadeResult {
  html: string;
  facadesApplied: number;
  scriptsRemoved: number;
}

// Chat widget detection and configuration
interface ChatWidgetConfig {
  name: string;
  detectionSelectors: string[];
  scriptPatterns: string[];  // CSS selectors for script tags
  inlineScriptPatterns: RegExp[];
  facadeColor: string;       // Brand color for the facade button
  configExtractor?: (html: string) => Record<string, string>;
}

const CHAT_WIDGETS: ChatWidgetConfig[] = [
  {
    name: 'intercom',
    detectionSelectors: ['#intercom-container', '.intercom-lightweight-app', '#intercom-frame'],
    scriptPatterns: ['script[src*="intercom"]', 'script[src*="intercomcdn"]'],
    inlineScriptPatterns: [/Intercom\s*\(/, /window\.intercomSettings/, /intercomSettings/],
    facadeColor: '#0071B2',
  },
  {
    name: 'drift',
    detectionSelectors: ['#drift-widget', '#drift-frame', '.drift-widget-container'],
    scriptPatterns: ['script[src*="drift"]', 'script[src*="js.driftt.com"]'],
    inlineScriptPatterns: [/drift\.load\s*\(/, /driftt\.com/],
    facadeColor: '#4C8BF5',
  },
  {
    name: 'zendesk',
    detectionSelectors: ['#ze-snippet', 'iframe[data-product="web_widget"]', '#launcher'],
    scriptPatterns: ['script[src*="zendesk"]', 'script#ze-snippet'],
    inlineScriptPatterns: [/zE\s*\(/, /zendesk/i],
    facadeColor: '#17494D',
  },
  {
    name: 'hubspot',
    detectionSelectors: ['#hubspot-messages-iframe-container', '#hubspot-conversations-inline-parent'],
    scriptPatterns: ['script[src*="hubspot"]', 'script[src*="hs-scripts"]'],
    inlineScriptPatterns: [/hbspt\./, /hs-script-loader/],
    facadeColor: '#FF7A59',
  },
  {
    name: 'livechat',
    detectionSelectors: ['#chat-widget-container'],
    scriptPatterns: ['script[src*="livechatinc.com"]', 'script[src*="livechat"]'],
    inlineScriptPatterns: [/LiveChatWidget/, /livechatinc\.com/],
    facadeColor: '#FF5100',
  },
  {
    name: 'tidio',
    detectionSelectors: ['#tidio-chat', '#tidio-chat-iframe'],
    scriptPatterns: ['script[src*="tidio"]', 'script[src*="tidiochat"]'],
    inlineScriptPatterns: [/tidioChatCode/, /tidio\.co/],
    facadeColor: '#0066FF',
  },
  {
    name: 'crisp',
    detectionSelectors: ['#crisp-chatbox', '.crisp-client'],
    scriptPatterns: ['script[src*="crisp"]', 'script[src*="client.crisp"]'],
    inlineScriptPatterns: [/\$crisp/, /crisp\.chat/],
    facadeColor: '#5D47FF',
  },
  {
    name: 'tawk',
    detectionSelectors: [],
    scriptPatterns: ['script[src*="embed.tawk.to"]', 'script[src*="tawk"]'],
    inlineScriptPatterns: [/Tawk_API/, /tawk\.to/],
    facadeColor: '#03A84E',
  },
  {
    name: 'olark',
    detectionSelectors: ['#habla_window_div', '#olark-box-wrapper'],
    scriptPatterns: ['script[src*="olark"]'],
    inlineScriptPatterns: [/olark\.identify/, /olark\.configure/],
    facadeColor: '#44C1F7',
  },
];

// Social embed detection
interface SocialEmbedConfig {
  name: string;
  detectionSelector: string;
  scriptSelector: string;
}

const SOCIAL_EMBEDS: SocialEmbedConfig[] = [
  {
    name: 'twitter',
    detectionSelector: 'blockquote.twitter-tweet',
    scriptSelector: 'script[src*="platform.twitter.com/widgets.js"]',
  },
  {
    name: 'instagram',
    detectionSelector: 'blockquote.instagram-media',
    scriptSelector: 'script[src*="instagram.com/embed.js"]',
  },
  {
    name: 'facebook',
    detectionSelector: '.fb-post, .fb-video, .fb-page',
    scriptSelector: 'script[src*="connect.facebook.net"]',
  },
];

/**
 * Generate a chat widget facade button.
 */
function generateChatFacade(widget: ChatWidgetConfig, originalScriptContent: string): string {
  return `
<div class="mls-chat-facade mls-chat-${widget.name}" style="position:fixed;bottom:20px;right:20px;z-index:999999;width:60px;height:60px;border-radius:50%;background:${widget.facadeColor};cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:transform 0.2s ease;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
  <svg width="28" height="28" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
  </svg>
</div>
<script>
(function() {
  var facade = document.querySelector('.mls-chat-${widget.name}');
  if (!facade) return;
  facade.addEventListener('click', function() {
    facade.remove();
    ${originalScriptContent}
  }, { once: true });
})();
</script>`.trim();
}

/**
 * Detect and replace heavy third-party widgets with CSS-only facades.
 * Respects video.googleMapsUseFacade and video.googleMapsStaticPreview for maps.
 */
export async function replaceWidgetEmbeds(html: string, settings?: OptimizationSettings): Promise<WidgetFacadeResult> {
  const $ = cheerio.load(html);
  let facadesApplied = 0;
  let scriptsRemoved = 0;

  // ── Chat Widgets ──
  for (const widget of CHAT_WIDGETS) {
    // Detect the widget
    let detected = false;

    // Check DOM selectors
    for (const selector of widget.detectionSelectors) {
      if ($(selector).length > 0) {
        detected = true;
        break;
      }
    }

    // Check script tags
    if (!detected) {
      for (const pattern of widget.scriptPatterns) {
        if ($(pattern).length > 0) {
          detected = true;
          break;
        }
      }
    }

    // Check inline scripts
    if (!detected) {
      $('script:not([src])').each((_, el): void | boolean => {
        const content = $(el).html() || '';
        for (const p of widget.inlineScriptPatterns) {
          if (p.test(content)) {
            detected = true;
            return false; // break cheerio each
          }
        }
      });
    }

    if (!detected) continue;

    // Collect the original script content for lazy loading
    let originalScriptContent = '';

    // Remove script tags
    for (const pattern of widget.scriptPatterns) {
      $(pattern).each((_, el) => {
        const src = $(el).attr('src');
        if (src) {
          originalScriptContent += `var s=document.createElement('script');s.src='${src}';document.body.appendChild(s);`;
        }
        $(el).remove();
        scriptsRemoved++;
      });
    }

    // Remove inline scripts
    $('script:not([src])').each((_, el) => {
      const content = $(el).html() || '';
      for (const p of widget.inlineScriptPatterns) {
        if (p.test(content)) {
          if (!originalScriptContent.includes('createElement')) {
            // Keep the inline script content for re-injection
            originalScriptContent += content;
          }
          $(el).remove();
          scriptsRemoved++;
          return;
        }
      }
    });

    // Remove widget DOM elements
    for (const selector of widget.detectionSelectors) {
      $(selector).remove();
    }

    // Inject facade
    $('body').append(generateChatFacade(widget, originalScriptContent));
    facadesApplied++;
  }

  // ── Social Embeds ──
  for (const embed of SOCIAL_EMBEDS) {
    const elements = $(embed.detectionSelector);
    if (elements.length === 0) continue;

    // Remove the embed script (the blockquote fallback content is kept)
    const scriptElements = $(embed.scriptSelector);
    scriptsRemoved += scriptElements.length;
    scriptElements.remove();

    // Style the blockquotes as cards
    elements.each((_, el) => {
      $(el).css({
        'border': '1px solid #e1e8ed',
        'border-radius': '12px',
        'padding': '16px',
        'margin': '16px 0',
        'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        'max-width': '550px',
      });
    });

    facadesApplied++;
  }

  // ── Google Maps (respect video.googleMapsUseFacade, video.googleMapsStaticPreview) ──
  const googleMapsUseFacade = settings?.video?.googleMapsUseFacade !== false;
  if (googleMapsUseFacade) {
    const mapIframes = $('iframe[src*="google.com/maps/embed"], iframe[src*="maps.google.com"]');
    const useStaticPreview = settings?.video?.googleMapsStaticPreview === true;

    if (mapIframes.length > 0) {
      mapIframes.each((_, iframe) => {
        const src = $(iframe).attr('src') || '';
        const width = $(iframe).attr('width') || '100%';
        const height = $(iframe).attr('height') || '450';

        // googleMapsStaticPreview: map-style gradient; otherwise: generic icon
        const placeholderHtml = useStaticPreview
          ? `<div style="width:100%;height:100%;background:linear-gradient(135deg,#e8e8e8 0%,#c8d4e0 50%,#d0d8e4 100%);display:flex;align-items:center;justify-content:center;"><svg width="48" height="48" viewBox="0 0 24 24" fill="#5a6a7a"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg><span style="margin-left:8px;color:#5a6a7a;font-size:14px;">Click to load map</span></div>`
          : `<div style="text-align:center;padding:20px;">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="#666" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>
    <p style="margin:8px 0 0;color:#666;font-size:14px;">Click to load interactive map</p>
  </div>`;

        const facadeHtml = `
<div class="mls-map-facade" data-original-src="${src.replace(/"/g, '&quot;')}" style="position:relative;width:${width};height:${height}px;max-width:100%;background:#e8e8e8;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;overflow:hidden;">
  ${placeholderHtml}
</div>
<script>
document.querySelectorAll('.mls-map-facade').forEach(function(el) {
  el.addEventListener('click', function() {
    var src = el.getAttribute('data-original-src');
    var iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.style.cssText = 'width:100%;height:100%;border:0;border-radius:8px;';
    iframe.loading = 'lazy';
    iframe.allowFullscreen = true;
    el.replaceWith(iframe);
  }, { once: true });
});
</script>`.trim();

        $(iframe).replaceWith(facadeHtml);
        facadesApplied++;
      });
    }
  }

  // ── Calendly ──
  const calendlyWidgets = $('.calendly-inline-widget, .calendly-badge-widget');
  if (calendlyWidgets.length > 0) {
    // Remove Calendly scripts
    $('script[src*="assets.calendly.com"]').each((_, el) => {
      $(el).remove();
      scriptsRemoved++;
    });

    calendlyWidgets.each((_, el) => {
      const dataUrl = $(el).attr('data-url') || '';
      $(el).replaceWith(`
<div class="mls-calendly-facade" style="text-align:center;padding:20px;">
  <a href="${dataUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 24px;background:#006BFF;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">
    Schedule a Meeting
  </a>
</div>`.trim());
      facadesApplied++;
    });
  }

  return {
    html: $.html(),
    facadesApplied,
    scriptsRemoved,
  };
}
