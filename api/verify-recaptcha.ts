// This file will be deployed as a Vercel Serverless Function
import type { VercelRequest, VercelResponse } from '@vercel/node'; // Add this if not already present

interface RecaptchaVerificationResponse {
  success: boolean;
  score: number;
  'error-codes'?: string[];
  action?: string;
  hostname?: string;
  challenge_ts?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { token } = req.body;
  console.log('Serverless function received request token: !', token);
  console.log('Secret Key:', process.env.RECAPTCHA_SECRET_KEY ? 'Set' : 'NOT SET'); // Log for debugging
  if (!token) {
    return res.status(400).json({ error: 'Missing reCAPTCHA token.' });
  }

  // Access the secret key from Vercel Environment Variables (added in Step 2)
  // IMPORTANT: No REACT_APP_ or VITE_ prefix here for server-side variables
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;

  if (!secretKey) {
    // This error indicates a misconfiguration in Vercel's environment variables
    console.error('RECAPTCHA_SECRET_KEY is not set in Vercel environment variables.');
    return res.status(500).json({ error: 'Server configuration error: reCAPTCHA secret key missing.' });
  }

  try {
    const googleResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `secret=${secretKey}&response=${token}`,
    });

    const data = (await googleResponse.json()) as RecaptchaVerificationResponse;

    // Optional: Add more stringent checks (e.g., expected action, minimum score)
    // if (data.action !== 'generate_number') { /* ... */ }
    // if (data.hostname !== req.headers.host) { /* ... */ } // Be careful with hostnames in serverless

    if (!data.success) {
      console.error('reCAPTCHA verification failed by Google:', data['error-codes']);
    }

    return res.status(200).json({
      success: data.success,
      score: data.score,
      errorCodes: data['error-codes'] || [],
    });

  } catch (error) {
    console.error('Error in reCAPTCHA serverless function:', error);
    return res.status(500).json({ error: 'Internal server error during reCAPTCHA verification.' });
  }
}