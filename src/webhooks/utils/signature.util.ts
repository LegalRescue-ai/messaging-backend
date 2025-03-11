import { createHmac } from 'crypto';

export const verifySignature = async (
  payload: any,
  signature: string,
  webhookSecret?: string,
): Promise<boolean> => {
  try {
    const secret = webhookSecret || process.env.SENDBIRD_WEBHOOK_SECRET || '';
    if (!secret) {
      throw new Error('Webhook secret not configured');
    }

    const hmac = createHmac('sha256', secret);
    const calculatedSignature = hmac
      .update(JSON.stringify(payload))
      .digest('hex');

    return calculatedSignature === signature;
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
};
