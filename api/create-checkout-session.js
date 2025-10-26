// Serverless function for creating Stripe checkout sessions
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Função para detectar o país do cliente
function detectClientCountry(req) {
  // Tentar diferentes métodos de detecção
  
  // 1. Verificar header CF-IPCountry (Cloudflare)
  if (req.headers['cf-ipcountry']) {
    return req.headers['cf-ipcountry'].toUpperCase();
  }
  
  // 2. Verificar header X-Vercel-IP-Country (Vercel)
  if (req.headers['x-vercel-ip-country']) {
    return req.headers['x-vercel-ip-country'].toUpperCase();
  }
  
  // 3. Verificar header X-Country-Code
  if (req.headers['x-country-code']) {
    return req.headers['x-country-code'].toUpperCase();
  }
  
  // 4. Verificar header Accept-Language para inferir região
  const acceptLanguage = req.headers['accept-language'];
  if (acceptLanguage) {
    const languageMap = {
      'pt-br': 'BR', 'pt': 'PT', 'en-us': 'US', 'en-gb': 'GB', 'en': 'US',
      'es': 'ES', 'es-mx': 'MX', 'fr': 'FR', 'de': 'DE', 'it': 'IT',
      'nl': 'NL', 'pl': 'PL', 'ru': 'RU', 'ja': 'JP', 'ko': 'KR',
      'zh': 'CN', 'ar': 'SA', 'hi': 'IN', 'tr': 'TR', 'sv': 'SE',
      'no': 'NO', 'da': 'DK', 'fi': 'FI', 'cs': 'CZ', 'hu': 'HU',
      'ro': 'RO', 'bg': 'BG', 'hr': 'HR', 'sk': 'SK', 'sl': 'SI',
      'et': 'EE', 'lv': 'LV', 'lt': 'LT', 'el': 'GR', 'he': 'IL',
      'th': 'TH', 'vi': 'VN', 'id': 'ID', 'ms': 'MY', 'tl': 'PH'
    };
    
    const primaryLang = acceptLanguage.split(',')[0].split('-')[0].toLowerCase();
    if (languageMap[primaryLang]) {
      return languageMap[primaryLang];
    }
  }
  
  // 5. Fallback baseado na moeda se disponível
  const currency = req.body?.currency?.toLowerCase();
  const currencyCountryMap = {
    'usd': 'US', 'eur': 'DE', 'gbp': 'GB', 'brl': 'BR', 'cad': 'CA',
    'aud': 'AU', 'jpy': 'JP', 'cny': 'CN', 'krw': 'KR', 'inr': 'IN',
    'mxn': 'MX', 'ars': 'AR', 'clp': 'CL', 'cop': 'CO', 'pen': 'PE',
    'rub': 'RU', 'try': 'TR', 'pln': 'PL', 'czk': 'CZ', 'huf': 'HU',
    'ron': 'RO', 'bgn': 'BG', 'hrk': 'HR', 'sek': 'SE', 'nok': 'NO',
    'dkk': 'DK', 'chf': 'CH', 'nzd': 'NZ', 'zar': 'ZA', 'egp': 'EG',
    'aed': 'AE', 'sar': 'SA', 'qar': 'QA', 'kwd': 'KW', 'bhd': 'BH',
    'omr': 'OM', 'jod': 'JO', 'ils': 'IL', 'thb': 'TH', 'sgd': 'SG',
    'myr': 'MY', 'php': 'PH', 'idr': 'ID', 'vnd': 'VN', 'hkd': 'HK',
    'twd': 'TW', 'npr': 'NP', 'bdt': 'BD', 'lkr': 'LK', 'pkr': 'PK'
  };
  
  if (currency && currencyCountryMap[currency]) {
    return currencyCountryMap[currency];
  }
  
  // 6. Fallback padrão
  return 'US';
}

