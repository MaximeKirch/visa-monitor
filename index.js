const axios = require('axios');
const cheerio = require('cheerio');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// --- CONFIGURATION DES CIBLES ---
const TARGETS = [
  {
    name: 'SWAP FR 🇫🇷',
    url: 'https://swap.ca/fr/products/canada-ro-nomination-whv',
    file: 'last_swap_fr.txt',
    type: 'SHOPIFY_ANDREA' // Stratégie Swap
  },
  {
    name: 'SWAP EN 🇬🇧',
    url: 'https://swap.ca/products/canada-ro-nomination-whv',
    file: 'last_swap_en.txt',
    type: 'SHOPIFY_ANDREA' // Stratégie Swap
  },
  {
    name: 'GO INTERNATIONAL 🇨🇦',
    url: 'https://gointernational.ca/product/ro-sponsored-launch-pad/',
    file: 'last_go_inter.txt',
    type: 'WOOCOMMERCE' // Nouvelle stratégie
  }
];

async function checkAllSites() {
  if (process.env.FORCE_EMAIL === 'true') {
    await sendNotification('TEST', 'TEST GLOBAL OK', 'N/A');
    return;
  }

  for (const site of TARGETS) {
    await checkOneSite(site);
  }
}

async function checkOneSite(site) {
  const filePath = path.join(__dirname, site.file);
  
  try {
    console.log(`🔍 [${site.name}] Analyse (${site.type})...`);
    
    const response = await axios.get(site.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' }
    });
    const $ = cheerio.load(response.data);
    let signature = "";

    // --- AIGUILLAGE DES STRATÉGIES ---

    if (site.type === 'SHOPIFY_ANDREA') {
      // 1. Logique SWAP (Script caché + Texte Update)
      let scriptContent = "SCRIPT NON TROUVÉ";
      $('script').each((i, el) => {
        const c = $(el).html() || "";
        if (c.includes('const redirects = {') && c.includes('canada-ro-nomination-whv')) {
          scriptContent = c.replace(/\s+/g, ' ').trim();
          return false;
        }
      });
      
      let updateText = "Info non trouvée";
      $('h3, h4, p, strong').each((i, el) => {
        const t = $(el).text().toLowerCase();
        if (t.includes('mise à jour') || t.includes('update')) {
          updateText = $(el).text().trim() + ' -> ' + $(el).next().text().trim();
          return false;
        }
      });

      signature = `SCRIPT LEN: ${scriptContent.length} | INFO: ${updateText}`;

    } else if (site.type === 'WOOCOMMERCE') {
      // 2. Logique GO INTERNATIONAL (JSON-LD + Bouton)
      
      // A. On cherche le JSON pour Google (Le plus fiable)
      let availability = "Non détecté dans le JSON";
      $('script[type="application/ld+json"]').each((i, el) => {
        try {
          const data = JSON.parse($(el).html());
          // Parfois c'est un tableau, parfois un objet (c'est le bazar les données structurées)
          const graphs = Array.isArray(data) ? data : (data['@graph'] || [data]);
          
          for (const item of graphs) {
            if (item['@type'] === 'Product' || item['@type'] === 'ProductGroup') {
              if (item.offers) {
                // On regarde l'offre (parfois c'est un tableau d'offres)
                const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
                availability = offer.availability || "Inconnu";
              }
            }
          }
        } catch (e) { /* Ignore les JSON mal formés */ }
      });

      // B. On cherche visuellement le stock (Backup)
      const stockText = $('.stock').text().trim() || "Pas de texte de stock";
      const hasAddToCart = $('button[name="add-to-cart"]').length > 0 ? "BOUTON PRÉSENT" : "BOUTON ABSENT";

      signature = `SCHEMA: ${availability} | TEXTE: ${stockText} | BTN: ${hasAddToCart}`;
    }

    console.log(`   👉 Signature : ${signature}`);

    // --- COMPARAISON ---
    let lastFingerprint = '';
    if (fs.existsSync(filePath)) {
      lastFingerprint = fs.readFileSync(filePath, 'utf8');
    }

    const normalize = (str) => str.replace(/\s+/g, ' ').trim();

    if (normalize(signature) !== normalize(lastFingerprint)) {
      console.log(`🚨 [${site.name}] CHANGEMENT !`);
      fs.writeFileSync(filePath, signature);

      if (lastFingerprint !== '') {
        await sendNotification(site.name, `La page a changé !\n\nÉtat : ${signature}`, site.url);
      } else {
        console.log(`✅ [${site.name}] Initialisé.`);
      }
    } else {
      console.log(`✅ [${site.name}] R.A.S.`);
    }

  } catch (error) {
    console.error(`❌ Erreur [${site.name}] :`, error.message);
  }
}

async function sendNotification(siteName, msg, url) {
  const destinataires = process.env.RECIPIENTS || process.env.GMAIL_USER;
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
  });

  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: process.env.GMAIL_USER,
    bcc: destinataires,
    subject: `🚨 ALERTE VISA (${siteName})`,
    text: `${msg}\n\nLIEN : ${url}`
  });
  console.log('Mail envoyé.');
}

checkAllSites();