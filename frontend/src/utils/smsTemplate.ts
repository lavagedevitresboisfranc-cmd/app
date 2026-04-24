/**
 * Centralized SMS templates for "Lavage de Vitres Bois-Franc" / Gexia360.
 *
 * All SMS messages sent through the app (via sms: links opened in the iOS
 * Messages app) get a consistent header and footer so the recipient knows
 * who's writing and the messages look professional.
 */

export const BUSINESS_NAME = 'Lavage de Vitres Bois-Franc';
export const BUSINESS_PHONE = '514-570-9802';
export const APP_BRAND = 'Powered by Gexia360';

export const SMS_HEADER = `${BUSINESS_NAME}\n${BUSINESS_PHONE}\n\n`;
export const SMS_FOOTER = `\n\n— ${APP_BRAND}`;

/**
 * Wrap a message body with the standard SMS header and footer.
 * Idempotent: avoids double-wrapping if the body already starts with the
 * business name.
 */
export function wrapSms(body: string): string {
  const trimmed = (body || '').trim();
  if (!trimmed) return SMS_HEADER + SMS_FOOTER;
  if (trimmed.startsWith(BUSINESS_NAME)) {
    // Already includes our branding — just append footer if missing
    return trimmed.includes(APP_BRAND) ? trimmed : trimmed + SMS_FOOTER;
  }
  return SMS_HEADER + trimmed + SMS_FOOTER;
}