// Função para obter métodos de pagamento específicos por país
function getCountrySpecificMethods(country, currency, capabilities) {
  const methods = [];
  
  // Métodos por país
  const countryMethods = {
    // Europa
    'NL': ['ideal'],
    'BE': ['bancontact'],
    'DE': ['sofort', 'giropay'],
    'AT': ['eps'],
    'PL': ['p24', 'blik'],
    'CZ': ['eps'],
    'HU': ['eps'],
    'RO': ['eps'],
    'BG': ['eps'],
    'HR': ['eps'],
    'SK': ['eps'],
    'SI': ['eps'],
    'EE': ['eps'],
    'LV': ['eps'],
    'LT': ['eps'],
    'GR': ['eps'],
    'IT': ['eps'],
    'ES': ['eps'],
    'PT': ['eps'],
    'FR': ['eps'],
    'FI': ['eps'],
    'SE': ['eps'],
    'NO': ['eps'],
    'DK': ['eps'],
    'CH': ['eps'],
    
    // América do Norte
    'US': ['us_bank_account'],
    'CA': ['us_bank_account'],
    
    // América Latina
    'MX': ['oxxo'],
    'BR': ['boleto'],
    
    // Ásia
    'CN': ['alipay', 'wechat_pay'],
    'HK': ['alipay', 'wechat_pay'],
    'TW': ['alipay'],
    'SG': ['grabpay'],
    'MY': ['grabpay'],
    'TH': ['grabpay'],
    'PH': ['grabpay'],
    'ID': ['grabpay'],
    'VN': ['grabpay'],
    'JP': ['konbini'],
    'KR': ['kakaopay'],
    'IN': ['upi'],
    
    // Oriente Médio
    'AE': ['alipay'],
    'SA': ['alipay'],
    'QA': ['alipay'],
    'KW': ['alipay'],
    'BH': ['alipay'],
    'OM': ['alipay'],
    'JO': ['alipay'],
    'IL': ['alipay'],
    
    // África
    'ZA': ['alipay'],
    'EG': ['alipay'],
    
    // Oceania
    'AU': ['afterpay_clearpay'],
    'NZ': ['afterpay_clearpay']
  };
  
  // Adicionar métodos específicos do país se estiverem ativos
  if (countryMethods[country]) {
    for (const method of countryMethods[country]) {
      const capabilityKey = getCapabilityKey(method);
      if (capabilities[capabilityKey] === 'active') {
        methods.push(method);
      }
    }
  }
  
  // Métodos específicos por moeda
  if (currency === 'eur') {
    if (capabilities.sepa_debit_payments === 'active') {
      methods.push('sepa_debit');
    }
  }
  
  return methods;
}

// Função para mapear métodos de pagamento para suas capacidades
function getCapabilityKey(method) {
  const capabilityMap = {
    'ideal': 'ideal_payments',
    'bancontact': 'bancontact_payments',
    'sofort': 'sofort_payments',
    'giropay': 'giropay_payments',
    'eps': 'eps_payments',
    'p24': 'p24_payments',
    'blik': 'blik_payments',
    'us_bank_account': 'ach_direct_debit_payments',
    'oxxo': 'oxxo_payments',
    'boleto': 'boleto_payments',
    'alipay': 'alipay_payments',
    'wechat_pay': 'wechat_pay_payments',
    'grabpay': 'grabpay_payments',
    'konbini': 'konbini_payments',
    'kakaopay': 'kakaopay_payments',
    'upi': 'upi_payments',
    'afterpay_clearpay': 'afterpay_clearpay_payments',
    'sepa_debit': 'sepa_debit_payments'
  };
  
  return capabilityMap[method] || `${method}_payments`;
}

