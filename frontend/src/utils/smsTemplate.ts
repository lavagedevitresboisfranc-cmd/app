/**
 * Centralized SMS templates for "Lavage de Vitres Bois-Franc" / Gexia360.
 *
 * All SMS messages sent through the app (via sms: links opened in the iOS
 * Messages app) get a consistent header and footer so the recipient knows
 * who's writing and the messages look professional.
 */

export const BUSINESS_NAME = 'Lavage de vitre Bois-Franc';
export const BUSINESS_PHONE = '514-570-9802';
export const APP_BRAND = 'Powered by Gexia360';

// Two-line title (mimics a "centered" header look in iMessage).
// We keep startsWith() detection working by exposing the legacy single-line.
export const SMS_HEADER_TITLE_LINE_1 = 'Lavage de vitre';
export const SMS_HEADER_TITLE_LINE_2 = 'Bois-Franc';
export const SMS_HEADER = `${SMS_HEADER_TITLE_LINE_1}\n${SMS_HEADER_TITLE_LINE_2}\n${BUSINESS_PHONE}\n\n`;
export const SMS_FOOTER = `\n\n— ${APP_BRAND}`;

/**
 * Wrap a message body with the standard SMS header and footer.
 * Idempotent: avoids double-wrapping if the body already starts with our header.
 */
export function wrapSms(body: string): string {
  const trimmed = (body || '').trim();
  if (!trimmed) return SMS_HEADER + SMS_FOOTER;
  // Detect already-wrapped messages (new 2-line title OR old single-line title)
  const alreadyWrapped =
    trimmed.startsWith(SMS_HEADER_TITLE_LINE_1) ||
    trimmed.startsWith('Lavage de Vitres Bois-Franc') ||
    trimmed.startsWith(BUSINESS_NAME);
  if (alreadyWrapped) {
    return trimmed.includes(APP_BRAND) ? trimmed : trimmed + SMS_FOOTER;
  }
  return SMS_HEADER + trimmed + SMS_FOOTER;
}