export default async function handler(req, res) {
  // Add CORS headers for Vercel
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get Stripe secret key from Supabase site_config or env
    let stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
    if (!stripeSecretKey) {
      const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
        return res.status(500).json({ error: 'Supabase not configured on server' });
      }
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
      const { data: cfg, error: cfgErr } = await supabase
        .from('site_config')
        .select('stripe_secret_key')
        .limit(1)
        .maybeSingle();
      if (cfgErr) {
        console.error('Error fetching Stripe secret key from Supabase:', cfgErr);
        return res.status(500).json({ error: 'Failed to fetch Stripe credentials from Supabase', details: cfgErr.message });
      }
      stripeSecretKey = cfg?.stripe_secret_key || '';
    }
    
    if (!stripeSecretKey) {
      return res.status(500).json({ error: 'Stripe secret key not configured' });
    }
    
    console.log('Stripe secret key found, initializing Stripe...');
    const stripe = new Stripe(stripeSecretKey);
    const { amount, currency = 'eur', name, success_url, cancel_url } = req.body;
    
    // Detectar país do cliente
    const clientCountry = detectClientCountry(req);
    console.log(`Client country detected: ${clientCountry}`);
    
    if (!amount || !success_url || !cancel_url) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Create a random product name from a list
    const productNames = [
      "Personal Development Ebook",
      "Financial Freedom Ebook",
      "Digital Marketing Guide",
      "Health & Wellness Ebook",
      "Productivity Masterclass",
      "Mindfulness & Meditation Guide",
      "Entrepreneurship Blueprint",
      "Wellness Program",
      "Success Coaching",
      "Executive Mentoring",
      "Learning Resources",
      "Online Course Access",
      "Premium Content Subscription",
      "Digital Asset Package"
    ];
    
    // Select a random product name
    const randomProductName = productNames[Math.floor(Math.random() * productNames.length)];
    
    // Verificar todos os métodos de pagamento ativos na conta Stripe
    let paymentMethodTypes = ['card']; // Card é sempre disponível
    
      try {
        const account = await stripe.accounts.retrieve();
      console.log('Account capabilities:', account.capabilities);
      
      if (account.capabilities) {
        // Verificar métodos de pagamento disponíveis baseado nas capacidades da conta
        const capabilities = account.capabilities;
        
        // Métodos de cartão e débito
        if (capabilities.card_payments === 'active') {
          paymentMethodTypes.push('card');
        }
        
        // Métodos específicos por país e moeda
        const countrySpecificMethods = getCountrySpecificMethods(clientCountry, currency.toLowerCase(), capabilities);
        paymentMethodTypes.push(...countrySpecificMethods);
        
        // Métodos globais
        if (capabilities.alipay_payments === 'active') {
          paymentMethodTypes.push('alipay');
        }
        if (capabilities.wechat_pay_payments === 'active') {
          paymentMethodTypes.push('wechat_pay');
        }
        if (capabilities.paypal_payments === 'active') {
          paymentMethodTypes.push('paypal');
        }
        if (capabilities.klarna_payments === 'active') {
          paymentMethodTypes.push('klarna');
        }
        if (capabilities.afterpay_clearpay_payments === 'active') {
          paymentMethodTypes.push('afterpay_clearpay');
        }
        if (capabilities.grabpay_payments === 'active') {
          paymentMethodTypes.push('grabpay');
        }
        if (capabilities.oxxo_payments === 'active') {
          paymentMethodTypes.push('oxxo');
        }
        if (capabilities.eps_payments === 'active') {
          paymentMethodTypes.push('eps');
        }
        if (capabilities.giropay_payments === 'active') {
          paymentMethodTypes.push('giropay');
        }
        if (capabilities.p24_payments === 'active') {
          paymentMethodTypes.push('p24');
        }
        if (capabilities.blik_payments === 'active') {
          paymentMethodTypes.push('blik');
        }
        if (capabilities.affirm_payments === 'active') {
          paymentMethodTypes.push('affirm');
        }
        if (capabilities.cashapp_payments === 'active') {
          paymentMethodTypes.push('cashapp');
        }
      }
      
      // Remover duplicatas e manter apenas métodos únicos
      paymentMethodTypes = [...new Set(paymentMethodTypes)];
      
    } catch (accountError) {
      console.warn('Error checking account capabilities:', accountError.message);
      // Em caso de erro, usar apenas card como fallback
      paymentMethodTypes = ['card'];
    }
    
    console.log(`Active payment methods for ${currency.toUpperCase()} (Country: ${clientCountry}):`, paymentMethodTypes);
    
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: paymentMethodTypes,
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: randomProductName,
            },
            unit_amount: Math.round(amount),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url,
      cancel_url,
    });

    res.status(200).json({ sessionId: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message });
  }
}